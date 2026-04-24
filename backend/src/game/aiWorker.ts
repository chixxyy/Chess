/**
 * aiWorker.ts — Worker Thread 入口
 * 接收主線程的棋盤狀態，執行 AI 計算，回傳最佳著法
 * 主線程不被阻塞，socket ping/pong 正常運作
 */
import { workerData, parentPort } from 'worker_threads';
import { parseFEN, Camp } from '../../../shared/index';
import { getBestMove, AiStrategy } from './aiEngine';

if (!parentPort) throw new Error('aiWorker must run as a Worker Thread');

const { fen, camp, strategy, moveCount } = workerData as {
  fen: string;
  camp: Camp;
  strategy: AiStrategy;
  moveCount: number;
};

try {
  const board = parseFEN(fen);
  const bestMove = getBestMove(board, camp, strategy, moveCount);
  parentPort?.postMessage(bestMove);
} catch (err) {
  console.error('[aiWorker] Execution Error:', err);
  parentPort?.postMessage(null);
}
