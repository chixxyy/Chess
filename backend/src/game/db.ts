import { createClient } from '@vercel/kv';
import { Camp, GameStatus, Move, PieceType } from '../../../shared/index';
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

// 增加防錯處理
const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;

if (!kvUrl || !kvToken) {
  console.error('❌ [DB] CRITICAL ERROR: KV_REST_API_URL or KV_REST_API_TOKEN is missing!');
  console.log('Available Env Keys:', Object.keys(process.env).filter(k => k.startsWith('KV_')));
}

const kv = (kvUrl && kvToken) ? createClient({
  url: kvUrl,
  token: kvToken,
}) : null;

export const db = {
  async saveGame(state: GameState): Promise<void> {
    if (!kv) return;
    try {
      await kv.set(`game:${state.id}`, state, { ex: 86400 });
      // console.log(`[DB] Game ${state.id} saved to Redis`);
    } catch (err) {
      console.error('[DB] Failed to save game:', err);
    }
  },

  async loadGame(gameId: string): Promise<GameState | null> {
    if (!kv) return null;
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
