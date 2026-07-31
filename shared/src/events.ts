import { Camp, Position, Move, GameStatus, PieceType } from './types';

export const SocketEvents = {
  INIT_GAME: 'init_game',
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  ROOM_CREATED: 'room_created',
  ROOM_JOINED: 'room_joined',
  ROOM_ERROR: 'room_error',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  MAKE_MOVE: 'make_move',
  REQUEST_AI: 'request_ai',
  RESIGN: 'resign',
  GAME_UPDATED: 'game_updated',
  MOVE_REJECTED: 'move_rejected',
  GAME_OVER: 'game_over',
  UNDO_MOVE: 'undo_move',
  RESTORE_GAME: 'restore_game',
  PLAYER_STATUS_CHANGED: 'player_status_changed',
  PLAYER_VISIBILITY: 'player_visibility'
} as const;

export interface CreateRoomPayload {
  camp?: Camp;
  roomId?: string;
}

export interface JoinRoomPayload {
  roomId: string;
}

export interface RoomJoinedPayload {
  roomId: string;
  camp: Camp;
  mode: 'PVE' | 'PVP';
  playersCount: number;
}

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
  mode?: 'PVE' | 'PVP';
  playersCount?: number;
}

export interface GameOverPayload {
  gameId: string;
  winner: Camp | 'DRAW';
  reason: string;
}

export interface ErrorPayload {
  message: string;
}

export interface PlayerStatusPayload {
  gameId: string;
  isOnline: boolean;
  isVisible: boolean;
  statusText: string;
}

