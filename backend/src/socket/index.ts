import { Server, Socket } from 'socket.io';
import {
  SocketEvents, MakeMovePayload,
  GameUpdatedPayload, GameOverPayload, ErrorPayload, Camp
} from '@chinese-chess/shared';
import { GameManager } from '../game/GameManager';

const games = new Map<string, GameManager>();
const GAME_ID = 'global-game';

function buildUpdate(game: GameManager): GameUpdatedPayload {
  return {
    gameId: game.gameId,
    fen: game.fen,
    turn: game.turn,
    lastMove: game.lastMove,
    status: game.status,
    isHumanTurn: game.isHumanTurn,
    fullHistory: game.fullHistory,
  };
}

export function configureSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // ── INIT_GAME ─────────────────────────────────────────
    socket.on(SocketEvents.INIT_GAME, (data?: { camp: Camp }) => {
      const playerCamp = data?.camp || Camp.RED;
      const game = new GameManager(GAME_ID, playerCamp);
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

      // 如果遊戲已結束
      if (game.status === 'CHECKMATE') {
        const winner = game.turn === Camp.RED ? Camp.BLACK : Camp.RED; // 現在輪到的人輸了
        const over: GameOverPayload = { gameId: game.gameId, winner, reason: 'CHECKMATE' };
        io.to(payload.gameId).emit(SocketEvents.GAME_OVER, over);
        return;
      }

      // AI 回應（非人類回合時自動計算）
      if (!game.isHumanTurn) {
        // 稍微延遲讓前端有時間更新 UI
        setTimeout(() => {
          const aiSuccess = game.makeAiMove();
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
            const winner = game.turn === Camp.RED ? Camp.BLACK : Camp.RED;
            const over: GameOverPayload = { gameId: game.gameId, winner, reason: 'CHECKMATE' };
            io.to(payload.gameId).emit(SocketEvents.GAME_OVER, over);
          }
        }, 300);
      }
    });

    // ── RESIGN ────────────────────────────────────────────
    socket.on(SocketEvents.RESIGN, () => {
      const game = games.get(GAME_ID);
      if (!game) return;
      const aiCamp = game.humanCamp === Camp.RED ? Camp.BLACK : Camp.RED;
      const over: GameOverPayload = { gameId: GAME_ID, winner: aiCamp, reason: 'RESIGN' };
      io.to(GAME_ID).emit(SocketEvents.GAME_OVER, over);
    });

    // ── UNDO_MOVE ─────────────────────────────────────────
    socket.on(SocketEvents.UNDO_MOVE, () => {
      const game = games.get(GAME_ID);
      if (!game) return;
      
      const success = game.undoMove();
      if (success) {
        io.to(GAME_ID).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
      } else {
        socket.emit(SocketEvents.MOVE_REJECTED, { message: 'Cannot undo' } as ErrorPayload);
      }
    });

    socket.on('disconnect', () => {

      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
}
