<template>
  <div class="move-history-container">
    <!-- 歷史紀錄 (手機端平舖最新一步 / 電腦端側邊欄) -->
    <div class="move-history">
      <p class="history-title" @click="toggleModal">
        對局記錄 
        <span class="mobile-only-toggle">查看全部</span>
      </p>
      
      <div class="history-list" ref="historyRef">
        <!-- 手機端：始終只顯示最新一步 (點擊開啟彈窗) -->
        <template v-if="latestMovePair">
          <div class="move-row latest-move-hint luxe-glow mobile-only" @click="toggleModal">
            <span class="move-num">{{ latestMovePair.num }}.</span>
            <span class="move-content red-text">{{ latestMovePair.red }}</span>
            <span class="move-content black-text">{{ latestMovePair.black }}</span>
          </div>
        </template>

        <!-- 電腦版：顯示完整清單 (手機版則隱藏，改由彈窗顯示) -->
        <template v-if="gameState?.fullHistory?.length">
          <div
            v-for="pairIdx in Math.ceil(gameState.fullHistory.length / 2)"
            :key="pairIdx"
            class="move-row desktop-only"
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
        <div v-else class="history-empty desktop-only">
          等待對局開始...
        </div>
      </div>
    </div>

    <!-- 手機端專用：歷史紀錄彈窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showHistoryModal" class="history-modal-overlay" @click.self="toggleModal">
          <div class="history-modal-content">
            <div class="modal-header">
              <h3>完整對局紀錄</h3>
              <button class="close-btn" @click="toggleModal">×</button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useChessStore } from '../composables/useChessStore';

const { gameState, latestMovePair, showHistoryModal } = useChessStore();

const historyRef = ref<HTMLElement | null>(null);

function toggleModal() {
  showHistoryModal.value = !showHistoryModal.value;
}

watch(() => gameState.value?.fullHistory, () => {
  nextTick(() => {
    if (historyRef.value) {
      historyRef.value.scrollTop = historyRef.value.scrollHeight;
    }
  });
}, { deep: true });
</script>
