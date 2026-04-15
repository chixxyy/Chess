<template>
  <div class="app-shell">
    <!-- 背景光暈 -->
    <div class="bg-glow red-glow" />
    <div class="bg-glow blue-glow" />

    <header class="app-header">
      <h1 class="title">中國象棋 <span class="ai-badge">AI 對戰</span></h1>
      <div class="conn-badge" :class="{ connected: isConnected }">
        <span class="conn-dot" />
        {{ isConnected ? '已連線' : '連線中...' }}
      </div>
    </header>

    <main class="app-main">
      <!-- 左側：遊戲資訊 -->
      <aside class="info-panel">
        <div class="player-card black-card" :class="{ 'turn-active': gameState?.turn === 'b' }">
          <div class="player-icon black-solid-icon">卒</div>
          <div>
            <p class="player-name">黑方（AI）</p>
            <p class="player-sub">電腦對手</p>
          </div>
          <div v-if="gameState?.turn === 'b' && !isGameOver" class="thinking-dots">
            <span/><span/><span/>
          </div>
        </div>


        <div class="status-box" :class="statusClass">
          <p class="status-label">{{ statusText }}</p>
        </div>

        <div class="player-card red-card" :class="{ 'turn-active': gameState?.turn === 'w' }">
          <div class="player-icon red-solid-icon">兵</div>
          <div>
            <p class="player-name">紅方（玩家）</p>
            <p class="player-sub">先手 · 操作中</p>
          </div>
        </div>


        <div class="action-btns">
          <!-- 移除重複的開始遊戲按鈕，統一使用遮罩內的按鈕 -->

          
          <button
            class="btn btn-warning"
            :disabled="!gameState || undoCount <= 0 || (gameState.turn !== 'w' && !isGameOver)"
            @click="handleUndo"
          >
            悔棋 (剩餘 {{ undoCount }} 次)
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


        <!-- 歷史紀錄 (始終顯示) -->
        <div class="move-history">
          <p class="history-title">對局記錄</p>
          <div class="history-list" ref="historyRef">
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


        <!-- 將軍動畫 Overlay -->
        <Transition name="fade">
          <div v-if="gameState?.status === GameStatus.CHECK" class="check-alert-overlay">
             <div class="check-glow" />
             <div class="check-text">⚠ 將軍！</div>
          </div>
        </Transition>

        <!-- 勝負 Modal -->
        <Transition name="modal">
          <div v-if="gameOverMsg" class="game-over-modal">
            <div class="modal-content">
              <div class="modal-icon">{{ gameOverIcon }}</div>
              <h2 class="modal-title">{{ gameOverMsg }}</h2>
              <button class="btn btn-primary mt-6" @click="handleInitGame">再來一局</button>
            </div>
          </div>
        </Transition>

      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import ChessBoard from './components/ChessBoard.vue';
import { useSocket } from './composables/useSocket';
import { Camp, parseFEN, INITIAL_FEN, GameStatus } from '@chinese-chess/shared';
import type { Position, BoardState } from '@chinese-chess/shared';


const { isConnected, gameState, gameOver, sendMove, initGame: socketInit, resign: socketResign, undoMove: socketUndo } = useSocket();

// ─── 遊戲控制狀態 ─────────────────────────────────────────────────────────────

const undoCount = ref(10);

const showResignConfirm = ref(false);
const historyRef = ref<HTMLElement | null>(null);
const selectedCamp = ref<Camp>(Camp.RED);


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

// ─── 遊戲歷史記錄 ──────────────────────────────────────────────────────────

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
  const { winner, reason } = gameOver.value;
  const isWinner = winner === (gameState.value?.humanCamp || selectedCamp.value);
  const winName = winner === Camp.RED ? '紅方' : '黑方';

  if (reason === 'RESIGN') {
    return isWinner ? `對方已認輸，${winName}勝！` : `你已認輸，${winName}勝！`;
  }
  
  if (winner === 'DRAW') return '平局！';
  return isWinner ? '恭喜！你贏了！' : `${winName}獲勝！將軍！`;
});


const gameOverIcon = computed(() => {
  if (!gameOver.value) return '';
  return gameOver.value.winner === Camp.RED ? '🏆' : '🤖';
});

// ─── 狀態文字 ──────────────────────────────────────────────────────────────

const statusText = computed(() => {
  if (!gameState.value) return '等待開始';
  switch (gameState.value.status) {
    case GameStatus.WAITING: return '等待開始';
    case GameStatus.PLAYING: return gameState.value.turn === Camp.RED ? '紅方回合' : 'AI 思考中...';
    case GameStatus.CHECK: return gameState.value.turn === Camp.RED ? '⚠ 紅方被將！' : '⚠ 黑方被將！';
    case GameStatus.CHECKMATE: return '將死！';
    default: return '遊戲中';
  }
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
  if (undoCount.value > 0 && gameState.value) {
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
  height: 100vh; /* 鎖死高度 */
  background: #0d0d1a;
  position: relative;
  overflow: hidden; /* 強製禁止全局滾動 */
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
  display: grid;
  grid-template-columns: 340px minmax(400px, 850px);
  gap: 50px;
  padding: 10px 40px;
  flex: 1;
  justify-content: center;
  align-items: center;
  max-width: 1600px;
  margin: 0 auto;
  width: 100%;
  height: calc(100vh - 80px);
  min-height: 0; /* 允許收縮 */
  overflow: hidden; /* 禁止主區域溢出 */
}









/* ─── Info Panel ──────────────────────────────── */
.info-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  height: 100%;
  min-height: 0; /* 關鍵：允許內容在 Flexbox 內收縮 */
  padding-bottom: 20px; /* 增加底部緩衝防止切邊 */
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

.mt-6 { margin-top: 24px; }

/* ─── 走棋歷史 ──────────────────────────────── */
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
.red-text   { color: #f87171; }
.black-text { color: #93c5fd; }
.move-num   { color: #555; font-weight: bold; }
.move-content { font-family: 'Noto Sans TC', sans-serif; }


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
  /* 極大化邏輯：寬度最大 850px，高度最大不超過螢幕 78% */
  width: min(92vw, 850px, 78vh * 440 / 480);
  aspect-ratio: 440 / 480;
  filter: drop-shadow(0 0 40px rgba(0,0,0,0.6));
  display: flex;
  align-items: center;
  justify-content: center;
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




/* ─── 勝負 Modal ────────────────────────────── */
.game-over-modal {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(6px);
  z-index: 30;
  border-radius: 4px;
}
.modal-content {
  text-align: center;
  padding: 40px 48px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  backdrop-filter: blur(16px);
}
.modal-icon { font-size: 3.5rem; margin-bottom: 12px; }
.modal-title { font-size: 1.4rem; font-weight: 700; color: #f5e6c8; }

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

</style>


