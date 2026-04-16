import {
  BoardState, Camp, GameStatus, Move, PieceType,
  parseFEN, generateFEN, INITIAL_FEN,
  getLegalMoves, applyMove, isInCheck, isCheckmate, getPiece
} from '@chinese-chess/shared';

// ─── AI 作戰風格與權重定義 ───────────────────────────────────────────────

export interface AiStrategy {
  name: string;
  weights: Record<PieceType, number>;
  pawnBonus: number[][];
  attackBonus: number;   // 越過河界的額外獎勵 (鼓勵進攻)
  defenseBonus: number;  // 留在己方九宮格附近的獎勵 (鼓勵守備)
  searchDepth: number;   // 性格對應的思考深度 (模擬衝動 vs 深算)
}

const STANDARD_PAWN_BONUS = [
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

const AI_STRATEGIES: AiStrategy[] = [
  {
    name: '穩定平衡',
    weights: { [PieceType.KING]: 10000, [PieceType.ROOK]: 900, [PieceType.CANNON]: 450, [PieceType.KNIGHT]: 400, [PieceType.PAWN]: 100, [PieceType.BISHOP]: 110, [PieceType.ADVISOR]: 110 },
    pawnBonus: STANDARD_PAWN_BONUS,
    attackBonus: 10,
    defenseBonus: 10,
    searchDepth: 3
  },
  {
    name: '狂暴強襲',
    weights: { [PieceType.KING]: 10000, [PieceType.ROOK]: 1200, [PieceType.CANNON]: 550, [PieceType.KNIGHT]: 450, [PieceType.PAWN]: 200, [PieceType.BISHOP]: 80, [PieceType.ADVISOR]: 80 },
    pawnBonus: STANDARD_PAWN_BONUS.map(row => row.map(v => v * 2)),
    attackBonus: 60,      // 極高過河獎勵
    defenseBonus: -10,    // 甚至會扣分 (視死如歸)
    searchDepth: 2        // 較淺深度 (模擬衝動)
  },
  {
    name: '鐵壁守備',
    weights: { [PieceType.KING]: 18000, [PieceType.ROOK]: 850, [PieceType.CANNON]: 400, [PieceType.KNIGHT]: 380, [PieceType.PAWN]: 80, [PieceType.BISHOP]: 300, [PieceType.ADVISOR]: 300 },
    pawnBonus: STANDARD_PAWN_BONUS,
    attackBonus: -5,
    defenseBonus: 50,     // 極高護主獎勵
    searchDepth: 4        // 極端深度 (老謀深算)
  },
  {
    name: '遠程砲戰',
    weights: { [PieceType.KING]: 10000, [PieceType.ROOK]: 850, [PieceType.CANNON]: 900, [PieceType.KNIGHT]: 350, [PieceType.PAWN]: 100, [PieceType.BISHOP]: 120, [PieceType.ADVISOR]: 120 },
    pawnBonus: STANDARD_PAWN_BONUS,
    attackBonus: 20,
    defenseBonus: 5,
    searchDepth: 3
  },
  {
    name: '詭變馬戰',
    weights: { [PieceType.KING]: 10000, [PieceType.ROOK]: 850, [PieceType.CANNON]: 400, [PieceType.KNIGHT]: 850, [PieceType.PAWN]: 100, [PieceType.BISHOP]: 120, [PieceType.ADVISOR]: 120 },
    pawnBonus: STANDARD_PAWN_BONUS,
    attackBonus: 25,
    defenseBonus: 5,
    searchDepth: 3
  }
];

function evaluate(board: BoardState, strategy: AiStrategy): number {
  let score = 0;
  for (let yIdx = 0; yIdx < 10; yIdx++) {
    for (let xIdx = 0; xIdx < 9; xIdx++) {
      const p = board[yIdx][xIdx];
      if (!p) continue;
      
      let val = strategy.weights[p.type];

      // 1. 位置加成：過河獎勵 (Attack Bonus)
      const isRed = p.camp === Camp.RED;
      const isOverRiver = isRed ? yIdx >= 5 : yIdx <= 4;
      if (isOverRiver && p.type !== PieceType.KING) {
        val += strategy.attackBonus;
      }

      // 2. 位置加成：九宮格守備獎勵 (Defense Bonus)
      // 九宮格：x 3..5, y 0..2 (黑) 或 7..9 (紅)
      const isNearPalace = (p.camp === Camp.RED && yIdx >= 7 && xIdx >= 3 && xIdx <= 5) ||
                          (p.camp === Camp.BLACK && yIdx <= 2 && xIdx >= 3 && xIdx <= 5);
      if (isNearPalace && p.type !== PieceType.KING) {
        val += strategy.defenseBonus;
      }

      // 3. 兵的特殊位置加成
      if (p.type === PieceType.PAWN) {
        val += isRed
          ? (strategy.pawnBonus[yIdx]?.[xIdx] ?? 0)
          : (strategy.pawnBonus[9 - yIdx]?.[8 - xIdx] ?? 0);
      }
      
      score += isRed ? val : -val;
    }
  }
  // 加入較大隨機性 (±30分)，使決策更具多樣性
  return score + (Math.random() * 60 - 30);
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
  isMaximizing: boolean,
  strategy: AiStrategy
): number {
  if (depth === 0) return evaluate(board, strategy);

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
          const score = minimax(newBoard, depth - 1, alpha, beta, false, strategy);
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
          const score = minimax(newBoard, depth - 1, alpha, beta, true, strategy);
          minScore = Math.min(minScore, score);
          beta = Math.min(beta, score);
          if (beta <= alpha) break outer;
        }
      }
    }
    return hasAnyMove ? minScore : (isInCheck(board, camp) ? 100000 : 0);
  }
}

function getBestMove(board: BoardState, camp: Camp, strategy: AiStrategy): AiMove | null {
  const isMaximizing = camp === Camp.RED;
  let bestScore = isMaximizing ? -Infinity : Infinity;
  let best: AiMove | null = null;
  const allMoves: AiMove[] = [];
  const depth = strategy.searchDepth;

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
    const score = minimax(newBoard, depth - 1, -Infinity, Infinity, !isMaximizing, strategy);
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
    this.strategy = AI_STRATEGIES[0]; // 預設平衡
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
  }




  public undoMove(): boolean {
    // 根據當前回合判定退回步數
    // 如果現在是 AI 回合 (isHumanTurn 為 false)，說明玩家剛動完，我們只需退回 1 步 (回到玩家動手前)
    // 如果現在是玩家回合 (isHumanTurn 為 true)，說明 AI 剛動完，我們需退回 2 步 (回到玩家上一次動作前)
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
      // 被吃的棋子放入其屬方陣營的「遺失清單」中
      this.capturedPieces[captured.camp].push(captured.type);
    }
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
      this.winner = next === Camp.RED ? Camp.BLACK : Camp.RED; // 被將死的人輸了
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
    const best = getBestMove(this.board, aiCamp, this.strategy);
    if (!best) {
      this.status = GameStatus.CHECKMATE;
      this.winner = aiCamp === Camp.RED ? Camp.BLACK : Camp.RED; // AI 沒棋走了
      this.saveState();
      return false;
    }
    return this.makeMove(best.from, best.to);
  }

}
