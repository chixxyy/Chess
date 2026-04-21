import {
  BoardState, Camp, GameStatus, Move, PieceType,
  parseFEN, generateFEN, INITIAL_FEN,
  getLegalMoves, applyMove, isInCheck, isCheckmate, getPiece
} from '../../../shared';
import { Worker } from 'worker_threads';
import path from 'path';
import { AiStrategy, AI_STRATEGIES, AiMove } from './aiEngine';

// ─── GameManager ─────────────────────────────────────────────────────────────

export class GameManager {
  public gameId: string;
  public board: BoardState;
  public fen: string;
  public turn: Camp;
  public status: GameStatus;
  public humanCamp: Camp;
  public lastMove: Move | null = null;
  public fullHistory: string[] = [];
  public capturedPieces: { [Camp.RED]: PieceType[]; [Camp.BLACK]: PieceType[] } = { [Camp.RED]: [], [Camp.BLACK]: [] };
  public winner: Camp | 'DRAW' | null = null;
  public strategy: AiStrategy = AI_STRATEGIES[0];

  private history: {
    fen: string;
    turn: Camp;
    lastMove: Move | null;
    status: GameStatus;
    fullHistory: string[];
    capturedPieces: { [Camp.RED]: PieceType[]; [Camp.BLACK]: PieceType[] };
    winner: Camp | 'DRAW' | null;
    strategy: AiStrategy;
  }[] = [];
  private positionCount = new Map<string, number>();
  // history 最多保留 60 個狀態（30 回合），防止記憶體膨脹及性能下降
  private readonly MAX_HISTORY = 60;

  constructor(gameId: string, humanCamp: Camp = Camp.RED) {
    this.gameId = gameId;
    this.humanCamp = humanCamp;
    this.board = parseFEN(INITIAL_FEN);
    this.fen = INITIAL_FEN;
    this.turn = Camp.RED;
    this.lastMove = null;
    this.status = GameStatus.WAITING;
    this.history = [];
    this.fullHistory = [];
    this.strategy = AI_STRATEGIES[0];
  }

  public init(humanCamp: Camp = Camp.RED) {
    this.humanCamp = humanCamp;
    this.board = parseFEN(INITIAL_FEN);
    this.fen = INITIAL_FEN;
    this.turn = Camp.RED;
    this.lastMove = null;
    this.status = GameStatus.PLAYING;
    this.history = [];
    this.fullHistory = [];
    this.capturedPieces = { [Camp.RED]: [], [Camp.BLACK]: [] };
    this.winner = null;
    this.positionCount = new Map();

    // 隨機抽選 AI 性格
    this.strategy = AI_STRATEGIES[Math.floor(Math.random() * AI_STRATEGIES.length)];

    this.saveState();
  }

  private saveState() {
    this.history.push({
      fen: this.fen,
      turn: this.turn,
      lastMove: this.lastMove ? { ...this.lastMove } : null,
      status: this.status,
      fullHistory: [...this.fullHistory],
      capturedPieces: {
        [Camp.RED]: [...this.capturedPieces[Camp.RED]],
        [Camp.BLACK]: [...this.capturedPieces[Camp.BLACK]]
      },
      winner: this.winner,
      strategy: this.strategy
    });
    // 防止 history 無限增長導致記憶體膨脹及性能下降
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }
  }

  public undoMove(): boolean {
    const isHuman = this.isHumanTurn;
    const popCount = isHuman ? 2 : 1;

    if (this.history.length <= popCount) return false;

    for (let i = 0; i < popCount; i++) {
      this.history.pop();
    }

    const prevState = this.history[this.history.length - 1];
    if (!prevState) return false;

    this.fen = prevState.fen;
    this.board = parseFEN(this.fen);
    this.turn = prevState.turn;
    this.lastMove = prevState.lastMove;
    this.status = prevState.status;
    this.fullHistory = [...prevState.fullHistory];
    this.capturedPieces = {
      [Camp.RED]: [...prevState.capturedPieces[Camp.RED]],
      [Camp.BLACK]: [...prevState.capturedPieces[Camp.BLACK]]
    };
    this.winner = prevState.winner;
    this.strategy = prevState.strategy;

    // 重新計算重複局面計數器：根據剩下的歷史記錄重建 Map
    this.positionCount.clear();
    for (const h of this.history) {
      const key = `${h.fen}:${h.turn}`;
      this.positionCount.set(key, (this.positionCount.get(key) ?? 0) + 1);
    }

    return true;
  }

  public get isHumanTurn(): boolean {
    return this.turn === this.humanCamp;
  }

  public makeMove(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
    if (this.status !== GameStatus.PLAYING && this.status !== GameStatus.CHECK) return false;

    const piece = getPiece(this.board, from);
    if (!piece || piece.camp !== this.turn) return false;

    const legal = getLegalMoves(this.board, from);
    const isLegal = legal.some(pos => pos.x === to.x && pos.y === to.y);
    if (!isLegal) return false;

    const captured = getPiece(this.board, to);
    if (captured) {
      this.capturedPieces[captured.camp].push(captured.type);
    }
    this.board = applyMove(this.board, from, to);
    this.fen = generateFEN(this.board);
    this.lastMove = {
      from, to,
      piece: piece.type,
      captured: captured?.type
    };

    // 更新走子歷史
    const PIECE_NAME_MAP: any = { k: '將', a: '士', b: '象', n: '馬', r: '車', c: '炮', p: '兵' };
    const pName = PIECE_NAME_MAP[piece.type] || piece.type;
    const fromStr = `${String.fromCharCode(65 + from.x)}${10 - from.y}`;
    const toStr = `${String.fromCharCode(65 + to.x)}${10 - to.y}`;
    const captureStr = captured ? ` (吃${PIECE_NAME_MAP[captured.type] || captured.type})` : '';
    this.fullHistory.push(`${pName} ${fromStr}→${toStr}${captureStr}`);

    // 切換回合
    const next = this.turn === Camp.RED ? Camp.BLACK : Camp.RED;
    this.turn = next;

    // 重複局面判斷：同一局面出現 3 次則和棋（簡化版長將/長捉規則）
    const posKey = `${this.fen}:${this.turn}`;
    const repCount = (this.positionCount.get(posKey) ?? 0) + 1;
    this.positionCount.set(posKey, repCount);
    if (repCount >= 3) {
      this.status = GameStatus.CHECKMATE;
      this.winner = 'DRAW';
      this.saveState();
      return true;
    }

    if (isCheckmate(this.board, next)) {
      this.status = GameStatus.CHECKMATE;
      this.winner = next === Camp.RED ? Camp.BLACK : Camp.RED;
    } else if (isInCheck(this.board, next)) {
      this.status = GameStatus.CHECK;
    } else {
      this.status = GameStatus.PLAYING;
    }

    this.saveState();
    return true;
  }

  /**
   * 讓 AI 計算並執行一步棋，在 Worker Thread 中非同步執行，不阻塞主線程
   */
  public makeAiMove(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.status !== GameStatus.PLAYING && this.status !== GameStatus.CHECK) {
        resolve(false);
        return;
      }

      const aiCamp = this.turn;
      const workerPath = path.join(__dirname, 'aiWorker.ts');

      const worker = new Worker(
        // ts-node 專用的 Worker 啟動方式（eval 模式）
        `require('ts-node/register'); require('tsconfig-paths/register'); require(${JSON.stringify(workerPath)})`,
        {
          eval: true,
          workerData: {
            fen: this.fen,
            camp: aiCamp,
            strategy: this.strategy
          }
        }
      );

      worker.once('message', (best: AiMove | null) => {
        if (!best) {
          this.status = GameStatus.CHECKMATE;
          this.winner = aiCamp === Camp.RED ? Camp.BLACK : Camp.RED;
          this.saveState();
          resolve(false);
          return;
        }
        resolve(this.makeMove(best.from, best.to));
      });

      worker.once('error', (err) => {
        console.error('[aiWorker] error:', err);
        resolve(false);
      });

      worker.once('exit', (code) => {
        if (code !== 0) {
          console.error(`[aiWorker] exited with code ${code}`);
          resolve(false);
        }
      });
    });
  }

}
