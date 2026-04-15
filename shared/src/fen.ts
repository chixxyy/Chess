import { Piece, PieceType, Camp, BoardState } from './types';

export const INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR';

function charToPiece(char: string): Piece | null {
  if (char >= '1' && char <= '9') return null;
  const isRed = char === char.toUpperCase();
  const type = char.toLowerCase() as PieceType;
  return {
    type,
    camp: isRed ? Camp.RED : Camp.BLACK
  };
}

export function parseFEN(fen: string): BoardState {
  const board: BoardState = Array.from({ length: 10 }, () => Array(9).fill(null));
  const [position] = fen.split(' '); 
  const rows = position.split('/');

  for (let y = 0; y < 10; y++) {
    let x = 0;
    for (const char of rows[y]) {
      if (char >= '1' && char <= '9') {
        x += parseInt(char, 10);
      } else {
        board[y][x] = charToPiece(char);
        x++;
      }
    }
  }
  return board;
}

export function generateFEN(board: BoardState): string {
  const rows: string[] = [];

  for (let y = 0; y < 10; y++) {
    let rowFen = '';
    let emptyCount = 0;

    for (let x = 0; x < 9; x++) {
      const piece = board[y][x];
      if (piece === null) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rowFen += emptyCount.toString();
          emptyCount = 0;
        }
        const char = piece.type;
        rowFen += piece.camp === Camp.RED ? char.toUpperCase() : char.toLowerCase();
      }
    }
    
    if (emptyCount > 0) {
      rowFen += emptyCount.toString();
    }
    rows.push(rowFen);
  }

  return rows.join('/');
}
