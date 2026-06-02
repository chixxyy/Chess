<template>
  <div 
    :class="[
      'player-card', 
      isRed ? 'red-card' : 'black-card',
      { 'turn-active': gameState?.turn === side }
    ]"
  >
    <div :class="['player-icon', isRed ? 'red-solid-icon' : 'black-solid-icon']">
      {{ isRed ? '兵' : '卒' }}
    </div>
    <div>
      <p class="player-name">
        <span class="desktop-text">{{ isRed ? '紅方' : '黑方' }} {{ isHuman ? '（玩家）' : '（AI）' }}</span>
        <span class="mobile-text">{{ isRed ? '紅' : '黑' }}{{ isHuman ? '(我)' : '(AI)' }}</span>
      </p>
      <p v-if="isHuman" class="player-sub">
        {{ isRed ? '先手' : '後手' }}
        <span v-if="gameState?.isHumanTurn" class="active-tag">· 操作中</span>
      </p>
      <p v-else class="player-sub">
        風格：<span class="strategy-tag">
          {{ gameState?.currentAiStyle || '讀取中...' }}
          <span v-if="gameState?.aiLevel" style="opacity: 0.7; margin-left: 4px;">· {{ gameState.aiLevel }}</span>
        </span>
      </p>
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

const { gameState, selectedCamp } = useChessStore();

const isRed = computed(() => props.side === 'w');
const targetCamp = computed(() => isRed.value ? Camp.RED : Camp.BLACK);

const isHuman = computed(() => {
  const humanCamp = gameState.value?.humanCamp ?? selectedCamp.value;
  return humanCamp === targetCamp.value;
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
