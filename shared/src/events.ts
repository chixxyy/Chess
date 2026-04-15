import { Camp, Position, Move, GameStatus } from './types';

export const SocketEvents = {
  INIT_GAME: 'init_game',
  MAKE_MOVE: 'make_move',
  REQUEST_AI: 'request_ai',
  RESIGN: 'resign',
  GAME_UPDATED: 'game_updated',
  MOVE_REJECTED: 'move_rejected',
  GAME_OVER: 'game_over',
  UNDO_MOVE: 'undo_move'
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
}



export interface GameOverPayload {
  gameId: string;
  winner: Camp | 'DRAW';
  reason: string;
}

export interface ErrorPayload {
  message: string;
}
