<template>
  <div
    class="chess-piece"
    :class="[campClass, { selected, hint }]"
    :title="label"
  >
    <span class="piece-char">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Camp, PieceType } from '@chinese-chess/shared';
import type { Piece } from '@chinese-chess/shared';


const props = defineProps<{
  piece: Piece;
  selected?: boolean;
  hint?: boolean;
}>();

const campClass = computed(() =>
  props.piece.camp === Camp.RED ? 'piece-red' : 'piece-black'
);

const PIECE_LABEL: Record<Camp, Record<PieceType, string>> = {
  [Camp.RED]: {
    [PieceType.KING]:    '帥',
    [PieceType.ADVISOR]: '仕',
    [PieceType.BISHOP]:  '相',
    [PieceType.KNIGHT]:  '傌',
    [PieceType.ROOK]:    '俥',
    [PieceType.CANNON]:  '炮',
    [PieceType.PAWN]:    '兵',
  },
  [Camp.BLACK]: {
    [PieceType.KING]:    '將',
    [PieceType.ADVISOR]: '士',
    [PieceType.BISHOP]:  '象',
    [PieceType.KNIGHT]:  '馬',
    [PieceType.ROOK]:    '車',
    [PieceType.CANNON]:  '砲',
    [PieceType.PAWN]:    '卒',
  },
};

const label = computed(() => PIECE_LABEL[props.piece.camp][props.piece.type]);
</script>

<style scoped>
.chess-piece {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-weight: 700;
  font-size: clamp(12px, 2.5vmin, 22px);
  line-height: 1;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  user-select: none;
  position: relative;
  z-index: 2;
}

/* 紅方 */
.piece-red {
  background: radial-gradient(circle at 35% 35%, #e03030, #9a0a0a);
  border: 2.5px solid #6b0000;
  color: #fff8e1;
  box-shadow:
    0 2px 6px rgba(0,0,0,0.5),
    inset 0 1px 2px rgba(255,200,150,0.3);
}

/* 黑方 */
.piece-black {
  background: radial-gradient(circle at 35% 35%, #444, #111);
  border: 2.5px solid #000;
  color: #e8e8d0;
  box-shadow:
    0 2px 6px rgba(0,0,0,0.6),
    inset 0 1px 2px rgba(255,255,255,0.08);
}

/* 選中狀態 */
.selected {
  transform: scale(1.1);
  box-shadow:
    0 0 0 3px #facc15,
    0 4px 14px rgba(250,200,20,0.6),
    0 2px 6px rgba(0,0,0,0.5);
}

/* hover */
.chess-piece:hover:not(.selected) {
  transform: scale(1.05);
}

.piece-char {
  font-family: 'Noto Serif TC', 'Noto Serif SC', serif;
  letter-spacing: -0.5px;
}
</style>
