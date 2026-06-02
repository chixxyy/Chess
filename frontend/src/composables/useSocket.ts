import { ref } from 'vue';
import { io, Socket } from 'socket.io-client';
import { SocketEvents, Camp } from '@chinese-chess/shared';
import type { GameUpdatedPayload, GameOverPayload, MakeMovePayload, Position } from '@chinese-chess/shared';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const socket = io(backendUrl, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
});

const isConnected = ref(socket.connected);
const gameState = ref<GameUpdatedPayload | null>(null);
const gameOver = ref<GameOverPayload | null>(null);
const moveRejected = ref(0);

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
    socket.emit(SocketEvents.RESTORE_GAME);
  }
});

socket.on(SocketEvents.GAME_UPDATED, (payload: GameUpdatedPayload) => {
  gameState.value = payload;
  if (!payload.winner) {
    gameOver.value = null;
  }
});

socket.on(SocketEvents.GAME_OVER, (payload: GameOverPayload) => {
  gameOver.value = payload;
});

socket.on(SocketEvents.MOVE_REJECTED, () => {
  moveRejected.value++;
});

export function useSocket() {
  function initGame(camp: Camp = Camp.RED) {
    gameOver.value = null;
    gameState.value = null;
    socket.emit(SocketEvents.INIT_GAME, { camp });
  }

  function sendMove(gameId: string, from: Position, to: Position) {
    const payload: MakeMovePayload = { gameId, from, to };
    socket.emit(SocketEvents.MAKE_MOVE, payload);
  }

  function resign() {
    socket.emit(SocketEvents.RESIGN);
  }

  function undoMove() {
    socket.emit(SocketEvents.UNDO_MOVE);
  }

  return { isConnected, gameState, gameOver, moveRejected, initGame, sendMove, resign, undoMove };
}

