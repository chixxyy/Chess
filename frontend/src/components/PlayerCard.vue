<template>
  <div 
    :class="[
      'player-card', 
      isRed ? 'red-card' : 'black-card',
      { 'turn-active': gameState?.turn === targetCamp }
    ]"
  >
    <div :class="['player-icon', isRed ? 'red-solid-icon' : 'black-solid-icon']">
      {{ isRed ? '兵' : '卒' }}
    </div>
    <div>
      <p class="player-name">
        <span class="desktop-text">{{ isRed ? '紅方' : '黑方' }} {{ isMe ? '（我）' : (isPvp ? '（對手）' : '（AI）') }}</span>
        <span class="mobile-text">{{ isRed ? '紅' : '黑' }}{{ isMe ? '(我)' : (isPvp ? '(對手)' : '(AI)') }}</span>
      </p>

      <!-- PVP 模式顯示 -->
      <template v-if="isPvp">
        <p v-if="isMe" class="player-sub">
          {{ isRed ? '先手' : '後手' }}
          <span v-if="gameState?.turn === playerCamp" class="active-tag">· 操作中</span>
        </p>
        <p v-else class="player-sub">
          {{ isRed ? '先手' : '後手' }}
          <span v-if="opponentStatus && (!opponentStatus.isOnline || !opponentStatus.isVisible)" style="color: #ef4444; font-weight: 600;">· {{ opponentStatus.statusText }}</span>
          <span v-else-if="opponentStatus && opponentStatus.isOnline && opponentStatus.isVisible" style="color: #22c55e; font-weight: 600;">· 已連線</span>
          <span v-else-if="(gameState?.playersCount ?? 1) >= 2" style="color: #22c55e; font-weight: 600;">· 已連線</span>
          <span v-else style="color: #facc15;">⏳ 等待連線...</span>
        </p>
      </template>

      <!-- PVE 模式顯示 -->
      <template v-else>
        <p v-if="isMe" class="player-sub">
          {{ isRed ? '先手' : '後手' }}
          <span v-if="gameState?.isHumanTurn" class="active-tag">· 操作中</span>
        </p>
        <p v-else class="player-sub">
          風格：<span class="strategy-tag">
            {{ gameState?.currentAiStyle || '讀取中...' }}
            <span v-if="gameState?.aiLevel" style="opacity: 0.7; margin-left: 4px;">· {{ gameState.aiLevel }}</span>
          </span>
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChessStore } from '../composables/useChessStore';
import { Camp } from '@chinese-chess/shared';

const props = defineProps<{
  side: 'w' | 'b';
}>();

const { gameState, playerCamp, gameMode, opponentStatus } = useChessStore();

const isRed = computed(() => props.side === 'w');
const targetCamp = computed(() => isRed.value ? Camp.RED : Camp.BLACK);

const isPvp = computed(() => gameMode.value === 'PVP');

const isMe = computed(() => {
  return playerCamp.value === targetCamp.value;
});
</script>

<style scoped>
.mobile-text {
  display: none;
}

@media (max-width: 768px) {
  .desktop-text {
    display: none;
  }
  .mobile-text {
    display: inline;
  }
}
</style>
