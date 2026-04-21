import { Camp, Position, Move, GameStatus, PieceType } from './types';

export const SocketEvents = {
  INIT_GAME: 'init_game',
  MAKE_MOVE: 'make_move',
  REQUEST_AI: 'request_ai',
  RESIGN: 'resign',
  GAME_UPDATED: 'game_updated',
  MOVE_REJECTED: 'move_rejected',
  GAME_OVER: 'game_over',
  UNDO_MOVE: 'undo_move',
  RESTORE_GAME: 'restore_game'  // 斷線重連後請求恢復棋局
} as const;


export interface MakeMovePayload {
  gameId: string;
  from: Position;
  to: Position;
}

export interface GameUpdatedPayload {
  gameId: string;
  fen: string;
  turn: Camp;
  lastMove: Move | null;
  status: GameStatus;
  isHumanTurn: boolean;
  humanCamp: Camp;
  fullHistory: string[];
  capturedPieces: {
    red: PieceType[];
    black: PieceType[];
  };
  winner: Camp | 'DRAW' | null;
  currentAiStyle: string;
  aiLevel: string;
}




export interface GameOverPayload {
  gameId: string;
  winner: Camp | 'DRAW';
  reason: string;
}

export interface ErrorPayload {
  message: string;
}
