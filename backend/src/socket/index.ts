import { Server, Socket } from 'socket.io';
import { SocketEvents, Camp } from '../../../shared/index';
import type { MakeMovePayload, GameUpdatedPayload, GameOverPayload, ErrorPayload, CreateRoomPayload, JoinRoomPayload, RoomJoinedPayload } from '../../../shared/index';
import { gameService } from '../game/GameService';
import { GameManager } from '../game/GameManager';

const GLOBAL_GAME_ID = 'global-game';

function generateRoomId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildUpdate(game: GameManager): GameUpdatedPayload {
  let count = 1;
  if (game.mode === 'PVP') {
    count = (game.players.redSocketId ? 1 : 0) + (game.players.blackSocketId ? 1 : 0);
  }
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
    aiLevel: game.strategy.level,
    mode: game.mode,
    playersCount: count
  };
}

export function configureSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // ── INIT_GAME (PVE 人機對戰) ───────────────────────────
    socket.on(SocketEvents.INIT_GAME, async (data: any) => {
      const playerCamp = data?.humanCamp || data?.camp || Camp.RED;
      console.log(`[game] PVE init => Player: ${playerCamp === Camp.RED ? 'RED' : 'BLACK'}`);

      socket.join(GLOBAL_GAME_ID);

      await gameService.initGame(GLOBAL_GAME_ID, playerCamp, (game) => {
        io.to(GLOBAL_GAME_ID).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
      }, 'PVE');
    });

    // ── CREATE_ROOM (PVP 創建好友房) ─────────────────────────
    socket.on(SocketEvents.CREATE_ROOM, async (data: CreateRoomPayload) => {
      const roomId = data?.roomId || generateRoomId();
      const hostCamp = data?.camp || Camp.RED;

      socket.join(roomId);

      const game = await gameService.initGame(roomId, hostCamp, (g) => {
        io.to(roomId).emit(SocketEvents.GAME_UPDATED, buildUpdate(g));
      }, 'PVP');

      if (hostCamp === Camp.RED) {
        game.players.redSocketId = socket.id;
      } else {
        game.players.blackSocketId = socket.id;
      }

      console.log(`[room] Room ${roomId} created by ${socket.id} (Camp: ${hostCamp})`);

      const payload: RoomJoinedPayload = {
        roomId,
        camp: hostCamp,
        mode: 'PVP',
        playersCount: 1
      };
      socket.emit(SocketEvents.ROOM_CREATED, payload);
      socket.emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
    });

    // ── JOIN_ROOM (PVP 加入好友房) ─────────────────────────
    socket.on(SocketEvents.JOIN_ROOM, async (data: JoinRoomPayload) => {
      const roomId = data?.roomId;
      const game = gameService.getGame(roomId);

      if (!game) {
        socket.emit(SocketEvents.ROOM_ERROR, { message: '查無此房間號碼，請確認後重試' } as ErrorPayload);
        return;
      }

      if (game.players.redSocketId && game.players.blackSocketId) {
        socket.emit(SocketEvents.ROOM_ERROR, { message: '該房間人數已滿 (已有 2 位玩家)' } as ErrorPayload);
        return;
      }

      socket.join(roomId);

      // 分配未被佔用的陣營
      let assignedCamp: Camp;
      if (!game.players.redSocketId) {
        game.players.redSocketId = socket.id;
        assignedCamp = Camp.RED;
      } else {
        game.players.blackSocketId = socket.id;
        assignedCamp = Camp.BLACK;
      }

      console.log(`[room] Player ${socket.id} joined Room ${roomId} as ${assignedCamp}`);

      const payload: RoomJoinedPayload = {
        roomId,
        camp: assignedCamp,
        mode: 'PVP',
        playersCount: 2
      };
      socket.emit(SocketEvents.ROOM_JOINED, payload);

      // 通知房間對手
      socket.to(roomId).emit(SocketEvents.PLAYER_JOINED, { message: '對手已加入房間，對戰開始！' });
      io.to(roomId).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
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
        },
        socket.id
      );
    });

    // ── RESIGN ────────────────────────────────────────────
    socket.on(SocketEvents.RESIGN, async (data: { gameId?: string }) => {
      const targetGameId = data?.gameId || GLOBAL_GAME_ID;
      await gameService.resign(
        targetGameId,
        (game) => {
          io.to(targetGameId).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
        },
        (overPayload) => {
          io.to(targetGameId).emit(SocketEvents.GAME_OVER, overPayload);
        },
        socket.id
      );
    });

    // ── UNDO_MOVE ─────────────────────────────────────────
    socket.on(SocketEvents.UNDO_MOVE, async (data: { gameId?: string }) => {
      const targetGameId = data?.gameId || GLOBAL_GAME_ID;
      await gameService.undoMove(
        targetGameId,
        (game) => {
          io.to(targetGameId).emit(SocketEvents.GAME_UPDATED, buildUpdate(game));
        },
        (errorMsg) => {
          socket.emit(SocketEvents.MOVE_REJECTED, { message: errorMsg } as ErrorPayload);
        }
      );
    });

    // ── RESTORE_GAME ──────────────────────────────────────────
    socket.on(SocketEvents.RESTORE_GAME, async (data: { gameId?: string }) => {
      const targetGameId = data?.gameId || GLOBAL_GAME_ID;
      const game = await gameService.restoreGame(targetGameId);

      if (game) {
        socket.join(targetGameId);
        socket.emit(SocketEvents.GAME_UPDATED, buildUpdate(game));

        if (game.status === 'CHECKMATE' && game.winner) {
          const over: GameOverPayload = {
            gameId: game.gameId,
            winner: game.winner as any,
            reason: game.winner === 'DRAW' ? 'DRAW' : 'CHECKMATE'
          };
          socket.emit(SocketEvents.GAME_OVER, over);
        }
        console.log(`[socket] ${socket.id} restored game state for ${targetGameId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
}
