<template>
  <div class="board-outer">
    <!-- 棋盤容器 -->
    <div class="board-wrap" ref="boardRef" :class="{ 'is-flipped': flipped }">

      <!-- SVG 格線 -->
      <svg class="board-lines" viewBox="0 0 440 480" preserveAspectRatio="none">
        <!-- 外框 -->
        <rect x="20" y="20" width="400" height="440" fill="none" stroke="var(--board-line)" stroke-width="1.5"/>
        
        <!-- 縱線 (9條) -->
        <line v-for="col in 9" :key="'v'+col"
          :x1="20 + (col - 1) * 50" :y1="20"
          :x2="20 + (col - 1) * 50" :y2="460"
          stroke="var(--board-line)" stroke-width="0.8"/>
        
        <!-- 橫線 (10條，均勻分佈) -->
        <line v-for="row in 10" :key="'h'+row"
          x1="20" :y1="20 + (row - 1) * 48.88"
          x2="420" :y2="20 + (row - 1) * 48.88"
          stroke="var(--board-line)" stroke-width="0.8"/>

        <!-- 楚河漢界 (中間留空，覆蓋在第5條與第6條線之間) -->
        <rect x="20.5" y="216" width="399" height="48"
          fill="var(--board-bg)" stroke="none"/>
        <text x="100" y="248" font-size="20" fill="rgba(100,60,10,0.5)"
          font-family="Noto Serif TC, serif" text-anchor="middle" font-weight="bold">楚  河</text>
        <text x="340" y="248" font-size="20" fill="rgba(100,60,10,0.5)"
          font-family="Noto Serif TC, serif" text-anchor="middle" font-weight="bold">漢  界</text>

        <!-- 九宮格斜線 – 上方黑方 (x=3..5, y=0..2) -->
        <line x1="170" y1="20" x2="270" y2="117.76" stroke="var(--board-line)" stroke-width="0.8"/>
        <line x1="270" y1="20" x2="170" y2="117.76" stroke="var(--board-line)" stroke-width="0.8"/>
        
        <!-- 九宮格斜線 – 下方紅方 (x=3..5, y=7..9) -->
        <line x1="170" y1="362.24" x2="270" y2="460" stroke="var(--board-line)" stroke-width="0.8"/>
        <line x1="270" y1="362.24" x2="170" y2="460" stroke="var(--board-line)" stroke-width="0.8"/>
      </svg>

      <!-- 交叉點選擇器/棋子容器 -->
      <div class="board-cells">
        <template v-for="yIdx in displayRows" :key="'row'+yIdx">
          <div
            v-for="xIdx in displayCols"
            :key="`cell-${xIdx}-${yIdx}`"
            class="cell"
            :class="cellClass(xIdx, yIdx)"
            @click="onCellClick(xIdx, yIdx)"
          >
            <!-- 落點指示 (僅點擊有效區) -->
            <div
              v-if="isLegalTarget(xIdx, yIdx)"
              class="legal-dot"
              :class="{ 'legal-capture': !!getCell(xIdx, yIdx) }"
            />
            <!-- 棋子 -->
            <ChessPiece
              v-if="getCell(xIdx, yIdx)"
              :piece="getCell(xIdx, yIdx)!"
              :selected="isSelected(xIdx, yIdx)"
              class="piece-scale"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import ChessPiece from './ChessPiece.vue';
import { Camp, getLegalMoves } from '@chinese-chess/shared';
import type { BoardState, Piece, Position } from '@chinese-chess/shared';


const props = defineProps<{
  board: BoardState;
  currentTurn: Camp;
  humanCamp: Camp;
  lastMove: Position[] | null; // [from, to]
  disabled?: boolean;
  flipped?: boolean;
}>();

const emit = defineEmits<{
  (e: 'move', from: Position, to: Position): void;
}>();

// ─── 翻轉顯示邏輯 ─────────────────────────────────────────────────────────

const displayRows = computed(() => {
  const rows = Array.from({ length: 10 }, (_, i) => i);
  return props.flipped ? [...rows].reverse() : rows;
});

const displayCols = computed(() => {
  const cols = Array.from({ length: 9 }, (_, i) => i);
  return props.flipped ? [...cols].reverse() : cols;
});

// ─── 選子狀態 ─────────────────────────────────────────────────────────────

const selected = ref<Position | null>(null);
const legalTargets = ref<Position[]>([]);

function getCell(x: number, y: number): Piece | null {
  return props.board[y]?.[x] ?? null;
}

function isSelected(x: number, y: number): boolean {
  return selected.value?.x === x && selected.value?.y === y;
}

function isLegalTarget(x: number, y: number): boolean {
  return legalTargets.value.some(p => p.x === x && p.y === y);
}

function isLastMove(x: number, y: number): boolean {
  if (!props.lastMove) return false;
  return props.lastMove.some(p => p.x === x && p.y === y);
}

function cellClass(x: number, y: number): string[] {
  const cls: string[] = [];
  if (isLastMove(x, y)) cls.push('last-move');
  return cls;
}


// ─── 點擊邏輯 ─────────────────────────────────────────────────────────────

function onCellClick(x: number, y: number) {
  if (props.disabled) return;
  if (props.currentTurn !== props.humanCamp) return;

  const target = getCell(x, y);

  // 已選棋子 → 嘗試移動
  if (selected.value) {
    if (isLegalTarget(x, y)) {
      emit('move', selected.value, { x, y });
      selected.value = null;
      legalTargets.value = [];
      return;
    }
    // 點到自己的棋子 → 換選
    if (target && target.camp === props.humanCamp) {
      selectPiece(x, y);
      return;
    }
    // 點到空地或無效 → 取消選擇
    selected.value = null;
    legalTargets.value = [];
    return;
  }

  // 未選棋子 → 選取己方棋子
  if (target && target.camp === props.humanCamp) {
    selectPiece(x, y);
  }
}

function selectPiece(x: number, y: number) {
  selected.value = { x, y };
  legalTargets.value = getLegalMoves(props.board, { x, y });
}
</script>

<style scoped>
.board-outer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.board-wrap {
  position: relative;
  width: min(90vw, 460px);
  aspect-ratio: 440 / 480;
  background: var(--board-bg);
  border-radius: 4px;
  box-shadow:
    0 0 0 6px #7a5200,
    0 8px 40px rgba(0,0,0,0.7),
    0 2px 8px rgba(0,0,0,0.4);
}

/* 移除整體的 CSS 旋轉，改由座標邏輯翻轉 */

/* SVG 格線填滿容器 */
.board-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.board-lines text {
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
}
.is-flipped .board-lines text {
  transform: rotate(180deg);
}

.board-cells {
  position: absolute;
  --cell-w: calc(400 / 440 * 100% / 8);
  --cell-h: calc(440 / 480 * 100% / 9);
  
  left: calc(20 / 440 * 100% - var(--cell-w) / 2);
  top: calc(20 / 480 * 100% - var(--cell-h) / 2);
  width: calc(400 / 440 * 100% + var(--cell-w));
  height: calc(440 / 480 * 100% + var(--cell-h));
  
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  grid-template-rows: repeat(10, 1fr);
  pointer-events: none;
}

.cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
}

.cell.last-move::after {
  content: '';
  position: absolute;
  width: 85%;
  height: 85%;
  border-radius: 50%;
  background: var(--highlight-lastmove);
  pointer-events: none;
  z-index: 1;
}

.piece-scale {
  width: 88%;
  height: 88%;
}

/* 移除棋子的 rotate(180deg) */

/* 合法落點圓點 */
.legal-dot {
  position: absolute;
  width: 25%;
  height: 25%;
  border-radius: 50%;
  background: rgba(70, 210, 130, 0.75);
  box-shadow: 0 0 6px rgba(70, 210, 130, 0.9);
  pointer-events: none;
  z-index: 3;
  animation: pulse 1s ease-in-out infinite;
}

.is-flipped .legal-dot {
  transform: rotate(180deg);
}

.legal-dot.legal-capture {
  width: 88%;
  height: 88%;
  background: transparent;
  border: 3px solid rgba(70, 210, 130, 0.85);
  box-shadow: 0 0 8px rgba(70,210,130,0.6);
}

@keyframes pulse {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50%       { opacity: 1;   transform: scale(1.15); }
}
</style>
