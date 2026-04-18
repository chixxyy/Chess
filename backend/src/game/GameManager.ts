import {
  BoardState, Camp, GameStatus, Move, PieceType,
  parseFEN, generateFEN, INITIAL_FEN,
  getLegalMoves, applyMove, isInCheck, isCheckmate, getPiece
} from '../../../shared';

// ─── AI 作戰風格與權重定義 ───────────────────────────────────────────────

export interface AiStrategy {
  name: string;
  weights: Record<PieceType, number>;
  pawnBonus: number[][];
  attackBonus: number;   // 越過河界的額外獎勵 (鼓勵進攻)
  defenseBonus: number;  // 留在己方九宮格附近的獎勵 (鼓勵守備)
  searchDepth: number;   // 性格對應的思考深度
  level: string;         // 難度等級標記
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
    level: '高手',
    weights: { [PieceType.KING]: 10000, [PieceType.ROOK]: 900, [PieceType.CANNON]: 450, [PieceType.KNIGHT]: 400, [PieceType.PAWN]: 100, [PieceType.BISHOP]: 110, [PieceType.ADVISOR]: 110 },
    pawnBonus: STANDARD_PAWN_BONUS,
    attackBonus: 10,
    defenseBonus: 10,
    searchDepth: 5
  },
  {
    name: '鐵壁守備',
    level: '學者',
    weights: { [PieceType.KING]: 18000, [PieceType.ROOK]: 850, [PieceType.CANNON]: 400, [PieceType.KNIGHT]: 380, [PieceType.PAWN]: 80, [PieceType.BISHOP]: 300, [PieceType.ADVISOR]: 300 },
    pawnBonus: STANDARD_PAWN_BONUS,
    attackBonus: -5,
    defenseBonus: 50,
    searchDepth: 6
  },
  {
    name: '狂暴強襲',
    level: '大師',
    weights: { [PieceType.KING]: 10000, [PieceType.ROOK]: 1200, [PieceType.CANNON]: 550, [PieceType.KNIGHT]: 450, [PieceType.PAWN]: 200, [PieceType.BISHOP]: 80, [PieceType.ADVISOR]: 80 },
    pawnBonus: STANDARD_PAWN_BONUS.map(row => row.map(v => v * 2)),
    attackBonus: 60,
    defenseBonus: -10,
    searchDepth: 7
  },
  {
    name: '萬卒齊發',
    level: '宗師',
    weights: { [PieceType.KING]: 10000, [PieceType.ROOK]: 800, [PieceType.CANNON]: 400, [PieceType.KNIGHT]: 350, [PieceType.PAWN]: 350, [PieceType.BISHOP]: 120, [PieceType.ADVISOR]: 120 },
    pawnBonus: STANDARD_PAWN_BONUS.map(row => row.map(v => v * 3)),
    attackBonus: 15,
    defenseBonus: 10,
    searchDepth: 9
  },
  {
    name: '絕世魔王',
    level: '至尊',
    weights: { [PieceType.KING]: 100000, [PieceType.ROOK]: 1200, [PieceType.CANNON]: 600, [PieceType.KNIGHT]: 650, [PieceType.PAWN]: 150, [PieceType.BISHOP]: 150, [PieceType.ADVISOR]: 150 },
    pawnBonus: STANDARD_PAWN_BONUS.map(row => row.map(v => v * 1.5)),
    attackBonus: 40,
    defenseBonus: 30,
    searchDepth: 10
  }
];

const PST: Record<string, number[][]> = {
  [PieceType.KNIGHT]: [
    [-10, -10, -10, -10, -10, -10, -10, -10, -10],
    [-10,  10,  20,  20,  10,  20,  20,  10, -10],
    [-10,  20,  35,  35,  30,  35,  35,  20, -10],
    [-10,  25,  40,  45,  45,  45,  40,  25, -10],
    [-10,  25,  45,  50,  55,  50,  45,  25, -10],
    [-10,  25,  45,  50,  55,  50,  45,  25, -10],
    [-10,  25,  40,  45,  45,  45,  40,  25, -10],
    [-10,  20,  30,  30,  30,  30,  30,  20, -10],
    [-10,  10,  20,  20,  10,  20,  20,  10, -10],
    [-10, -10, -10, -10, -10, -10, -10, -10, -10]
  ],
  [PieceType.CANNON]: [
    [ 10,  15,  20,  20,  20,  20,  20,  15,  10],
    [ 10,  20,  30,  40,  45,  40,  30,  20,  10],
    [  0,  10,  20,  30,  35,  30,  20,  10,   0],
    [  0,   0,  10,  20,  25,  20,  10,   0,   0],
    [  0,   0,   0,   0,   0,   0,   0,   0,   0],
    [  0,   0,   0,   0,   0,   0,   0,   0,   0],
    [  0,   0,  10,  10,  10,  10,  10,   0,   0],
    [  0,  10,  20,  20,  20,  20,  20,  10,   0],
    [ 10,  20,  30,  30,  30,  30,  30,  20,  10],
    [ 10,  10,  10,  10,  10,  10,  10,  10,  10]
  ],
  [PieceType.ROOK]: [
    [ 20,  30,  30,  50,  60,  50,  30,  30,  20],
    [ 30,  40,  40,  50,  60,  50,  40,  40,  30],
    [ 20,  30,  30,  40,  45,  40,  30,  30,  20],
    [ 20,  30,  30,  40,  45,  40,  30,  30,  20],
    [ 10,  20,  20,  30,  35,  30,  20,  20,  10],
    [ 10,  20,  20,  30,  35,  30,  20,  20,  10],
    [ 20,  30,  30,  40,  45,  40,  30,  30,  20],
    [ 30,  40,  40,  50,  50,  50,  40,  40,  30],
    [ 30,  40,  40,  50,  60,  50,  40,  40,  30],
    [ 20,  30,  30,  50,  60,  50,  30,  30,  20]
  ]
};

function evaluate(board: BoardState, strategy: AiStrategy): number {
  let score = 0;
  for (let yIdx = 0; yIdx < 10; yIdx++) {
    for (let xIdx = 0; xIdx < 9; xIdx++) {
      const p = board[yIdx][xIdx];
      if (!p) continue;
      
      const isRed = p.camp === Camp.RED;
      let val = strategy.weights[p.type];

      // 1. 基礎子力價值
      score += isRed ? val : -val;

      // 2. 位置加成 (PST)
      const pstTable = PST[p.type];
      if (pstTable) {
        const pstVal = isRed ? pstTable[yIdx][xIdx] : pstTable[9 - yIdx][8 - xIdx];
        score += isRed ? pstVal : -pstVal;
      }

      // 3. 兵的特殊位置加成
      if (p.type === PieceType.PAWN) {
        val += isRed
          ? (strategy.pawnBonus[yIdx]?.[xIdx] ?? 0)
          : (strategy.pawnBonus[9 - yIdx]?.[8 - xIdx] ?? 0);
        score += isRed ? val : -val;
      }
      
      // 4. 改用預估機動性評分
      if (strategy.name === '絕世魔王' || strategy.name === '萬卒齊發') {
         const centerScore = (4 - Math.abs(4 - xIdx)) + (4.5 - Math.abs(4.5 - yIdx));
         score += isRed ? centerScore * 5 : -centerScore * 5;
      }
    }
  }
  return score;
}

/**
 * 著法排序：優先搜尋吃子、將軍等高價值動作，極大化 Alpha-Beta 剪枝效率
 */
function sortMoves(board: BoardState, moves: {from: any, to: any}[], isMaximizing: boolean): any[] {
  return moves.map(m => {
    let weight = 0;
    const attacker = getPiece(board, m.from);
    const victim = getPiece(board, m.to);
    
    // 1. MVV-LVA (Most Valuable Victim - Least Valuable Aggressor)
    if (victim) {
      const victimWeights: any = { k: 1000, r: 90, c: 45, n: 40, p: 10, b: 11, a: 11 };
      const attackerWeights: any = { k: 1, r: 9, c: 4.5, n: 4, p: 1, b: 1, a: 1 };
      weight += 100 + (victimWeights[victim.type] - attackerWeights[attacker?.type || 'p']);
    }

    // 2. 歷史動作權重 (簡單處理：中心位置加分)
    const centerDist = Math.abs(4 - m.to.x) + Math.abs(4.5 - m.to.y);
    weight += (10 - centerDist);

    return { ...m, weight };
  }).sort((a, b) => b.weight - a.weight);
}



// ─── Minimax + Alpha-Beta 剪枝 ───────────────────────────────────────────────

interface AiMove {
  from: { x: number; y: number };
  to: { x: number; y: number };
  score: number;
}

// ─── 靜止搜尋 (Quiescence Search) ──────────────────────────────────
// 用於處理搜尋末端的劇烈波動（如吃子），防止地平線效應
function quiescenceSearch(board: BoardState, alpha: number, beta: number, camp: Camp, strategy: AiStrategy): number {
  const isRed = camp === Camp.RED;
  const standPat = evaluate(board, strategy);
  
  if (isRed) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
  }

  // 獲取所有合法走子並篩選出「吃子」著法
  const moves: AiMove[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p || p.camp !== camp) continue;
      const legal = getLegalMoves(board, {x, y});
      for (const to of legal) {
        if (getPiece(board, to)) { // 只看吃子
          moves.push({ from: {x, y}, to });
        }
      }
    }
  }

  // 對吃子著法進行簡單排序 (MVV-LVA)
  moves.sort((a, b) => {
    const valA = strategy.weights[getPiece(board, a.to)!.type];
    const valB = strategy.weights[getPiece(board, b.to)!.type];
    return valB - valA;
  });

  for (const move of moves) {
    const nextBoard = applyMove(board, move.from, move.to);
    const score = quiescenceSearch(nextBoard, alpha, beta, isRed ? Camp.BLACK : Camp.RED, strategy);

    if (isRed) {
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    } else {
      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
  }
  return isRed ? alpha : beta;
}

function minimax(
  board: BoardState,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  strategy: AiStrategy,
  startTime: number,
  timeLimit: number
): number {
  if (depth === 0) {
    return quiescenceSearch(board, alpha, beta, isMaximizing ? Camp.RED : Camp.BLACK, strategy);
  }
  if (Date.now() - startTime > timeLimit) return evaluate(board, strategy);

  const camp = isMaximizing ? Camp.RED : Camp.BLACK;
  let hasAnyMove = false;

  // 取得並排序著法
  const rawMoves: any[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (p && p.camp === camp) {
        const legals = getLegalMoves(board, {x, y});
        for (const to of legals) rawMoves.push({from: {x,y}, to});
      }
    }
  }
  const sorted = sortMoves(board, rawMoves, isMaximizing);

  if (isMaximizing) {
    let maxScore = -Infinity;
    for (const move of sorted) {
      hasAnyMove = true;
      const newBoard = applyMove(board, move.from, move.to);
      const score = minimax(newBoard, depth - 1, alpha, beta, false, strategy, startTime, timeLimit);
      maxScore = Math.max(maxScore, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return hasAnyMove ? maxScore : (isInCheck(board, camp) ? -100000 : 0);
  } else {
    let minScore = Infinity;
    for (const move of sorted) {
      hasAnyMove = true;
      const newBoard = applyMove(board, move.from, move.to);
      const score = minimax(newBoard, depth - 1, alpha, beta, true, strategy, startTime, timeLimit);
      minScore = Math.min(minScore, score);
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return hasAnyMove ? minScore : (isInCheck(board, camp) ? 100000 : 0);
  }
}

function getBestMove(board: BoardState, camp: Camp, strategy: AiStrategy): AiMove | null {
  const isMaximizing = camp === Camp.RED;
  const startTime = Date.now();
  
  // 階梯式長考機制 (全面強化版)
  let TIME_LIMIT = 8000; // 高手 8秒
  if (strategy.level === '學者') TIME_LIMIT = 10000;
  if (strategy.level === '大師') TIME_LIMIT = 12000;
  if (strategy.level === '宗師') TIME_LIMIT = 15000;
  if (strategy.level === '至尊') TIME_LIMIT = 20000; // 至尊魔王 20秒極致長考
  
  let bestMove: AiMove | null = null;
  const initialMoves: any[] = [];

  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p || p.camp !== camp) continue;
      const legalMoves = getLegalMoves(board, {x, y});
      for (const to of legalMoves) {
        initialMoves.push({ from: {x, y}, to });
      }
    }
  }

  if (initialMoves.length === 0) return null;

  // 1. 初始著法排序
  const sortedMoves = sortMoves(board, initialMoves, isMaximizing);

  // 2. 疊代加深搜尋 (Iterative Deepening)
  let timeExceeded = false;
  for (let d = 1; d <= strategy.searchDepth; d++) {
    let currentBestScore = isMaximizing ? -Infinity : Infinity;
    let currentBestMove: AiMove | null = null;

    for (const move of sortedMoves) {
      // 檢查是否超時 (每一層搜尋都要傳入剩餘時間)
      if (Date.now() - startTime > TIME_LIMIT) {
        timeExceeded = true;
        break;
      }

      const newBoard = applyMove(board, move.from, move.to);
      const score = minimax(newBoard, d - 1, -Infinity, Infinity, !isMaximizing, strategy, startTime, TIME_LIMIT);
      
      if (isMaximizing ? score > currentBestScore : score < currentBestScore) {
        currentBestScore = score;
        currentBestMove = { ...move, score };
      }
    }

    // 只有在完整算完這一層且沒超時的情況下，才信任這一層的結果
    if (!timeExceeded && currentBestMove) {
      bestMove = currentBestMove;
    } else if (timeExceeded) {
      break;
    }

    if (Date.now() - startTime > TIME_LIMIT * 0.7) break;
  }

  // 最後加一點極微小的隨機擾動，避免每次開局走法完全一致
  if (bestMove) {
    bestMove.score += (Math.random() * 2 - 1);
  }

  return bestMove;
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
