import { Server, Socket } from 'socket.io';
import { SocketEvents, Camp } from '../../../shared/index';
import type { MakeMovePayload, GameUpdatedPayload, GameOverPayload, ErrorPayload } from '../../../shared/index';
import { gameService } from '../game/GameService';
import { GameManager } from '../game/GameManager';

const GAME_ID = 'global-game';

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
    socket.on(SocketEvents.INIT_GAME, async (data: any) => {
      const playerCamp = data?.humanCamp || data?.camp || Camp.RED;
      console.log(`[game] init => Player: ${playerCamp === Camp.RED ? 'RED' : 'BLACK'}`);

      socket.join(GAME_ID);

      await gameService.initGame(GAME_ID, playerCamp, (game) => {
        io.to(GAME_ID).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
      });
    });

    // ── MAKE_MOVE ─────────────────────────────────────────
    socket.on(SocketEvents.MAKE_MOVE, async (payload: MakeMovePayload) => {
      await gameService.makeMove(
        payload.gameId,
        payload.from,
        payload.to,
        (game) => {
          io.to(payload.gameId).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
        },
        (overPayload) => {
          io.to(payload.gameId).emit(SocketEvents.GAME_OVER, overPayload);
        },
        (errorMsg) => {
          socket.emit(SocketEvents.MOVE_REJECTED, { message: errorMsg } as ErrorPayload);
        }
      );
    });

    // ── RESIGN ────────────────────────────────────────────
    socket.on(SocketEvents.RESIGN, async () => {
      await gameService.resign(
        GAME_ID,
        (game) => {
          io.to(GAME_ID).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
        },
        (overPayload) => {
          io.to(GAME_ID).emit(SocketEvents.GAME_OVER, overPayload);
        }
      );
    });

    // ── UNDO_MOVE ─────────────────────────────────────────
    socket.on(SocketEvents.UNDO_MOVE, async () => {
      await gameService.undoMove(
        GAME_ID,
        (game) => {
          io.to(GAME_ID).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
        },
        (errorMsg) => {
          socket.emit(SocketEvents.MOVE_REJECTED, { message: errorMsg } as ErrorPayload);
        }
      );
    });

    // ── RESTORE_GAME ──────────────────────────────────────────
    socket.on(SocketEvents.RESTORE_GAME, async () => {
      const game = await gameService.restoreGame(GAME_ID);

      if (game) {
        socket.join(GAME_ID);
        socket.emit(SocketEvents.GAME_UPDATED, buildUpdate(game));

        if (game.status === 'CHECKMATE' && game.winner) {
          const over: GameOverPayload = {
            gameId: game.gameId,
            winner: game.winner as any,
            reason: game.winner === 'DRAW' ? 'DRAW' : 'CHECKMATE'
          };
          socket.emit(SocketEvents.GAME_OVER, over);
        }
        console.log(`[socket] ${socket.id} restored game state`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
}
