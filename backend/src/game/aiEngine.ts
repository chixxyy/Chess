/**
 * aiEngine.ts — AI 純計算模組
 * 可安全在 Worker Thread 或主線程中 import
 */

import {
  BoardState, Camp, PieceType,
  getLegalMoves, applyMove, isInCheck, getPiece
} from '../../../shared';

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

function evaluate(board: BoardState, strategy: AiStrategy): number {
  let score = 0;
  for (let yIdx = 0; yIdx < 10; yIdx++) {
    for (let xIdx = 0; xIdx < 9; xIdx++) {
      const p = board[yIdx][xIdx];
      if (!p) continue;
      
      const isRed = p.camp === Camp.RED;
      let val = strategy.weights[p.type];

      score += isRed ? val : -val;

      const pstTable = PST[p.type];
      if (pstTable) {
        const pstVal = isRed ? pstTable[yIdx][xIdx] : pstTable[9 - yIdx][8 - xIdx];
        score += isRed ? pstVal : -pstVal;
      }

      if (p.type === PieceType.PAWN) {
        val += isRed
          ? (strategy.pawnBonus[yIdx]?.[xIdx] ?? 0)
          : (strategy.pawnBonus[9 - yIdx]?.[8 - xIdx] ?? 0);
        score += isRed ? val : -val;
      }
      
      if (strategy.name === '絕世魔王' || strategy.name === '萬卒齊發') {
         const centerScore = (4 - Math.abs(4 - xIdx)) + (4.5 - Math.abs(4.5 - yIdx));
         score += isRed ? centerScore * 5 : -centerScore * 5;
      }
    }
  }
  return score;
}

function sortMoves(board: BoardState, moves: {from: any, to: any}[], isMaximizing: boolean): any[] {
  return moves.map(m => {
    let weight = 0;
    const attacker = getPiece(board, m.from);
    const victim = getPiece(board, m.to);
    
    if (victim) {
      const victimWeights: any = { k: 1000, r: 90, c: 45, n: 40, p: 10, b: 11, a: 11 };
      const attackerWeights: any = { k: 1, r: 9, c: 4.5, n: 4, p: 1, b: 1, a: 1 };
      weight += 100 + (victimWeights[victim.type] - attackerWeights[attacker?.type || 'p']);
    }

    const centerDist = Math.abs(4 - m.to.x) + Math.abs(4.5 - m.to.y);
    weight += (10 - centerDist);

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

  const moves: AiMove[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p || p.camp !== camp) continue;
      const legal = getLegalMoves(board, {x, y});
      for (const to of legal) {
        if (getPiece(board, to)) {
          moves.push({ from: {x, y}, to, score: 0 });
        }
      }
    }
  }

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

export function getBestMove(board: BoardState, camp: Camp, strategy: AiStrategy): AiMove | null {
  const isMaximizing = camp === Camp.RED;
  const startTime = Date.now();
  
  let TIME_LIMIT = 8000;
  if (strategy.level === '學者') TIME_LIMIT = 10000;
  if (strategy.level === '大師') TIME_LIMIT = 12000;
  if (strategy.level === '宗師') TIME_LIMIT = 15000;
  if (strategy.level === '至尊') TIME_LIMIT = 20000;
  
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

  const sortedMoves = sortMoves(board, initialMoves, isMaximizing);

  let timeExceeded = false;
  for (let d = 1; d <= strategy.searchDepth; d++) {
    let currentBestScore = isMaximizing ? -Infinity : Infinity;
    let currentBestMove: AiMove | null = null;

    for (const move of sortedMoves) {
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

    if (!timeExceeded && currentBestMove) {
      bestMove = currentBestMove;
    } else if (timeExceeded) {
      break;
    }

    if (Date.now() - startTime > TIME_LIMIT * 0.7) break;
  }

  if (bestMove) {
    bestMove.score += (Math.random() * 2 - 1);
  }

  return bestMove;
}
