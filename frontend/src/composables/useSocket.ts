import { ref } from 'vue';
import { io, Socket } from 'socket.io-client';
import { SocketEvents, Camp } from '@chinese-chess/shared';
import type { GameUpdatedPayload, GameOverPayload, MakeMovePayload, Position, RoomJoinedPayload, ErrorPayload, PlayerStatusPayload } from '@chinese-chess/shared';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const socket = io(backendUrl, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  autoConnect: true
});

const isConnected = ref(socket.connected);
const gameState = ref<GameUpdatedPayload | null>(null);
const gameOver = ref<GameOverPayload | null>(null);
const moveRejected = ref(0);
const currentRoomInfo = ref<RoomJoinedPayload | null>(null);
const roomErrorMsg = ref<string>('');
const playerJoinedNotice = ref<string>('');
const opponentStatus = ref<PlayerStatusPayload | null>(null);

socket.on('connect', () => {
  isConnected.value = true;
});

socket.on('disconnect', () => {
  isConnected.value = false;
});

// 重連成功 → 自動請求恢復棋局
socket.on('reconnect', () => {
  isConnected.value = true;
  if (gameState.value) {
    socket.emit(SocketEvents.RESTORE_GAME, { gameId: gameState.value.gameId });
  }
});

socket.on(SocketEvents.GAME_UPDATED, (payload: GameUpdatedPayload) => {
  gameState.value = payload;
  if (!payload.winner) {
    gameOver.value = null;
  }
});

socket.on(SocketEvents.ROOM_CREATED, (payload: RoomJoinedPayload) => {
  currentRoomInfo.value = payload;
  roomErrorMsg.value = '';
});

socket.on(SocketEvents.ROOM_JOINED, (payload: RoomJoinedPayload) => {
  currentRoomInfo.value = payload;
  roomErrorMsg.value = '';
});

socket.on(SocketEvents.ROOM_ERROR, (payload: ErrorPayload) => {
  roomErrorMsg.value = payload.message;
});

socket.on(SocketEvents.PLAYER_JOINED, (data: { message: string }) => {
  playerJoinedNotice.value = data.message;
  setTimeout(() => {
    playerJoinedNotice.value = '';
  }, 3000);
});

socket.on(SocketEvents.GAME_OVER, (payload: GameOverPayload) => {
  gameOver.value = payload;
});

socket.on(SocketEvents.PLAYER_STATUS_CHANGED, (payload: PlayerStatusPayload) => {
  opponentStatus.value = payload;
});

document.addEventListener('visibilitychange', () => {
  if (gameState.value?.gameId && gameState.value?.mode === 'PVP') {
    const isVisible = document.visibilityState === 'visible';
    socket.emit(SocketEvents.PLAYER_VISIBILITY, {
      gameId: gameState.value.gameId,
      isVisible
    });
  }
});

export function useSocket() {
  function initGame(camp: Camp = Camp.RED) {
    gameOver.value = null;
    gameState.value = null;
    currentRoomInfo.value = null;
    socket.emit(SocketEvents.INIT_GAME, { camp });
  }

  function createRoom(camp: Camp = Camp.RED, roomId?: string) {
    gameOver.value = null;
    gameState.value = null;
    currentRoomInfo.value = null;
    socket.emit(SocketEvents.CREATE_ROOM, { camp, roomId });
  }

  function joinRoom(roomId: string) {
    gameOver.value = null;
    gameState.value = null;
    currentRoomInfo.value = null;
    socket.emit(SocketEvents.JOIN_ROOM, { roomId });
  }

  function sendMove(gameId: string, from: Position, to: Position) {
    const payload: MakeMovePayload = { gameId, from, to };
    socket.emit(SocketEvents.MAKE_MOVE, payload);
  }

  function resign(gameId?: string) {
    socket.emit(SocketEvents.RESIGN, { gameId });
  }

  function undoMove(gameId?: string) {
    socket.emit(SocketEvents.UNDO_MOVE, { gameId });
  }

  return {
    isConnected,
    gameState,
    gameOver,
    moveRejected,
    currentRoomInfo,
    roomErrorMsg,
    playerJoinedNotice,
    opponentStatus,
    initGame,
    createRoom,
    joinRoom,
    sendMove,
    resign,
    undoMove
  };
}


