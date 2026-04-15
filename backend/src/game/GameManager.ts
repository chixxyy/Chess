import {
  BoardState, Camp, GameStatus, Move, PieceType,
  parseFEN, generateFEN, INITIAL_FEN,
  getLegalMoves, applyMove, isInCheck, isCheckmate, getPiece
} from '@chinese-chess/shared';

// ─── 局勢評估表（棋子基礎分值） ────────────────────────────────────────────

const PIECE_VALUE: Record<PieceType, number> = {
  [PieceType.KING]:    10000,
  [PieceType.ROOK]:    900,
  [PieceType.CANNON]:  450,
  [PieceType.KNIGHT]:  400,
  [PieceType.PAWN]:    100,
  [PieceType.BISHOP]:  110,
  [PieceType.ADVISOR]: 110,
};

// 兵的位置分值加成（紅方視角，過河的兵更值錢）
const PAWN_BONUS_RED = [
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [10, 0, 10,  0, 10,  0, 10,  0, 10],
  [20,20, 20, 25, 30, 25, 20, 20, 20],
  [30,30, 35, 40, 45, 40, 35, 30, 30],
  [40,40, 45, 50, 55, 50, 45, 40, 40],
  [50,50, 55, 60, 65, 60, 55, 50, 50],
];

function evaluate(board: BoardState): number {
  let score = 0;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p) continue;
      let val = PIECE_VALUE[p.type];
      // 兵的位置加成
      if (p.type === PieceType.PAWN) {
        val += p.camp === Camp.RED
          ? (PAWN_BONUS_RED[y]?.[x] ?? 0)
          : (PAWN_BONUS_RED[9 - y]?.[8 - x] ?? 0);
      }
      score += p.camp === Camp.RED ? val : -val;
    }
  }
  return score;
}

// ─── Minimax + Alpha-Beta 剪枝 ───────────────────────────────────────────────

interface AiMove {
  from: { x: number; y: number };
  to: { x: number; y: number };
  score: number;
}

function minimax(
  board: BoardState,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean // true = RED, false = BLACK
): number {
  if (depth === 0) return evaluate(board);

  const camp = isMaximizing ? Camp.RED : Camp.BLACK;
  let hasAnyMove = false;

  if (isMaximizing) {
    let maxScore = -Infinity;
    outer:
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 9; x++) {
        const p = board[y][x];
        if (!p || p.camp !== camp) continue;
        const legalMoves = getLegalMoves(board, {x, y});
        for (const to of legalMoves) {
          hasAnyMove = true;
          const newBoard = applyMove(board, {x, y}, to);
          const score = minimax(newBoard, depth - 1, alpha, beta, false);
          maxScore = Math.max(maxScore, score);
          alpha = Math.max(alpha, score);
          if (beta <= alpha) break outer;
        }
      }
    }
    return hasAnyMove ? maxScore : (isInCheck(board, camp) ? -100000 : 0);
  } else {
    let minScore = Infinity;
    outer:
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 9; x++) {
        const p = board[y][x];
        if (!p || p.camp !== camp) continue;
        const legalMoves = getLegalMoves(board, {x, y});
        for (const to of legalMoves) {
          hasAnyMove = true;
          const newBoard = applyMove(board, {x, y}, to);
          const score = minimax(newBoard, depth - 1, alpha, beta, true);
          minScore = Math.min(minScore, score);
          beta = Math.min(beta, score);
          if (beta <= alpha) break outer;
        }
      }
    }
    return hasAnyMove ? minScore : (isInCheck(board, camp) ? 100000 : 0);
  }
}

function getBestMove(board: BoardState, camp: Camp, depth: number = 3): AiMove | null {
  const isMaximizing = camp === Camp.RED;
  let bestScore = isMaximizing ? -Infinity : Infinity;
  let best: AiMove | null = null;
  const allMoves: AiMove[] = [];

  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p || p.camp !== camp) continue;
      const legalMoves = getLegalMoves(board, {x, y});
      for (const to of legalMoves) {
        allMoves.push({ from: {x, y}, to, score: 0 });
      }
    }
  }

  if (allMoves.length === 0) return null;

  for (const move of allMoves) {
    const newBoard = applyMove(board, move.from, move.to);
    const score = minimax(newBoard, depth - 1, -Infinity, Infinity, !isMaximizing);
    move.score = score;
    if (isMaximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

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

  private history: { fen: string; turn: Camp; lastMove: Move | null; status: GameStatus; fullHistory: string[] }[] = [];

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
    this.saveState();
  }

  private saveState() {
    this.history.push({
      fen: this.fen,
      turn: this.turn,
      lastMove: this.lastMove ? { ...this.lastMove } : null,
      status: this.status,
      fullHistory: [...this.fullHistory]
    });
  }

  public undoMove(): boolean {
    // 每次悔棋退回一對（玩家與 AI 的一步）
    if (this.history.length < 3) return false;

    this.history.pop(); // 彈出當前 AI 走子後的狀態
    this.history.pop(); // 彈出玩家走子後的狀態
    const prevState = this.history[this.history.length - 1]; // 獲取上一個「等待玩家走子」的狀態

    if (!prevState) return false;

    this.fen = prevState.fen;
    this.board = parseFEN(this.fen);
    this.turn = prevState.turn;
    this.lastMove = prevState.lastMove;
    this.status = prevState.status;
    this.fullHistory = [...prevState.fullHistory];

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
    this.board = applyMove(this.board, from, to);
    this.fen = generateFEN(this.board);
    this.lastMove = {
      from, to,
      piece: piece.type,
      captured: captured?.type
    };

    // 更新走子歷史 (將座標與棋子轉換為直觀中文)
    const PIECE_NAME_MAP: any = { k: '將', a: '士', b: '象', n: '馬', r: '車', c: '炮', p: '兵' };
    const pName = PIECE_NAME_MAP[piece.type] || piece.type;
    const fromStr = `${String.fromCharCode(65 + from.x)}${10 - from.y}`;
    const toStr = `${String.fromCharCode(65 + to.x)}${10 - to.y}`;
    const captureStr = captured ? ` (吃${PIECE_NAME_MAP[captured.type] || captured.type})` : '';
    this.fullHistory.push(`${pName} ${fromStr}→${toStr}${captureStr}`);


    // 切換回合

    const next = this.turn === Camp.RED ? Camp.BLACK : Camp.RED;
    this.turn = next; // 始終切換回合

    if (isCheckmate(this.board, next)) {
      this.status = GameStatus.CHECKMATE;
    } else if (isInCheck(this.board, next)) {
      this.status = GameStatus.CHECK;
    } else {
      this.status = GameStatus.PLAYING;
    }

    this.saveState();
    return true;
  }


  /**
   * 讓 AI（黑方）計算並執行一步棋，返回是否成功
   */
  public makeAiMove(): boolean {
    if (this.status !== GameStatus.PLAYING && this.status !== GameStatus.CHECK) return false;
    const aiCamp = this.turn; // AI 目前的回合
    const best = getBestMove(this.board, aiCamp, 3);
    if (!best) {
      this.status = GameStatus.CHECKMATE;
      return false;
    }
    return this.makeMove(best.from, best.to);
  }
}
