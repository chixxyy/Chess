import { createClient } from '@vercel/kv';
import { Camp, GameStatus, Move, PieceType } from '@chinese-chess/shared';
import { AiStrategy } from './aiEngine';

/**
 * 棋局持久化狀態介面
 */
export interface GameState {
  id: string;
  fen: string;
  turn: Camp;
  status: GameStatus;
  humanCamp: Camp;
  lastMove: Move | null;
  fullHistory: string[];
  capturedPieces: { [Camp.RED]: PieceType[]; [Camp.BLACK]: PieceType[] };
  winner: Camp | 'DRAW' | null;
  strategy: AiStrategy;
  history: any[]; // 撤銷歷史
  lastUpdate: number;
}

const kv = createClient({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export const db = {
  async saveGame(state: GameState): Promise<void> {
    try {
      await kv.set(`game:${state.id}`, state, { ex: 86400 });
      console.log(`[DB] Game ${state.id} saved to Redis`);
    } catch (err) {
      console.error('[DB] Failed to save game:', err);
    }
  },

  async loadGame(gameId: string): Promise<GameState | null> {
    try {
      const state = await kv.get<GameState>(`game:${gameId}`);
      if (state) {
        console.log(`[DB] Game ${gameId} restored from Redis`);
        return state;
      }
    } catch (err) {
      console.error('[DB] Failed to load game:', err);
    }
    return null;
  }
};
