import { BoardState, Camp, PieceType } from './types';

/**
 * Zobrist Hashing - 棋盤快速雜湊演算法
 * 為每一種棋子在每一個格子的位置生成一個隨機 64 位整數
 */

// 使用 BigUint64Array 來存儲 64 位隨機數
const zobristTable = new BigUint64Array(90 * 14 + 1); 

// 初始化隨機數表
function seed(s: number) {
  let mask = 0xffffffff;
  let m_w = (123456789 + s) & mask;
  let m_z = (987654321 - s) & mask;

  return function() {
    m_z = (36969 * (m_z & 65535) + (m_z >>> 16)) & mask;
    m_w = (18000 * (m_w & 65535) + (m_w >>> 16)) & mask;
    let result = ((m_z << 16) + m_w) >>> 0;
    return BigInt(result);
  };
}

const random = seed(42); // 固定種子確保 Hash 一致性

// 填充表
// 90 格 (0-89)
// 14 種棋子 (紅黑各 7 種)
for (let i = 0; i < zobristTable.length; i++) {
  zobristTable[i] = (random() << 32n) | random();
}

const SIDE_INDEX = 90 * 14;

export function getPieceIndex(type: PieceType, camp: Camp): number {
  const base = camp === Camp.RED ? 0 : 7;
  const typeMap: Record<PieceType, number> = {
    'k': 0, 'r': 1, 'c': 2, 'n': 3, 'b': 4, 'a': 5, 'p': 6
  };
  return base + typeMap[type];
}

/**
 * 計算整個棋盤的完整 Hash
 */
export function calculateBoardHash(board: BoardState, turn: Camp): bigint {
  let hash = 0n;
  for (let i = 0; i < 90; i++) {
    const y = Math.floor(i / 9);
    const x = i % 9;
    const piece = board[y][x];
    if (piece) {
      const pIdx = getPieceIndex(piece.type, piece.camp);
      hash ^= zobristTable[i * 14 + pIdx];
    }
  }
  if (turn === Camp.BLACK) {
    hash ^= zobristTable[SIDE_INDEX];
  }
  return hash;
}

/**
 * 增量更新 Hash (非常快，不用重新遍歷棋盤)
 */
export function updateHash(
  currentHash: bigint, 
  pos: number, 
  type: PieceType, 
  camp: Camp
): bigint {
  const pIdx = getPieceIndex(type, camp);
  return currentHash ^ zobristTable[pos * 14 + pIdx];
}

export function switchSideHash(currentHash: bigint): bigint {
  return currentHash ^ zobristTable[SIDE_INDEX];
}

/**
 * 增量更新 Hash：當棋子從 from 移動到 to
 */
export function applyMoveHash(
  currentHash: bigint,
  fromIdx: number,
  toIdx: number,
  movingType: PieceType,
  movingCamp: Camp,
  capturedType: PieceType | null,
  capturedCamp: Camp | null
): bigint {
  let hash = currentHash;
  
  // 1. 移除從 from 出發的棋子
  const pIdx = getPieceIndex(movingType, movingCamp);
  hash ^= zobristTable[fromIdx * 14 + pIdx];
  
  // 2. 如果目標格有棋子被吃，移除它
  if (capturedType !== null && capturedCamp !== null) {
    const cIdx = getPieceIndex(capturedType, capturedCamp);
    hash ^= zobristTable[toIdx * 14 + cIdx];
  }
  
  // 3. 在 to 位置放入移動的棋子
  hash ^= zobristTable[toIdx * 14 + pIdx];
  
  // 4. 切換回合
  hash ^= zobristTable[SIDE_INDEX];
  
  return hash;
}
