import { Server, Socket } from 'socket.io';
import {
  SocketEvents, MakeMovePayload,
  GameUpdatedPayload, GameOverPayload, ErrorPayload, Camp
} from '@chinese-chess/shared';
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
    currentAiStyle: game.strategy.name
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

      // AI 回應
      if (!game.isHumanTurn) {
        // 先清除可能存在的舊定時器
        if (aiTimeouts.has(payload.gameId)) {
          clearTimeout(aiTimeouts.get(payload.gameId));
        }

        const timeout = setTimeout(() => {
          aiTimeouts.delete(payload.gameId);
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


    socket.on('disconnect', () => {

      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
}
