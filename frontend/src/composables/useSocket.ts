import { ref, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';
import { SocketEvents, Camp } from '@chinese-chess/shared';
import type { GameUpdatedPayload, GameOverPayload, MakeMovePayload, Position } from '@chinese-chess/shared';


export function useSocket() {
  const socket = ref<Socket | null>(null);
  const isConnected = ref(false);
  const gameState = ref<GameUpdatedPayload | null>(null);
  const gameOver = ref<GameOverPayload | null>(null);
  const moveRejected = ref(0);

  onMounted(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
    socket.value = io(backendUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity, // 無限重試，絕不放棄
      reconnectionDelay: 1000,        // 1 秒後第一次重試
      reconnectionDelayMax: 5000,     // 最長等 5 秒
      timeout: 20000
    });

    socket.value.on('connect', () => {
      isConnected.value = true;
    });

    socket.value.on('disconnect', () => {
      isConnected.value = false;
    });

    // 重連成功 → 自動請求恢復棋局
    socket.value.on('reconnect', () => {
      isConnected.value = true;
      if (gameState.value) {
        socket.value?.emit(SocketEvents.RESTORE_GAME);
      }
    });

    socket.value.on(SocketEvents.GAME_UPDATED, (payload: GameUpdatedPayload) => {
      gameState.value = payload;
      if (!payload.winner) {
        gameOver.value = null;
      }
    });

    socket.value.on(SocketEvents.GAME_OVER, (payload: GameOverPayload) => {
      gameOver.value = payload;
    });

    socket.value.on(SocketEvents.MOVE_REJECTED, () => {
      moveRejected.value++;
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

  return { isConnected, gameState, gameOver, moveRejected, initGame, sendMove, resign, undoMove };
}
