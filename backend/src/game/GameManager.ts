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

  /**
   * 讓 AI 計算並執行一步棋，在 Worker Thread 中非同步執行
   * - settled flag：防止 message/error/exit 事件競爭，確保 resolve 只執行一次
   * - 超時保護：Worker 沉默超過上限，強制切換主線程，永不卡死
   */
  public makeAiMove(): Promise<boolean> {
    return new Promise(async (resolve) => {
      if (this.status !== GameStatus.PLAYING && this.status !== GameStatus.CHECK) {
        resolve(false);
        return;
      }

      const aiCamp = this.turn;
      const maxWait = (this.strategy.searchDepth >= 9 ? 20000 : 15000) + 8000;

      // settled flag：確保只 resolve 一次
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimeout);
        fn();
      };

      // 硬性超時：Worker 沉默就強制 fallback
      const hardTimeout = setTimeout(() => {
        settle(() => {
          console.error(`[aiWorker] timeout after ${maxWait}ms, falling back to main thread`);
          this.fallbackAiMove(aiCamp).then(resolve);
        });
      }, maxWait);

      try {
        const isTS = __filename.endsWith('.ts');
        const workerPath = path.join(__dirname, `aiWorker${isTS ? '.ts' : '.js'}`);

        const worker = new Worker(
          isTS
            ? `require('ts-node/register'); require('tsconfig-paths/register'); require(${JSON.stringify(workerPath)})`
            : workerPath,
          {
            eval: isTS,
            workerData: { fen: this.fen, camp: aiCamp, strategy: this.strategy, moveCount: this.history.length }
          }
        );

        worker.once('message', (best: AiMove | null) => {
          settle(() => {
            worker.terminate();
            if (!best) {
              this.status = GameStatus.CHECKMATE;
              this.winner = aiCamp === Camp.RED ? Camp.BLACK : Camp.RED;
              this.saveState();
              resolve(false);
            } else {
              resolve(this.makeMove(best.from, best.to));
            }
          });
        });

        worker.once('error', (err) => {
          console.error('[aiWorker] error, falling back to main thread:', err);
          settle(() => {
            worker.terminate();
            this.fallbackAiMove(aiCamp).then(resolve);
          });
        });

        // terminate() 也會觸發 exit，settled 保護不會重複 fallback
        worker.once('exit', (code) => {
          if (code !== 0) {
            settle(() => {
              console.error(`[aiWorker] exited with code ${code}, falling back`);
              this.fallbackAiMove(aiCamp).then(resolve);
            });
          }
        });

      } catch (err) {
        console.error('[Worker Creation] failed, falling back to main thread:', err);
        settle(() => this.fallbackAiMove(aiCamp).then(resolve));
      }
    });
  }

  /**
   * 主線程回退計算 (當 Worker 無法運作時)
   */
  private async fallbackAiMove(aiCamp: Camp): Promise<boolean> {
    const best = getBestMove(this.board, aiCamp, this.strategy, this.history.length);
    if (!best) {
      this.status = GameStatus.CHECKMATE;
      this.winner = aiCamp === Camp.RED ? Camp.BLACK : Camp.RED;
      this.saveState();
      return false;
    }
    return this.makeMove(best.from, best.to);
  }

}
