import {
  BoardState, Camp, GameStatus, Move, PieceType,
  parseFEN, generateFEN, INITIAL_FEN,
  getLegalMoves, applyMove, isInCheck, isCheckmate, getPiece
} from '../../../shared/index';
import { Worker } from 'worker_threads';
import path from 'path';
import { AiStrategy, AI_STRATEGIES, AiMove, getBestMove } from './aiEngine';
import { db, GameState } from './db';

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
  private currentWorker: Worker | null = null;

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
    // 隨機抽選 AI 性格
    this.strategy = AI_STRATEGIES[Math.floor(Math.random() * AI_STRATEGIES.length)];

    this.saveState();
  }

  /**
   * 轉換為純資料狀態用於持久化
   */
  public toState(): GameState {
    return {
      id: this.gameId,
      fen: this.fen,
      turn: this.turn,
      status: this.status,
      humanCamp: this.humanCamp,
      lastMove: this.lastMove,
      fullHistory: [...this.fullHistory],
      capturedPieces: JSON.parse(JSON.stringify(this.capturedPieces)),
      winner: this.winner,
      strategy: this.strategy,
      history: JSON.parse(JSON.stringify(this.history)),
      lastUpdate: Date.now()
    };
  }

  /**
   * 從保存的狀態重建 GameManager
   */
  public static fromState(state: any): GameManager {
    const gm = new GameManager(state.id || state.gameId, state.humanCamp);
    gm.board = parseFEN(state.fen);
    gm.fen = state.fen;
    gm.turn = state.turn;
    gm.status = state.status;
    gm.lastMove = state.lastMove;
    gm.fullHistory = state.fullHistory || [];
    gm.capturedPieces = state.capturedPieces || { [Camp.RED]: [], [Camp.BLACK]: [] };
    gm.winner = state.winner;
    gm.strategy = state.strategy;
    gm.history = state.history || [];
    return gm;
  }

  public saveState() {
    // 1. 存入本地悔棋歷史 (限制最大長度)
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
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }

    // 2. 異步同步到 Redis 雲端
    db.saveGame(this.toState()).catch(err => console.error('[GameManager] Redis save failed:', err));
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
    const isLegal = legal.some((pos: any) => pos.x === to.x && pos.y === to.y);
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

  public makeAiMove(onMove?: () => void): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.status !== GameStatus.PLAYING && this.status !== GameStatus.CHECK) {
        resolve(false);
        return;
      }

      console.log(`[AI] Thinking... (Strategy: ${this.strategy.name})`);
      
      const isTS = __filename.endsWith('.ts');
      const ext = isTS ? '.ts' : '.js';
      let workerPath = path.resolve(__dirname, `aiWorker${ext}`);
      
      console.log(`[AI] Environment: ${isTS ? 'Development' : 'Production'}`);
      console.log(`[AI] Looking for worker at: ${workerPath}`);
      
      if (!require('fs').existsSync(workerPath)) {
        console.error(`[AI] ERROR: Worker file not found at ${workerPath}`);
        resolve(false);
        return;
      }

      try {
        const worker = new Worker(
          isTS 
            ? `require('ts-node/register'); require(${JSON.stringify(workerPath)})` 
            : workerPath,
          {
            eval: isTS,
            workerData: {
              fen: this.fen,
              camp: this.turn,
              strategy: this.strategy,
              moveCount: this.fullHistory.length
            }
          }
        );
        this.currentWorker = worker;

        worker.once('message', (best: AiMove | null) => {
          console.log('[AI] Message received');
          this.currentWorker = null;
          worker.terminate();
          if (best) {
            const success = this.makeMove(best.from, best.to);
            if (onMove) onMove();
            resolve(success);
          } else {
            resolve(false);
          }
        });

        worker.on('error', (err) => {
          console.error('[AI] Worker Error, falling back to main thread:', err);
          this.currentWorker = null;
          worker.terminate();
          // 回退到主線程計算
          const best = getBestMove(parseFEN(this.fen), this.turn, this.strategy, this.fullHistory.length);
          if (best) {
            this.makeMove(best.from, best.to);
            if (onMove) onMove();
            resolve(true);
          } else {
            resolve(false);
          }
        });

        worker.on('exit', (code) => {
          // code 1 通常是我們手動 terminate() 導致的，在 Worker 中是正常的
          if (code !== 0 && code !== 1) console.error(`[AI] Worker exited with unexpected code: ${code}`);
        });
      } catch (err) {
        console.error('[AI] Failed to start worker:', err);
        resolve(false);
      }
    });
  }

  public stopAi() {
    if (this.currentWorker) {
      console.log('[AI] Stopping worker explicitly');
      this.currentWorker.terminate();
      this.currentWorker = null;
    }
  }

}
