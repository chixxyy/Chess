import { ref, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';
import { SocketEvents, Camp } from '@chinese-chess/shared';
import type { GameUpdatedPayload, GameOverPayload, MakeMovePayload, Position } from '@chinese-chess/shared';


export function useSocket() {
  const socket = ref<Socket | null>(null);
  const isConnected = ref(false);
  const gameState = ref<GameUpdatedPayload | null>(null);
  const gameOver = ref<GameOverPayload | null>(null);

  onMounted(() => {
    socket.value = io('http://localhost:3000', { transports: ['websocket'] });

    socket.value.on('connect', () => {
      isConnected.value = true;
    });

    socket.value.on('disconnect', () => {
      isConnected.value = false;
    });

    socket.value.on(SocketEvents.GAME_UPDATED, (payload: GameUpdatedPayload) => {
      gameState.value = payload;
    });

    socket.value.on(SocketEvents.GAME_OVER, (payload: GameOverPayload) => {
      gameOver.value = payload;
    });
  });

  onUnmounted(() => {
    socket.value?.disconnect();
  });

  function initGame(camp: Camp = Camp.RED) {
    gameOver.value = null;
    gameState.value = null;
    socket.value?.emit(SocketEvents.INIT_GAME, { camp });
  }


  function sendMove(gameId: string, from: Position, to: Position) {
    const payload: MakeMovePayload = { gameId, from, to };
    socket.value?.emit(SocketEvents.MAKE_MOVE, payload);
  }

  function resign() {
    socket.value?.emit(SocketEvents.RESIGN);
  }

  function undoMove() {
    socket.value?.emit(SocketEvents.UNDO_MOVE);
  }

  return { isConnected, gameState, gameOver, initGame, sendMove, resign, undoMove };
}

