<template>
  <div :class="['app-shell', themeClass]">
    <div class="bg-glow red-glow" />
    <div class="bg-glow blue-glow" />

    <header class="app-header">
      <h1 class="title">象棋對戰 <span class="ai-badge">AI 對戰</span></h1>
      <div class="conn-badge" :class="{ connected: isConnected }">
        <span class="conn-dot" />
        {{ isConnected ? 'AI 已連線' : 'AI 連線中...' }}
      </div>
    </header>

    <main class="app-main">
      <!-- 左側：遊戲資訊 -->
      <aside class="info-panel">
        <div class="player-card black-card" :class="{ 'turn-active': gameState?.turn === 'b' }">
          <div class="player-icon black-solid-icon">卒</div>
          <div>
            <p class="player-name">
              黑方 {{ (gameState?.humanCamp ?? selectedCamp) === Camp.BLACK ? '（玩家）' : '（AI）' }}
            </p>
            <p v-if="(gameState?.humanCamp ?? selectedCamp) === Camp.BLACK" class="player-sub">
              後手 <span v-if="gameState?.isHumanTurn" class="active-tag">· 操作中</span>
            </p>
            <p v-else class="player-sub">
              風格：<span class="strategy-tag">
                {{ gameState?.currentAiStyle || '風格讀取中...' }}
                <span v-if="gameState?.aiLevel" style="opacity: 0.7; margin-left: 4px;">· {{ gameState.aiLevel }}</span>
              </span>
            </p>
          </div>
        </div>

        <div class="status-box" :class="statusClass">
          <p class="status-label">{{ statusText }}</p>
        </div>

        <div class="player-card red-card" :class="{ 'turn-active': gameState?.turn === 'w' }">
          <div class="player-icon red-solid-icon">兵</div>
          <div>
            <p class="player-name">
              紅方 {{ (gameState?.humanCamp ?? selectedCamp) === Camp.RED ? '（玩家）' : '（AI）' }}
            </p>
            <p v-if="(gameState?.humanCamp ?? selectedCamp) === Camp.RED" class="player-sub">
              先手 <span v-if="gameState?.isHumanTurn" class="active-tag">· 操作中</span>
            </p>
            <p v-else class="player-sub">
              風格：<span class="strategy-tag">
                {{ gameState?.currentAiStyle || '風格讀取中...' }}
                <span v-if="gameState?.aiLevel" style="opacity: 0.7; margin-left: 4px;">· {{ gameState.aiLevel }}</span>
              </span>
            </p>
          </div>
        </div>


        <div class="action-btns">
          <button
            class="btn btn-warning"
            :disabled="!gameState || undoCount <= 0 || (!gameState.isHumanTurn && !isGameOver)"
            @click="handleUndo"
          >
            悔棋 ( {{ undoCount }} )
          </button>

          <button
            class="btn btn-danger"
            :disabled="!gameState || isGameOver"
            @click="showResignConfirm = true"
          >
            認輸
          </button>
        </div>

        <!-- 認輸確認彈窗 -->
        <Teleport to="body">
          <Transition name="modal">
            <div v-if="showResignConfirm" class="confirm-overlay">
              <div class="confirm-box">
                <p class="confirm-msg">確定要認輸嗎？</p>
                <div class="confirm-actions">
                  <button class="btn btn-danger" @click="confirmResign">確定</button>
                  <button class="btn btn-secondary" @click="showResignConfirm = false">取消</button>
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>


        <!-- 通用提示彈窗 -->
        <Teleport to="body">
          <Transition name="modal">
            <div v-if="alertMessage" class="confirm-overlay" @click="alertMessage = ''">
              <div class="confirm-box luxe-alert" @click.stop>
                <div class="alert-icon">💡</div>
                <p class="confirm-msg">{{ alertMessage }}</p>
                <div class="confirm-actions">
                  <button class="btn btn-primary" @click="alertMessage = ''">知道了</button>
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>


        <!-- 歷史紀錄 (手機端平舖最新一步 / 電腦端側邊欄) -->
        <div class="move-history">
          <p class="history-title" @click="toggleHistoryModal">
            對局記錄 
            <span class="mobile-only-toggle">查看全部</span>
          </p>
          
          <div class="history-list">
            <!-- 手機端：始終只顯示最新一步 (點擊開啟彈窗) -->
            <template v-if="latestMovePair">
              <div class="move-row latest-move-hint luxe-glow mobile-only" @click="toggleHistoryModal">
                <span class="move-num">{{ latestMovePair.num }}.</span>
                <span class="move-content red-text">{{ latestMovePair.red }}</span>
                <span class="move-content black-text">{{ latestMovePair.black }}</span>
              </div>
            </template>

            <!-- 電腦版：顯示完整清單 (手機版則隱藏，改由彈窗顯示) -->
            <div class="desktop-only-history">
              <template v-if="gameState?.fullHistory?.length">
                <div
                  v-for="pairIdx in Math.ceil(gameState.fullHistory.length / 2)"
                  :key="pairIdx"
                  class="move-row"
                >
                  <span class="move-num">{{ pairIdx }}.</span>
                  <span class="move-content red-text">
                    {{ gameState.fullHistory[(pairIdx - 1) * 2] }}
                  </span>
                  <span class="move-content black-text">
                    {{ gameState.fullHistory[(pairIdx - 1) * 2 + 1] || '' }}
                  </span>
                </div>
              </template>
              <div v-else class="history-empty">
                等待對局開始...
              </div>
            </div>
          </div>
        </div>

        <!-- 手機端專用：歷史紀錄彈窗 -->
        <Teleport to="body">
          <Transition name="fade">
            <div v-if="showHistoryModal" class="history-modal-overlay" @click.self="showHistoryModal = false">
              <div class="history-modal-content">
                <div class="modal-header">
                  <h3>完整對局紀錄</h3>
                  <button class="close-btn" @click="showHistoryModal = false">×</button>
                </div>
                <div class="modal-body history-list">
                <template v-if="gameState?.fullHistory?.length">
                  <div
                    v-for="pairIdx in Math.ceil(gameState.fullHistory.length / 2)"
                    :key="pairIdx"
                    class="move-row"
                  >
                    <span class="move-num">{{ pairIdx }}.</span>
                    <span class="move-content red-text">
                      {{ gameState.fullHistory[(pairIdx - 1) * 2] }}
                    </span>
                    <span class="move-content black-text">
                      {{ gameState.fullHistory[(pairIdx - 1) * 2 + 1] || '' }}
                    </span>
                  </div>
                </template>
                <div v-else class="history-empty">
                  暫無對局紀錄
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      </aside>

      <!-- 中間：棋盤 -->
      <section class="board-section">
        <div v-if="!gameState" class="pre-game-overlay">
          <div class="overlay-content">
            <p class="overlay-title">選擇您的陣營</p>
            <div class="camp-selector">
              <button
                class="camp-btn red-btn"
                :class="{ active: selectedCamp === Camp.RED }"
                @click="selectedCamp = Camp.RED"
              >
                <span class="p-icon">兵</span> 執紅先手
              </button>
              <button
                class="camp-btn black-btn"
                :class="{ active: selectedCamp === Camp.BLACK }"
                @click="selectedCamp = Camp.BLACK"
              >
                <span class="p-icon">卒</span> 執黑後手
              </button>
            </div>
            <button class="btn btn-primary start-btn" @click="handleInitGame">
              開始遊戲
            </button>
          </div>
        </div>

        <ChessBoard
          v-if="currentBoard"
          :board="currentBoard"
          :current-turn="gameState?.turn ?? Camp.RED"
          :human-camp="gameState?.humanCamp ?? selectedCamp"
          :flipped="(gameState?.humanCamp ?? selectedCamp) === Camp.BLACK"
          :last-move="lastMovePair"
          :disabled="!gameState || isGameOver || gameState.turn !== (gameState?.humanCamp ?? selectedCamp)"
          @move="onPlayerMove"
        />

        <Transition name="fade">
          <div v-if="gameState?.status === GameStatus.CHECK" class="check-alert-overlay">
             <div class="check-glow" />
             <div class="check-text">⚠ 將軍！</div>
          </div>
        </Transition>



      </section>

      <!-- 右側：被吃掉的棋子 -->
      <aside class="captured-panel">
        <div class="captured-group">
          <p class="captured-title">黑方損失</p>
          <div class="captured-list">
            <div v-for="(pType, idx) in sortedCapturedBlack" :key="'b-'+idx" class="mini-piece-box">
              <ChessPiece :piece="{ camp: Camp.BLACK, type: pType }" />
            </div>
          </div>
        </div>
        <div class="captured-group">
          <p class="captured-title">紅方損失</p>
          <div class="captured-list">
            <div v-for="(pType, idx) in sortedCapturedRed" :key="'r-'+idx" class="mini-piece-box">
              <ChessPiece :piece="{ camp: Camp.RED, type: pType }" />
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- 勝負全屏 Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="gameOverMsg" class="game-over-modal shadow-overlay">
          <div class="modal-content luxe-game-over">
            <div class="modal-icon">{{ gameOverIcon }}</div>
            <h2 class="modal-title">{{ gameOverMsg }}</h2>
            <div class="modal-actions mt-6">
              <button class="btn btn-primary btn-lg" @click="handleInitGame">再來一局</button>
              <button 
                class="btn btn-warning btn-lg" 
                :disabled="undoCount <= 0"
                @click="handleUndo"
              >
                悔棋 ({{ undoCount }})
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import ChessBoard from './components/ChessBoard.vue';
import ChessPiece from './components/ChessPiece.vue';
import { useSocket } from './composables/useSocket';
import { Camp, parseFEN, GameStatus } from '@chinese-chess/shared';
import type { Position, BoardState } from '@chinese-chess/shared';


const { isConnected, gameState, gameOver, sendMove, initGame: socketInit, resign: socketResign, undoMove: socketUndo } = useSocket();

// ─── 遊戲控制狀態 ─────────────────────────────────────────────────────────────

const undoCount = ref(10);

const showResignConfirm = ref(false);
const historyRef = ref<HTMLElement | null>(null);
const selectedCamp = ref<Camp>(Camp.RED);
const alertMessage = ref('');



const isGameOver = computed(() =>
  gameOver.value !== null ||
  gameState.value?.status === GameStatus.CHECKMATE
);



// ─── 棋盤狀態 ──────────────────────────────────────────────────────────────

const currentBoard = computed<BoardState | null>(() => {
  if (!gameState.value) return null;
  return parseFEN(gameState.value.fen);
});

const lastMovePair = computed<Position[] | null>(() => {
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

// ─── 遊戲歷史記錄 ──────────────────────────────────────────────────────────
const showHistoryModal = ref(false);
const toggleHistoryModal = () => {
  showHistoryModal.value = !showHistoryModal.value;
};

// 取得最新的一對步法（用於手機摺疊模式）
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

watch(() => gameState.value?.fullHistory, () => {
  nextTick(() => {
    if (historyRef.value) {
      historyRef.value.scrollTop = historyRef.value.scrollHeight;
    }
  });
}, { deep: true });



// ─── 勝負提示 ──────────────────────────────────────────────────────────────

const gameOverMsg = computed<string | null>(() => {
  if (!gameOver.value) return null;
  const { winner: overWinner, reason } = gameOver.value;
  // 優先從 gameState 拿更準確的 winner，拿不到再用 event 的
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


// ─── 狀態文字 ──────────────────────────────────────────────────────────────

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

// ─── 吃子排序 ──────────────────────────────────────────────────────────────

const PIECE_ORDER: Record<string, number> = { k: 7, r: 6, c: 5, n: 4, b: 3, a: 2, p: 1 };

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

// ─── 玩家動作 ──────────────────────────────────────────────────────────────

function handleInitGame() {
  undoCount.value = 10;
  showResignConfirm.value = false;
  socketInit(selectedCamp.value);
}



function confirmResign() {
  showResignConfirm.value = false;
  socketResign();
}

function handleUndo() {
  if (!gameState.value) return;

  // 檢查是否已經有走棋紀錄
  if (!gameState.value.fullHistory || gameState.value.fullHistory.length === 0) {
    alertMessage.value = '對局尚未開始，還不能悔棋喔！';
    return;
  }

  if (undoCount.value > 0) {
    // 只有在真的是人類回合（或者遊戲結束想悔棋）時才允許
    const isHuman = gameState.value.turn === (gameState.value.humanCamp || selectedCamp.value);
    if (isHuman || isGameOver.value) {
      undoCount.value--;
      socketUndo();
    }
  }
}




function onPlayerMove(from: Position, to: Position) {
  sendMove('global-game', from, to);
}
</script>

<style scoped>
.app-shell {
  /* 基礎視覺變數 - 經典木紋棋盤 + 奢華深色外殼 */
  --app-bg: #0d0d1a;
  --panel-bg: rgba(255, 255, 255, 0.03);
  --board-bg: #d2b48c; /* 調深後的木紋色 */
  --board-line: rgba(80, 50, 20, 0.6); /* 更深的格線 */
  --highlight-lastmove: rgba(139, 90, 43, 0.25);
  --accent-color: #d4a373; /* 古銅金 */
  --text-main: #f5e6c8;
  --text-sub: #888;

  height: 100vh;
  background: var(--app-bg);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}


/* 背景光暈 */
.bg-glow {
  position: fixed;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
  opacity: 0.25;
}
.red-glow {
  width: 500px; height: 500px;
  background: #c41c1c;
  top: -100px; left: -100px;
}
.blue-glow {
  width: 500px; height: 500px;
  background: #1e40af;
  bottom: -100px; right: -150px;
}

.app-header {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 32px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  backdrop-filter: blur(10px);
}

.title {
  font-size: 1.4rem;
  font-weight: 700;
  font-family: 'Noto Serif TC', serif;
  color: #f5e6c8;
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-badge {
  font-size: 0.7rem;
  font-weight: 600;
  background: linear-gradient(135deg, #c41c1c, #8b0000);
  color: white;
  padding: 3px 10px;
  border-radius: 999px;
  letter-spacing: 0.5px;
}

.conn-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: #888;
  transition: color 0.3s;
}
.conn-badge.connected { color: #4ade80; }
.conn-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: blink 1.5s ease-in-out infinite;
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

.app-main {
  position: relative;
  z-index: 10;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 3vw;
  padding: 0 20px;
  flex: 1;
  width: 100%;
  max-width: 1800px;
  margin: 0 auto;
  height: calc(100vh - 80px);
  min-height: 0;
  overflow: hidden; /* 確保內部溢出不影響外部 */
}












/* ─── Info Panel ──────────────────────────────── */
.info-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5vh;
  width: 20%; /* 使用百分比而非固定像素 */
  min-width: 260px;
  max-width: 340px;
  height: 90%;
  min-height: 0;
  padding-bottom: 20px;
}


/* ─── 吃子顯示區 (右側) ───────────────────────── */
.captured-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5vh;
  width: 20%;
  min-width: 260px;
  max-width: 340px;
  height: 90%;
  padding: 20px 0;
  justify-content: center;
}


.captured-group {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: inset 0 0 30px rgba(0,0,0,0.2);
}

.captured-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 2px;
  text-align: left;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  padding-bottom: 8px;
  margin-bottom: 4px;
}

.captured-list {
  display: grid;
  /* 根據面板寬度自動調整列數 */
  grid-template-columns: repeat(auto-fill, minmax(45px, 1fr));
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
}

.mini-piece-box {
  width: clamp(38px, 4vw, 54px); /* 尺寸也會隨螢幕大小微調 */
  height: clamp(38px, 4vw, 54px);
  flex-shrink: 0;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
}


/* 針對小棋子的樣式微調 */
:deep(.mini-piece-box .chess-piece) {
  font-size: 20px !important;
  border-width: 2px !important;
  cursor: default;
}
:deep(.mini-piece-box .chess-piece:hover) {
  transform: none; /* 移除 hover 縮放，使其看起來更像靜態顯示 */
}










.player-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 14px 16px;
  transition: border-color 0.3s, box-shadow 0.3s;
}
.player-card.turn-active {
  border-color: rgba(250, 200, 60, 0.5);
  box-shadow: 0 0 16px rgba(250,200,60,0.15);
}
.black-solid-icon {
  width: 32px;
  height: 32px;
  background: #333;
  color: #ccc;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem !important;
  font-weight: bold;
  border: 1px solid rgba(255,255,255,0.1);
}
.red-solid-icon {
  width: 32px;
  height: 32px;
  background: #e03030;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem !important;
  font-weight: bold;
}

.player-name { font-size: 0.9rem; font-weight: 600; color: #e8e8e8; }

.player-sub  { font-size: 0.7rem; color: #666; }
.active-tag {
  color: #4ade80;
  font-weight: bold;
}

.strategy-tag {
  color: #facc15;
  font-weight: bold;
  background: rgba(250, 204, 21, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
}

/* AI 思考動畫 */
.thinking-dots {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.thinking-dots span {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #facc15;
  animation: bounce 1s ease-in-out infinite;
}
.thinking-dots span:nth-child(2) { animation-delay: 0.15s; }
.thinking-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }

.status-box {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 10px 16px;
  text-align: center;
  transition: all 0.3s;
}
.status-label { font-size: 0.85rem; color: #ccc; }
.status-box.status-red    { border-color: rgba(220,60,60,0.5); }
.status-box.status-black  { border-color: rgba(100,120,200,0.5); }
.status-box.status-check  {
  border-color: #facc15;
  background: rgba(250,200,20,0.08);
  animation: shake 0.4s ease;
}
@keyframes shake {
  0%,100%{ transform:translateX(0) }
  20%{ transform:translateX(-5px) }
  60%{ transform:translateX(5px) }
}

.action-btns {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}


.btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  font-family: inherit;
}
.btn-primary {
  background: linear-gradient(135deg, #c41c1c, #8b0000);
  color: white;
}
.btn-primary:hover { filter: brightness(1.15); transform: translateY(-1px); }
.btn-danger {
  background: rgba(255,255,255,0.06);
  color: #888;
  border: 1px solid rgba(255,255,255,0.1);
}
.btn-danger:not(:disabled):hover { background: rgba(200,40,40,0.15); color: #e88; }
.btn-danger:disabled { opacity: 0.35; cursor: not-allowed; }

.btn-lg {
  padding: 14px 32px;
  font-size: 1rem;
}

.mt-6 { margin-top: 24px; }

/* ─── 性格氛圍系統 (Style Atmosphere) ───────────────────────── */

/* ─── 5 級榮譽性格氛圍系統 (5-Level Elite System) ─────────────────── */

/* 1. 穩定平衡 (高手) - 翡翠綠 */
.skin-balanced .red-glow { background: #10b981; opacity: 0.3; }
.skin-balanced .blue-glow { background: #064e3b; opacity: 0.25; }
.skin-balanced .strategy-tag { border-color: #22c55e; color: #86efac; background: rgba(6, 78, 59, 0.2); }

/* 2. 鐵壁守備 (學者) - 琥珀橘 */
.skin-defensive .red-glow { background: #f59e0b; opacity: 0.3; }
.skin-defensive .blue-glow { background: #78350f; opacity: 0.25; }
.skin-defensive .strategy-tag { border-color: #f59e0b; color: #fcd34d; background: rgba(120, 53, 15, 0.2); }

/* 3. 狂暴強襲 (大師) - 魅影紫 */
.skin-aggressive .red-glow { background: #a855f7; opacity: 0.3; }
.skin-aggressive .blue-glow { background: #581c87; opacity: 0.25; }
.skin-aggressive .strategy-tag { border-color: #d8b4fe; color: #f5d0fe; background: rgba(88, 28, 135, 0.2); }

/* 4. 萬卒齊發 (宗師) - 深海藍 */
.skin-pawn-king .red-glow { background: #2563eb; opacity: 0.3; }
.skin-pawn-king .blue-glow { background: #1e3a8a; opacity: 0.25; }
.skin-pawn-king .strategy-tag { border-color: #60a5fa; color: #bfdbfe; background: rgba(30, 58, 138, 0.2); }

/* 5. 絕世魔王 (至尊) - 毀滅紅 */
.skin-boss .red-glow { background: #e11d48; opacity: 0.4; }
.skin-boss .blue-glow { background: #881337; opacity: 0.3; }
.skin-boss .strategy-tag { border-color: #fb7185; color: #fb7185; background: rgba(136, 19, 55, 0.2); animation: boss-tag-pulse 2s infinite; }

/* ────────────────────────────────────────────────────────── */
.move-history {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 強制啟動內部滾動模式 */
  overflow: hidden;
  box-shadow: inset 0 0 20px rgba(0,0,0,0.3);
}




.history-title {
  font-size: 0.7rem;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}
.history-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  padding-right: 4px;
}

/* 自定義滾動條 - 強化可見度 */
.history-list::-webkit-scrollbar {
  width: 8px; 
}
.history-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}
.history-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2); 
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: content-box;
}
.history-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}



.move-row {
  display: grid;
  grid-template-columns: 40px 1fr 1fr;
  gap: 8px;
  font-size: 0.85rem;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  margin-bottom: 4px;
}
.desktop-only-history {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
}
.mobile-only {
  display: none;
}


.history-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  color: #888; /* 提高灰度對比度 */
  font-style: italic;
  letter-spacing: 1px;
}



/* ─── Board Section ─────────────────────────── */
.board-section {
  position: relative;
  /* 棋盤核心響應式比例：寬度自動佔據中間，但不超過 800px，高度不超過螢幕 75% */
  width: min(50vw, 800px, 75vh * 440 / 480);
  aspect-ratio: 440 / 480;
  filter: drop-shadow(0 0 40px rgba(0,0,0,0.6));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0; /* 禁止棋盤被壓縮變形 */
}







.pre-game-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.85); /* 稍微深一點 */
  backdrop-filter: blur(12px);
  border-radius: 8px;
  z-index: 20;
  color: #f5e6c8;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.overlay-content {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.overlay-title {
  font-size: 1.5rem;
  font-weight: 700;
  font-family: 'Noto Serif TC', serif;
  letter-spacing: 2px;
}

.camp-selector {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.camp-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  color: #888;
  width: 140px;
}

.camp-btn .p-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  font-weight: bold;
}

.red-btn .p-icon { background: #e03030; color: white; }
.black-btn .p-icon { background: #333; color: #ccc; border: 1px solid rgba(255,255,255,0.2); }

.camp-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-2px);
}

.camp-btn.active {
  background: rgba(255, 255, 255, 0.12);
  border-color: #facc15;
  color: #fff;
  box-shadow: 0 0 20px rgba(250, 204, 21, 0.2);
}

.start-btn {
  font-size: 1.1rem;
  padding: 12px 32px;
  align-self: center;
}

.pre-game-overlay p {
  white-space: nowrap;
}




/* 勝負 Modal (全屏) */
.game-over-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85); /* 稍微加深遮罩 */
  backdrop-filter: blur(12px);
  z-index: 9999; /* 極高層級 */
}

/* 確保全屏遮罩無死角 */
.shadow-overlay {
  box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.85);
}
.luxe-game-over {
  text-align: center;
  padding: 60px 80px;
  background: rgba(30, 30, 46, 0.95);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 24px;
  box-shadow: 0 0 100px rgba(0,0,0,0.8), 0 0 30px rgba(245, 230, 200, 0.1);
  max-width: 90vw;
}
.modal-icon { font-size: 3.5rem; margin-bottom: 12px; }
.modal-title { font-size: 1.4rem; font-weight: 700; color: #f5e6c8; }
.modal-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.modal-enter-active, .modal-leave-active { transition: opacity 0.3s, transform 0.3s; }
.modal-enter-from { opacity: 0; transform: scale(0.9); }
.modal-leave-to   { opacity: 0; transform: scale(0.9); }

/* 認輸確認彈窗樣式 */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}
.confirm-box {
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 32px;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0,0,0,0.5);
}
.confirm-msg {
  font-size: 1.2rem;
  margin-bottom: 24px;
  color: #e8e8e8;
}
.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
}
.btn-secondary:hover { background: rgba(255, 255, 255, 0.15); }
.btn-warning {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
}
.btn-warning:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
.btn-warning:disabled { opacity: 0.4; cursor: not-allowed; }

/* 自定義提示彈窗微調 */
.luxe-alert {
  min-width: 300px;
  border-top: 4px solid #facc15;
}
.alert-icon {
  font-size: 2.5rem;
  margin-bottom: 16px;
}

/* 將軍動畫相關 */
.check-alert-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 25;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.check-glow {
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 100px rgba(220, 38, 38, 0.6);
  animation: check-pulse 1.2s ease-in-out infinite;
}

.check-text {
  font-size: 4rem;
  font-weight: 900;
  color: #ff4444;
  text-shadow: 0 0 20px rgba(0,0,0,0.8), 0 0 10px rgba(255,0,0,0.5);
  font-family: 'Noto Serif TC', serif;
  animation: check-shake 0.5s cubic-bezier(.36,.07,.19,.97) infinite;
  z-index: 2;
  letter-spacing: 8px;
}

@keyframes check-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

@keyframes check-shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.4s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ─── 手機響應式優化 (Mobile Responsive) ───────────────── */
@media (max-width: 768px) {
  .app-shell {
    height: auto;
    min-height: 100vh;
    overflow-y: auto;
  }

  .app-header {
    padding: 10px 16px;
  }

  .app-main {
    display: grid;
    /* 頂部四格對等分，下方棋盤與紀錄全寬 */
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: auto auto auto auto;
    gap: 10px;
    padding: 8px;
    width: 100%;
    align-items: start;
  }

  /* 核心技術：讓子元素直接參與 app-main 的 grid 排版 */
  .info-panel {
    display: contents;
  }

  /* 1. 隱藏狀態提示盒與吃子面板 */
  .status-box, .captured-panel {
    display: none;
  }

  /* 2. 統一頂部四個單元格的風格 */
  .black-card, .red-card, .action-btns .btn {
    grid-row: 1;
    height: 36px !important; /* 統一高度 */
    background: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 8px !important;
    display: flex !important;
    align-items: center;
    justify-content: center;
    padding: 0 4px !important;
    margin: 0 !important;
    box-shadow: none !important;
    transition: all 0.2s;
    min-width: 0;
  }

  /* 當前執子方的特殊高亮 (背景呼吸燈效果) */
  .player-card.turn-active {
    border-color: rgba(250, 204, 21, 0.4) !important;
    animation: breathing-glow 2s ease-in-out infinite;
    background: rgba(250, 204, 21, 0.15) !important;
  }

  @keyframes breathing-glow {
    0%, 100% { box-shadow: 0 0 5px rgba(250, 204, 21, 0.1); border-color: rgba(250, 204, 21, 0.2); }
    50% { box-shadow: 0 0 15px rgba(250, 204, 21, 0.4); border-color: rgba(250, 204, 21, 0.6); }
  }

  .black-card { grid-column: 1; flex-direction: row !important; }
  .red-card   { grid-column: 2; flex-direction: row !important; }

  /* 隱藏 Icon、副標題與原本的三個點 */
  .player-icon, .player-sub, .thinking-dots { display: none !important; }
  .player-name { 
    font-size: 0.7rem; 
    font-weight: 600; 
    white-space: nowrap;
    text-align: center;
    color: #ccc;
  }

  /* 4. 控制按鈕 (第三格與第四格) */
  .action-btns {
    display: contents;
  }

  .action-btns .btn-warning {
    grid-column: 3;
    color: #facc15 !important;
  }

  .action-btns .btn-danger {
    grid-column: 4;
    color: #f87171 !important;
  }

  /* 5. 棋盤核心 (置中全寬) */
  .board-section {
    grid-column: 1 / 5;
    grid-row: 2;
    width: 98vw !important;
    margin: 2px auto;
  }

  /* 7. 歷史紀錄 (手機版佈局) */
  .move-history {
    grid-column: 1 / 5;
    grid-row: 3;
    width: 100%;
    margin-top: 2px;
    background: transparent !important;
  }

  .desktop-only-history {
    display: none; /* 手機版主畫面不顯示完整清單 */
  }

  .mobile-only {
    display: grid !important;
  }

  .history-title {
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 4px;
    color: #facc15 !important;
    font-size: 0.75rem;
  }

  .mobile-only-toggle {
    font-size: 0.6rem;
    color: #888;
    border: 1px solid rgba(255,255,255,0.1);
    padding: 1px 4px;
    border-radius: 4px;
  }

  /* 歷史紀錄彈窗樣式 */
  .history-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(8px);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .history-modal-content {
    background: #1e1e2e;
    width: 100%;
    max-width: 400px;
    max-height: 80vh;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
  }

  .modal-header {
    padding: 16px;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .modal-header h3 { font-size: 1rem; color: #facc15; }
  .close-btn { 
    background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer; 
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .title { font-size: 0.9rem; }
  .app-header { padding: 6px 12px; }
  .check-text { font-size: 1.8rem; }
  .thinking-dots { top: 2px !important; right: 2px !important; }
}



</style>


