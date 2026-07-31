import { GameManager } from './GameManager';
import { db } from './db';
import { Camp, GameStatus, SocketEvents } from '../../../shared/index';
import type { GameOverPayload, Position } from '../../../shared/index';

export class GameService {
  private games = new Map<string, GameManager>();
  private aiTimeouts = new Map<string, NodeJS.Timeout>();

  public getGame(gameId: string): GameManager | undefined {
    return this.games.get(gameId);
  }

  public async initGame(
    gameId: string,
    playerCamp: Camp,
    onUpdate: (game: GameManager) => void,
    mode: 'PVE' | 'PVP' = 'PVE'
  ): Promise<GameManager> {
    // 停止舊的 AI 計時器與計算線程
    this.clearAiTimeoutAndWorker(gameId);

    const game = new GameManager(gameId);
    game.init(playerCamp, mode);
    this.games.set(gameId, game);

    // 儲存狀態
    await db.saveGame(game.toState());

    if (mode === 'PVE' && playerCamp === Camp.BLACK) {
      console.log('[GameService] AI is RED, triggering first move...');
      game.makeAiMove(async () => {
        console.log('[GameService] AI first move done, broadcasting...');
        await db.saveGame(game.toState());
        onUpdate(game);
      });
    }

    onUpdate(game);
    return game;
  }

  public async makeMove(
    gameId: string,
    from: Position,
    to: Position,
    onUpdate: (game: GameManager) => void,
    onGameOver: (payload: GameOverPayload) => void,
    onRejected: (msg: string) => void,
    socketId?: string
  ): Promise<void> {
    const game = this.games.get(gameId);
    if (!game) {
      onRejected('Game not found');
      return;
    }

    // PVP 權限檢查：確認目前 socketID 是否為該回合玩家
    if (game.mode === 'PVP' && socketId) {
      const allowedSocketId = game.turn === Camp.RED ? game.players.redSocketId : game.players.blackSocketId;
      if (allowedSocketId && allowedSocketId !== socketId) {
        onRejected('尚未輪到您的回合');
        return;
      }
    }

    const success = game.makeMove(from, to);
    if (!success) {
      onRejected('Illegal move');
      return;
    }

    await db.saveGame(game.toState());
    onUpdate(game);

    if (game.status === GameStatus.CHECKMATE) {
      onGameOver({
        gameId: game.gameId,
        winner: game.winner === 'DRAW' ? ('DRAW' as any) : (game.winner as Camp),
        reason: 'CHECKMATE'
      });
      return;
    }

    // AI 回應 (單人 PVE 模式才觸發)
    if (game.mode === 'PVE' && !game.isHumanTurn) {
      this.clearAiTimeout(gameId);

      const timeout = setTimeout(async () => {
        this.aiTimeouts.delete(gameId);

        const aiSuccess = await game.makeAiMove();
        if (!aiSuccess) {
          onGameOver({
            gameId: game.gameId,
            winner: game.humanCamp,
            reason: 'AI_STALEMATE'
          });
          return;
        }

        await db.saveGame(game.toState());
        onUpdate(game);

        if (game.status === GameStatus.CHECKMATE) {
          const winner = game.winner === 'DRAW' ? ('DRAW' as any) : (game.turn === Camp.RED ? Camp.BLACK : Camp.RED);
          onGameOver({
            gameId: game.gameId,
            winner,
            reason: 'CHECKMATE'
          });
        }
      }, 300);

      this.aiTimeouts.set(gameId, timeout);
    }
  }

  public async resign(
    gameId: string,
    onUpdate: (game: GameManager) => void,
    onGameOver: (payload: GameOverPayload) => void,
    resigningSocketId?: string
  ): Promise<void> {
    const game = this.games.get(gameId);
    if (!game) return;

    game.stopAi();
    this.clearAiTimeout(gameId);

    if (game.mode === 'PVP' && resigningSocketId) {
      // 在 PVP 模式下，判斷是哪一方點擊認輸，對手獲得勝利
      if (resigningSocketId === game.players.redSocketId) {
        game.winner = Camp.BLACK;
      } else if (resigningSocketId === game.players.blackSocketId) {
        game.winner = Camp.RED;
      } else {
        game.winner = game.humanCamp === Camp.RED ? Camp.BLACK : Camp.RED;
      }
    } else {
      game.winner = game.humanCamp === Camp.RED ? Camp.BLACK : Camp.RED;
    }
    await db.saveGame(game.toState());

    onGameOver({
      gameId: game.gameId,
      winner: game.winner as Camp,
      reason: 'RESIGN'
    });
    onUpdate(game);
  }

  public async undoMove(
    gameId: string,
    onUpdate: (game: GameManager) => void,
    onRejected: (msg: string) => void
  ): Promise<void> {
    const game = this.games.get(gameId);
    if (!game) return;

    game.stopAi();
    this.clearAiTimeout(gameId);

    const success = game.undoMove();
    if (success) {
      await db.saveGame(game.toState());
      onUpdate(game);
    } else {
      onRejected('Cannot undo');
    }
  }

  public async restoreGame(gameId: string): Promise<GameManager | null> {
    let game = this.games.get(gameId);

    if (!game) {
      const savedState = await db.loadGame(gameId);
      if (savedState) {
        game = GameManager.fromState(savedState);
        this.games.set(gameId, game);
        console.log(`[RESTORE] Game ${gameId} successfully restored from Redis`);
      }
    }

    return game || null;
  }

  private clearAiTimeout(gameId: string) {
    const existingTimeout = this.aiTimeouts.get(gameId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.aiTimeouts.delete(gameId);
    }
  }

  private clearAiTimeoutAndWorker(gameId: string) {
    this.clearAiTimeout(gameId);
    const game = this.games.get(gameId);
    if (game) {
      game.stopAi();
    }
  }
}

export const gameService = new GameService();
