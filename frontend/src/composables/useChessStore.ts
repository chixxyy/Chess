import { ref, computed, watch, nextTick } from 'vue';
import { useSocket } from './useSocket';
import { Camp, parseFEN, GameStatus, applyMove } from '@chinese-chess/shared';
import type { Position, BoardState } from '@chinese-chess/shared';

// 單例模式 Store，保證多個組件共享同一個遊戲狀態
const isConnected = ref(false);
const undoCount = ref(3);
const isUndoPending = ref(false);
const showResignConfirm = ref(false);
const showHistoryModal = ref(false);
const selectedCamp = ref<Camp>(Camp.RED);
const alertMessage = ref('');
const optimisticBoard = ref<BoardState | null>(null);
const optimisticLastMove = ref<Position[] | null>(null);

const PIECE_ORDER: Record<string, number> = { k: 7, r: 6, c: 5, n: 4, b: 3, a: 2, p: 1 };

export function useChessStore() {
  const {
    isConnected: socketConnected,
    gameState,
    gameOver,
    moveRejected,
    initGame: socketInit,
    resign: socketResign,
    undoMove: socketUndo,
    sendMove: socketSendMove
  } = useSocket();

  // 同步連線狀態
  watch(socketConnected, (val) => {
    isConnected.value = val;
  });

  // Server 確認後清除樂觀狀態
  watch(gameState, () => {
    optimisticBoard.value = null;
    optimisticLastMove.value = null;
    isUndoPending.value = false;
  });

  // Server 拒絕時立刻回滾
  watch(moveRejected, () => {
    optimisticBoard.value = null;
    optimisticLastMove.value = null;
  });

  const isGameOver = computed(() =>
    gameOver.value !== null ||
    gameState.value?.status === GameStatus.CHECKMATE
  );

  const currentBoard = computed<BoardState | null>(() => {
    if (optimisticBoard.value) return optimisticBoard.value;
    if (!gameState.value) return null;
    return parseFEN(gameState.value.fen);
  });

  const lastMovePair = computed<Position[] | null>(() => {
    if (optimisticLastMove.value) return optimisticLastMove.value;
    const lm = gameState.value?.lastMove;
    if (!lm) return null;
    return [lm.from, lm.to];
  });

  const themeClass = computed(() => {
    const style = gameState.value?.currentAiStyle;
    if (style === '絕世魔王') return 'skin-boss';
    if (style === '萬卒齊發') return 'skin-pawn-king';
    if (style === '狂暴強襲') return 'skin-aggressive';
    if (style === '鐵壁守備') return 'skin-defensive';
    if (style === '遠程砲戰') return 'skin-cannon';
    if (style === '詭變馬戰') return 'skin-knight';
    return 'skin-balanced';
  });

  const latestMovePair = computed(() => {
    if (!gameState.value?.fullHistory?.length) return null;
    const history = gameState.value.fullHistory;
    const pairIdx = Math.ceil(history.length / 2);
    return {
      num: pairIdx,
      red: history[(pairIdx - 1) * 2],
      black: history[(pairIdx - 1) * 2 + 1] || ''
    };
  });

  const gameOverMsg = computed<string | null>(() => {
    if (!gameOver.value) return null;
    const { winner: overWinner, reason } = gameOver.value;
    const winner = gameState.value?.winner || overWinner;
    
    const isWinner = winner === (gameState.value?.humanCamp || selectedCamp.value);
    const winName = winner === Camp.RED ? '紅方' : '黑方';

    if (reason === 'RESIGN') {
      return isWinner ? `對方已認輸，${winName}勝！` : `你已認輸，${winName}勝！`;
    }
    
    if (winner === 'DRAW') return '平局！';
    return isWinner ? `恭喜！你贏了！(${winName}勝利)` : `遺憾！${winName}獲勝！將軍！`;
  });

  const gameOverIcon = computed(() => {
    if (!gameOver.value) return '';
    const winner = gameState.value?.winner || gameOver.value.winner;
    const isWinner = winner === (gameState.value?.humanCamp || selectedCamp.value);
    return isWinner ? '🏆' : '🤖';
  });

  const statusText = computed(() => {
    if (!gameState.value) return '等待開始';
    switch (gameState.value.status) {
      case GameStatus.WAITING:
        return '等待開始';
      case GameStatus.PLAYING:
        return gameState.value.isHumanTurn ? '您的回合' : 'AI 思考中...';
      case GameStatus.CHECK:
        return gameState.value.isHumanTurn ? '⚠ 您被將軍！' : '⚠ AI 被將軍！';
      case GameStatus.CHECKMATE:
        return '將死！';
      default:
        return '遊戲中';
    }
  });

  const sortedCapturedRed = computed(() => {
    if (!gameState.value?.capturedPieces) return [];
    return [...gameState.value.capturedPieces.red].sort((a, b) => PIECE_ORDER[b] - PIECE_ORDER[a]);
  });

  const sortedCapturedBlack = computed(() => {
    if (!gameState.value?.capturedPieces) return [];
    return [...gameState.value.capturedPieces.black].sort((a, b) => PIECE_ORDER[b] - PIECE_ORDER[a]);
  });

  const statusClass = computed(() => ({
    'status-red': gameState.value?.turn === Camp.RED,
    'status-black': gameState.value?.turn === Camp.BLACK,
    'status-check': gameState.value?.status === GameStatus.CHECK,
  }));

  // actions
  function handleInitGame() {
    undoCount.value = 3;
    showResignConfirm.value = false;
    socketInit(selectedCamp.value);
  }

  function confirmResign() {
    showResignConfirm.value = false;
    socketResign();
  }

  function handleUndo() {
    if (!gameState.value) return;

    if (!gameState.value.fullHistory || gameState.value.fullHistory.length === 0) {
      alertMessage.value = '對局尚未開始，還不能悔棋喔！';
      return;
    }

    if (undoCount.value > 0) {
      const isHuman = gameState.value.turn === (gameState.value.humanCamp || selectedCamp.value);
      if (isHuman || isGameOver.value) {
        undoCount.value--;
        isUndoPending.value = true;
        socketUndo();

        setTimeout(() => {
          if (isUndoPending.value) {
            isUndoPending.value = false;
            undoCount.value++;
          }
        }, 10000);
      }
    }
  }

  function onPlayerMove(from: Position, to: Position) {
    if (currentBoard.value) {
      optimisticBoard.value = applyMove(currentBoard.value, from, to);
      optimisticLastMove.value = [from, to];
    }
    // send move to socket
    socketSendMove('global-game', from, to);
  }

  return {
    isConnected,
    gameState,
    gameOver,
    undoCount,
    isUndoPending,
    showResignConfirm,
    showHistoryModal,
    selectedCamp,
    alertMessage,
    isGameOver,
    currentBoard,
    lastMovePair,
    themeClass,
    latestMovePair,
    gameOverMsg,
    gameOverIcon,
    statusText,
    sortedCapturedRed,
    sortedCapturedBlack,
    statusClass,
    handleInitGame,
    confirmResign,
    handleUndo,
    onPlayerMove
  };
}
