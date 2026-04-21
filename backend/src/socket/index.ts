import { Server, Socket } from 'socket.io';
import { SocketEvents, Camp } from '../../../shared';
import type { MakeMovePayload, GameUpdatedPayload, GameOverPayload, ErrorPayload } from '../../../shared';
import { GameManager } from '../game/GameManager';

const games = new Map<string, GameManager>();
const GAME_ID = 'global-game';
const aiTimeouts = new Map<string, NodeJS.Timeout>();


function buildUpdate(game: GameManager): GameUpdatedPayload {
  return {
    gameId: game.gameId,
    fen: game.fen,
    turn: game.turn,
    lastMove: game.lastMove,
    status: game.status,
    isHumanTurn: game.isHumanTurn,
    humanCamp: game.humanCamp,
    fullHistory: game.fullHistory,
    capturedPieces: {
      red: game.capturedPieces[Camp.RED],
      black: game.capturedPieces[Camp.BLACK]
    },
    winner: game.winner,
    currentAiStyle: game.strategy.name,
    aiLevel: game.strategy.level
  };
}










export function configureSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // ── INIT_GAME ─────────────────────────────────────────
    socket.on(SocketEvents.INIT_GAME, (data?: { camp: Camp }) => {
      // 立即清除可能存在的 AI 定時器
      const existingTimeout = aiTimeouts.get(GAME_ID);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        aiTimeouts.delete(GAME_ID);
      }

      const playerCamp = data?.camp || Camp.RED;

      // 直接用 init() 初始化，避免 constructor 與 init 重複執行
      const game = new GameManager(GAME_ID);
      game.init(playerCamp);
      
      // 如果玩家選黑方，AI 是紅方，紅方必須先行
      if (playerCamp === Camp.BLACK) {
        game.makeAiMove();
      }

      games.set(GAME_ID, game);
      socket.join(GAME_ID);
      io.to(GAME_ID).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
      console.log(`[game] init => fen: ${game.fen}`);
    });

    // ── MAKE_MOVE ─────────────────────────────────────────
    socket.on(SocketEvents.MAKE_MOVE, (payload: MakeMovePayload) => {
      const game = games.get(payload.gameId);
      if (!game) {
        socket.emit(SocketEvents.MOVE_REJECTED, { message: 'Game not found' } as ErrorPayload);
        return;
      }

      const success = game.makeMove(payload.from, payload.to);
      if (!success) {
        socket.emit(SocketEvents.MOVE_REJECTED, { message: 'Illegal move' } as ErrorPayload);
        return;
      }

      // 廣播人類的這步棋
      io.to(payload.gameId).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));

      // 如果遊戲已結束（贏家已在 makeMove 裡設好，直接用 game.winner）
      if (game.status === 'CHECKMATE') {
        if (game.winner === 'DRAW') {
          const over: GameOverPayload = { gameId: game.gameId, winner: 'DRAW' as any, reason: 'DRAW' };
          io.to(payload.gameId).emit(SocketEvents.GAME_OVER, over);
        } else {
          const over: GameOverPayload = { gameId: game.gameId, winner: game.winner as Camp, reason: 'CHECKMATE' };
          io.to(payload.gameId).emit(SocketEvents.GAME_OVER, over);
        }
        return;
      }

      // AI 回應
      if (!game.isHumanTurn) {
        if (aiTimeouts.has(payload.gameId)) {
          clearTimeout(aiTimeouts.get(payload.gameId));
        }

        const timeout = setTimeout(async () => {
          aiTimeouts.delete(payload.gameId);

          // makeAiMove 現在在 Worker Thread 執行，不阻塞事件循環
          const aiSuccess = await game.makeAiMove();
          if (!aiSuccess) {
            const over: GameOverPayload = {
              gameId: game.gameId,
              winner: game.humanCamp,
              reason: 'AI_STALEMATE'
            };
            io.to(payload.gameId).emit(SocketEvents.GAME_OVER, over);
            return;
          }

          io.to(payload.gameId).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));

          if (game.status === 'CHECKMATE') {
            if (game.winner === 'DRAW') {
              const over: GameOverPayload = { gameId: game.gameId, winner: 'DRAW' as any, reason: 'DRAW' };
              io.to(payload.gameId).emit(SocketEvents.GAME_OVER, over);
            } else {
              const winner = game.turn === Camp.RED ? Camp.BLACK : Camp.RED;
              const over: GameOverPayload = { gameId: game.gameId, winner, reason: 'CHECKMATE' };
              io.to(payload.gameId).emit(SocketEvents.GAME_OVER, over);
            }
          }
        }, 300);

        aiTimeouts.set(payload.gameId, timeout);
      }

    });

    // ── RESIGN ────────────────────────────────────────────
    socket.on(SocketEvents.RESIGN, () => {
      const game = games.get(GAME_ID);
      if (!game) return;
      game.winner = game.humanCamp === Camp.RED ? Camp.BLACK : Camp.RED;
      const over: GameOverPayload = { gameId: GAME_ID, winner: game.winner as Camp, reason: 'RESIGN' };
      io.to(GAME_ID).emit(SocketEvents.GAME_OVER, over);
      io.to(GAME_ID).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
    });


    // ── UNDO_MOVE ─────────────────────────────────────────
    socket.on(SocketEvents.UNDO_MOVE, () => {
      const game = games.get(GAME_ID);
      if (!game) return;
      
      // 悔棋瞬間必須立即取消待定的 AI 動作
      const existingTimeout = aiTimeouts.get(GAME_ID);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        aiTimeouts.delete(GAME_ID);
      }

      const success = game.undoMove();
      if (success) {
        io.to(GAME_ID).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
      } else {
        socket.emit(SocketEvents.MOVE_REJECTED, { message: 'Cannot undo' } as ErrorPayload);
      }
    });


    // ── RESTORE_GAME ──────────────────────────────────────────
    // 斷線重連後，前端發送此事件請求恢復棋局狀態
    socket.on(SocketEvents.RESTORE_GAME, () => {
      const game = games.get(GAME_ID);
      if (!game) return;

      // 重新加入房間並推送當前狀態
      socket.join(GAME_ID);
      socket.emit(SocketEvents.GAME_UPDATED, buildUpdate(game));

      // 如果遊戲已結束，也補發 GAME_OVER 事件
      if (game.status === 'CHECKMATE' && game.winner) {
        const over: GameOverPayload = {
          gameId: game.gameId,
          winner: game.winner as any,
          reason: game.winner === 'DRAW' ? 'DRAW' : 'CHECKMATE'
        };
        socket.emit(SocketEvents.GAME_OVER, over);
      }

      console.log(`[socket] ${socket.id} restored game state`);
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
}
