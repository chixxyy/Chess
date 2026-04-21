/**
 * aiEngine.ts — AI 純計算模組
 * 可安全在 Worker Thread 或主線程中 import
 */

import {
  BoardState, Camp, PieceType,
  getLegalMoves, applyMove, isInCheck, getPiece,
  calculateBoardHash, applyMoveHash
} from '@chinese-chess/shared';

// ─── AI 作戰風格與權重定義 ───────────────────────────────────────────────

export interface AiStrategy {
  name: string;
  weights: Record<PieceType, number>;
  pawnBonus: number[][];
  attackBonus: number;
  defenseBonus: number;
  searchDepth: number;
  level: string;
}

export interface AiMove {
  from: { x: number; y: number };
  to: { x: number; y: number };
  score: number;
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

export const AI_STRATEGIES: AiStrategy[] = [
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

// ─── 置換表 (Transposition Table) 定義 ──────────────────────────────────────

enum TTFlag { EXACT = 0, ALPHA = 1, BETA = 2 }

interface TTEntry {
  depth: number;
  score: number;
  flag: TTFlag;
  bestMove: { from: {x:number, y:number}, to: {x:number, y:number} } | null;
}

let transpositionTable = new Map<bigint, TTEntry>();

function evaluate(board: BoardState, strategy: AiStrategy): number {
  let score = 0;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p) continue;
      const isRed = p.camp === Camp.RED;
      let val = strategy.weights[p.type];
      score += isRed ? val : -val;
      const pstTable = PST[p.type];
      if (pstTable) {
        const pstVal = isRed ? pstTable[y][x] : pstTable[9 - y][8 - x];
        score += isRed ? pstVal : -pstVal;
      }
      if (p.type === PieceType.PAWN) {
        const bonus = isRed ? (strategy.pawnBonus[y]?.[x] ?? 0) : (strategy.pawnBonus[9 - y]?.[8 - x] ?? 0);
        score += isRed ? bonus : -bonus;
      }
      if (strategy.name === '絕世魔王' || strategy.name === '萬卒齊發') {
         const centerScore = (4 - Math.abs(4 - x)) + (4.5 - Math.abs(4.5 - y));
         score += isRed ? centerScore * 5 : -centerScore * 5;
      }
    }
  }
  return score;
}

function sortMovesWithPV(board: BoardState, moves: any[], isMaximizing: boolean, pvMove: any | null): any[] {
  return moves.map(m => {
    let weight = 0;
    const attacker = board[m.from.y][m.from.x];
    const victim = board[m.to.y][m.to.x];
    if (pvMove && m.from.x === pvMove.from.x && m.from.y === pvMove.from.y && 
        m.to.x === pvMove.to.x && m.to.y === pvMove.to.y) {
      weight = 2000000;
    } else if (victim) {
      const vVal = { k: 1000, r: 90, c: 45, n: 40, p: 10, b: 11, a: 11 }[victim.type] || 0;
      const aVal = { k: 1, r: 9, c: 4.5, n: 4, p: 1, b: 1, a: 1 }[attacker?.type || 'p'] || 1;
      weight = 10000 + (vVal * 10 - aVal);
    } else {
      weight = 10 - (Math.abs(4 - m.to.x) + Math.abs(4.5 - m.to.y));
    }
    return { ...m, weight };
  }).sort((a, b) => b.weight - a.weight);
}

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
  const moves: any[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (p && p.camp === camp) {
        for (const to of getLegalMoves(board, {x, y})) {
          if (board[to.y][to.x]) moves.push({ from: {x,y}, to });
        }
      }
    }
  }
  moves.sort((a, b) => {
    const vA = strategy.weights[board[a.to.y][a.to.x]!.type];
    const vB = strategy.weights[board[b.to.y][b.to.x]!.type];
    return vB - vA;
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
  board: BoardState, depth: number, alpha: number, beta: number,
  isMaximizing: boolean, strategy: AiStrategy, startTime: number,
  timeLimit: number, currentHash: bigint
): number {
  const entry = transpositionTable.get(currentHash);
  if (entry && entry.depth >= depth) {
    if (entry.flag === TTFlag.EXACT) return entry.score;
    if (entry.flag === TTFlag.ALPHA && entry.score <= alpha) return alpha;
    if (entry.flag === TTFlag.BETA && entry.score >= beta) return beta;
  }
  if (depth === 0) return quiescenceSearch(board, alpha, beta, isMaximizing ? Camp.RED : Camp.BLACK, strategy);
  if (Date.now() - startTime > timeLimit) return evaluate(board, strategy);

  const camp = isMaximizing ? Camp.RED : Camp.BLACK;
  const rawMoves: any[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (p && p.camp === camp) {
        for (const to of getLegalMoves(board, {x,y})) rawMoves.push({from: {x,y}, to});
      }
    }
  }
  if (rawMoves.length === 0) return isInCheck(board, camp) ? (isMaximizing ? -100000 : 100000) : 0;

  const sorted = sortMovesWithPV(board, rawMoves, isMaximizing, entry?.bestMove);
  const oldAlpha = alpha;
  const oldBeta = beta;
  let bestLocalMove = null;
  let val = isMaximizing ? -Infinity : Infinity;

  for (const move of sorted) {
    const piece = board[move.from.y][move.from.x]!;
    const captured = board[move.to.y][move.to.x];
    const nextHash = applyMoveHash(currentHash, move.from.y * 9 + move.from.x, move.to.y * 9 + move.to.x, piece.type, piece.camp, captured?.type || null, captured?.camp || null);
    const score = minimax(applyMove(board, move.from, move.to), depth - 1, alpha, beta, !isMaximizing, strategy, startTime, timeLimit, nextHash);
    
    if (isMaximizing) {
      if (score > val) { val = score; bestLocalMove = move; }
      alpha = Math.max(alpha, val);
    } else {
      if (score < val) { val = score; bestLocalMove = move; }
      beta = Math.min(beta, val);
    }
    if (beta <= alpha) break;
  }

  let flag = TTFlag.EXACT;
  if (isMaximizing) {
    if (val <= oldAlpha) flag = TTFlag.ALPHA;
    else if (val >= beta) flag = TTFlag.BETA;
  } else {
    if (val >= oldBeta) flag = TTFlag.BETA;
    else if (val <= alpha) flag = TTFlag.ALPHA;
    if (val >= oldBeta) flag = TTFlag.BETA;
    else if (val <= alpha) flag = TTFlag.ALPHA;
  }
  transpositionTable.set(currentHash, { depth, score: val, flag, bestMove: bestLocalMove });
  return val;
}

export function getBestMove(board: BoardState, camp: Camp, strategy: AiStrategy, moveCount: number = 0): AiMove | null {
  const isMaximizing = camp === Camp.RED;
  const startTime = Date.now();
  const initialHash = calculateBoardHash(board, camp);
  transpositionTable.clear();
  
  let timeLimit = 8000;
  if (strategy.level === '學者') timeLimit = 10000;
  if (strategy.level === '大師') timeLimit = 12000;
  if (strategy.level === '宗師') timeLimit = 15000;
  if (strategy.level === '至尊') timeLimit = 20000;
  
  const initialMoves: any[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (p && p.camp === camp) {
        for (const to of getLegalMoves(board, {x, y})) initialMoves.push({ from: {x,y}, to });
      }
    }
  }
  if (initialMoves.length === 0) return null;

  let bestMoveCandidates: AiMove[] = [];
  let currentMaxDepth = 0;

  for (let d = 1; d <= strategy.searchDepth; d++) {
    const entry = transpositionTable.get(initialHash);
    const sorted = sortMovesWithPV(board, initialMoves, isMaximizing, entry?.bestMove);
    
    let iterCandidates: AiMove[] = [];

    for (const move of sorted) {
      if (Date.now() - startTime > timeLimit) break;
      const piece = board[move.from.y][move.from.x]!;
      const captured = board[move.to.y][move.to.x];
      const nextHash = applyMoveHash(initialHash, move.from.y * 9 + move.from.x, move.to.y * 9 + move.to.x, piece.type, piece.camp, captured?.type || null, captured?.camp || null);
      
      const score = minimax(applyMove(board, move.from, move.to), d - 1, -Infinity, Infinity, !isMaximizing, strategy, startTime, timeLimit, nextHash);
      iterCandidates.push({ ...move, score });
    }

    // 如果完成了一層完整的搜索，且沒超時，更新候選名單
    if (Date.now() - startTime <= timeLimit && iterCandidates.length === initialMoves.length) {
      bestMoveCandidates = iterCandidates;
      currentMaxDepth = d;
    } else {
      break; 
    }

    // 絕殺判斷
    const bestInIter = iterCandidates.reduce((prev, curr) => 
      isMaximizing ? (curr.score > prev.score ? curr : prev) : (curr.score < prev.score ? curr : prev)
    );
    if (Math.abs(bestInIter.score) > 90000) break;
    if (Date.now() - startTime > timeLimit * 0.7) break;
  }

  if (bestMoveCandidates.length === 0) return null;

  // ─── 隨機性邏輯 (Adaptive Logic) ───────────────────────────────────────────
  
  // 1. 根據分數排序
  bestMoveCandidates.sort((a, b) => isMaximizing ? b.score - a.score : a.score - b.score);
  
  const bestScore = bestMoveCandidates[0].score;
  
  // 2. 定義「容許誤差」：在這個分數範圍內的棋，AI 都有機率選
  // 開局（前 10 步）容許度較高，且低等級 AI 容許度更高
  let threshold = 10; // 基礎容許誤差 (10分 = 0.1 隻兵)
  
  if (moveCount < 10) {
    threshold = 60; // 開局大方一點，允許走次優步來變招
  }
  
  if (strategy.level === '學者') threshold += 100; // 學者型 AI 喜歡嘗試「有創意」但可能不穩的棋
  if (strategy.level === '高手') threshold += 30;
  if (strategy.level === '至尊') threshold = 5;    // 至尊 AI 極其冷酷，只選最強
  
  // 3. 篩選出符合門檻的候選棋
  const pool = bestMoveCandidates.filter(m => Math.abs(m.score - bestScore) <= threshold);
  
  // 4. 從 pool 中隨機選一個
  // 但我們給「最優步」更高的機率 (加權隨機)
  const chosen = pool[Math.floor(Math.pow(Math.random(), 2) * pool.length)];

  // 5. 最後的小干擾，防止分數完全一樣時過於死板
  chosen.score += (Math.random() * 2 - 1);
  
  return chosen;
}
