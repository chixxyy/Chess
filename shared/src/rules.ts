import { BoardState, Camp, Piece, PieceType, Position } from './types';

// ─── 基礎工具 ────────────────────────────────────────────────────────────────

export function inBound(x: number, y: number): boolean {
  return x >= 0 && x <= 8 && y >= 0 && y <= 9;
}

export function getPiece(board: BoardState, pos: Position): Piece | null {
  return board[pos.y][pos.x];
}

export function isFriendly(board: BoardState, pos: Position, camp: Camp): boolean {
  const p = getPiece(board, pos);
  return p !== null && p.camp === camp;
}

export function isEnemy(board: BoardState, pos: Position, camp: Camp): boolean {
  const p = getPiece(board, pos);
  return p !== null && p.camp !== camp;
}

// ─── 個別棋子移動規則 ────────────────────────────────────────────────────────

function rookMoves(board: BoardState, from: Position, camp: Camp): Position[] {
  const moves: Position[] = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx, dy] of dirs) {
    let nx = from.x + dx, ny = from.y + dy;
    while (inBound(nx, ny)) {
      if (isFriendly(board, {x:nx,y:ny}, camp)) break;
      moves.push({x:nx, y:ny});
      if (isEnemy(board, {x:nx,y:ny}, camp)) break;
      nx += dx; ny += dy;
    }
  }
  return moves;
}

function knightMoves(board: BoardState, from: Position, camp: Camp): Position[] {
  const moves: Position[] = [];
  // 馬走日，需先確認「蹩馬腿」
  const steps = [
    { leg: [0,-1], end: [[-1,-2],[1,-2]] },
    { leg: [0,1],  end: [[-1,2],[1,2]] },
    { leg: [-1,0], end: [[-2,-1],[-2,1]] },
    { leg: [1,0],  end: [[2,-1],[2,1]] },
  ];
  for (const step of steps) {
    const legX = from.x + step.leg[0];
    const legY = from.y + step.leg[1];
    if (!inBound(legX, legY)) continue;
    if (getPiece(board, {x:legX, y:legY}) !== null) continue; // 蹩馬腿
    for (const [dx, dy] of step.end) {
      const nx = from.x + dx, ny = from.y + dy;
      if (!inBound(nx, ny)) continue;
      if (!isFriendly(board, {x:nx,y:ny}, camp)) {
        moves.push({x:nx, y:ny});
      }
    }
  }
  return moves;
}

function bishopMoves(board: BoardState, from: Position, camp: Camp): Position[] {
  const moves: Position[] = [];
  // 象只能在己方陣地 (紅: y>=5, 黑: y<=4)，且「塞象眼」
  const riverLimit = camp === Camp.RED ? (y: number) => y >= 5 : (y: number) => y <= 4;
  const diags = [[-1,-1],[1,-1],[-1,1],[1,1]];
  for (const [dx, dy] of diags) {
    const eyeX = from.x + dx, eyeY = from.y + dy;
    const nx = from.x + dx * 2, ny = from.y + dy * 2;
    if (!inBound(nx, ny)) continue;
    if (!riverLimit(ny)) continue;
    if (getPiece(board, {x:eyeX, y:eyeY}) !== null) continue; // 塞象眼
    if (!isFriendly(board, {x:nx,y:ny}, camp)) {
      moves.push({x:nx, y:ny});
    }
  }
  return moves;
}

function advisorMoves(board: BoardState, from: Position, camp: Camp): Position[] {
  const moves: Position[] = [];
  // 仕在九宮格內斜走一步: 紅 x[3..5] y[7..9], 黑 x[3..5] y[0..2]
  const yRange = camp === Camp.RED ? [7, 9] : [0, 2];
  const diags = [[-1,-1],[1,-1],[-1,1],[1,1]];
  for (const [dx, dy] of diags) {
    const nx = from.x + dx, ny = from.y + dy;
    if (!inBound(nx, ny)) continue;
    if (nx < 3 || nx > 5) continue;
    if (ny < yRange[0] || ny > yRange[1]) continue;
    if (!isFriendly(board, {x:nx,y:ny}, camp)) {
      moves.push({x:nx, y:ny});
    }
  }
  return moves;
}

function kingMoves(board: BoardState, from: Position, camp: Camp): Position[] {
  const moves: Position[] = [];
  const yRange = camp === Camp.RED ? [7, 9] : [0, 2];
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  for (const [dx, dy] of dirs) {
    const nx = from.x + dx, ny = from.y + dy;
    if (!inBound(nx, ny)) continue;
    if (nx < 3 || nx > 5) continue;
    if (ny < yRange[0] || ny > yRange[1]) continue;
    if (!isFriendly(board, {x:nx,y:ny}, camp)) {
      moves.push({x:nx, y:ny});
    }
  }
  return moves;
}

function cannonMoves(board: BoardState, from: Position, camp: Camp): Position[] {
  const moves: Position[] = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx, dy] of dirs) {
    let nx = from.x + dx, ny = from.y + dy;
    let hasScreen = false;
    while (inBound(nx, ny)) {
      const target = getPiece(board, {x:nx, y:ny});
      if (!hasScreen) {
        if (target === null) {
          moves.push({x:nx, y:ny}); // 直走到空格
        } else {
          hasScreen = true; // 遇到炮架
        }
      } else {
        if (target !== null) {
          if (target.camp !== camp) moves.push({x:nx, y:ny}); // 隔子吃
          break;
        }
      }
      nx += dx; ny += dy;
    }
  }
  return moves;
}

function pawnMoves(board: BoardState, from: Position, camp: Camp): Position[] {
  const moves: Position[] = [];
  // 紅兵向上 (y 遞減)，黑卒向下 (y 遞增)
  const forward = camp === Camp.RED ? -1 : 1;
  const crossedRiver = camp === Camp.RED ? from.y <= 4 : from.y >= 5;
  const candidates: [number, number][] = [[0, forward]];
  if (crossedRiver) {
    candidates.push([-1, 0], [1, 0]); // 過河後可橫移
  }
  for (const [dx, dy] of candidates) {
    const nx = from.x + dx, ny = from.y + dy;
    if (!inBound(nx, ny)) continue;
    if (!isFriendly(board, {x:nx,y:ny}, camp)) {
      moves.push({x:nx, y:ny});
    }
  }
  return moves;
}

// ─── 將帥照面 ────────────────────────────────────────────────────────────────

export function kingsAreFacing(board: BoardState): boolean {
  let redKingPos: Position | null = null;
  let blackKingPos: Position | null = null;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p) continue;
      if (p.type === PieceType.KING && p.camp === Camp.RED) redKingPos = {x, y};
      if (p.type === PieceType.KING && p.camp === Camp.BLACK) blackKingPos = {x, y};
    }
  }
  if (!redKingPos || !blackKingPos) return false;
  if (redKingPos.x !== blackKingPos.x) return false;
  // 確認兩王之間沒有任何棋子
  const minY = Math.min(redKingPos.y, blackKingPos.y);
  const maxY = Math.max(redKingPos.y, blackKingPos.y);
  for (let y = minY + 1; y < maxY; y++) {
    if (board[y][redKingPos.x] !== null) return false;
  }
  return true;
}

// ─── 核心：取得合法移動（過濾掉會讓己方被將的走法）────────────────────────

export function getRawMoves(board: BoardState, from: Position): Position[] {
  const piece = getPiece(board, from);
  if (!piece) return [];
  const { type, camp } = piece;
  switch (type) {
    case PieceType.ROOK:    return rookMoves(board, from, camp);
    case PieceType.KNIGHT:  return knightMoves(board, from, camp);
    case PieceType.BISHOP:  return bishopMoves(board, from, camp);
    case PieceType.ADVISOR: return advisorMoves(board, from, camp);
    case PieceType.KING:    return kingMoves(board, from, camp);
    case PieceType.CANNON:  return cannonMoves(board, from, camp);
    case PieceType.PAWN:    return pawnMoves(board, from, camp);
    default: return [];
  }
}

export function applyMove(board: BoardState, from: Position, to: Position): BoardState {
  const newBoard: BoardState = board.map(row => [...row]);
  newBoard[to.y][to.x] = newBoard[from.y][from.x];
  newBoard[from.y][from.x] = null;
  return newBoard;
}

export function isInCheck(board: BoardState, camp: Camp): boolean {
  // 找己方將/帥位置
  let kingPos: Position | null = null;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (p?.type === PieceType.KING && p.camp === camp) {
        kingPos = {x, y};
        break;
      }
    }
    if (kingPos) break;
  }
  if (!kingPos) return false;

  // 檢查對方任何棋子是否可以吃到己方將/帥
  const enemy = camp === Camp.RED ? Camp.BLACK : Camp.RED;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p || p.camp !== enemy) continue;
      const raw = getRawMoves(board, {x, y});
      if (raw.some(pos => pos.x === kingPos!.x && pos.y === kingPos!.y)) {
        return true;
      }
    }
  }

  // 將帥照面也算被將
  if (kingsAreFacing(board)) return true;

  return false;
}

export function getLegalMoves(board: BoardState, from: Position): Position[] {
  const piece = getPiece(board, from);
  if (!piece) return [];
  const raw = getRawMoves(board, from);
  return raw.filter(to => {
    const newBoard = applyMove(board, from, to);
    return !isInCheck(newBoard, piece.camp);
  });
}

export function isCheckmate(board: BoardState, camp: Camp): boolean {
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p || p.camp !== camp) continue;
      if (getLegalMoves(board, {x, y}).length > 0) return false;
    }
  }
  return true;
}
