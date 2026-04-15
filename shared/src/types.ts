export enum Camp {
  RED = 'w',
  BLACK = 'b'
}

export interface Position {
  x: number;
  y: number;
}

export interface Move {
  from: Position;
  to: Position;
  piece: string;
  captured?: string;
}

export enum GameStatus {
  WAITING = 'WAITING',
  PLAYING = 'PLAYING',
  CHECK = 'CHECK',
  CHECKMATE = 'CHECKMATE',
  STALEMATE = 'STALEMATE',
  DRAW = 'DRAW',
}

export enum PieceType {
  KING = 'k',
  ADVISOR = 'a',
  BISHOP = 'b',
  KNIGHT = 'n',
  ROOK = 'r',
  CANNON = 'c',
  PAWN = 'p'
}

export interface Piece {
  type: PieceType;
  camp: Camp;
}

export type BoardState = (Piece | null)[][];
