import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../../shared/constants';
import type { GameState } from '../../shared/schema';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

let started = false;

export function startGame(room: Room<GameState>, roomCode: string): void {
  if (started) return;
  started = true;

  const mount = (): void => {
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: 'game',
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      backgroundColor: '#0b1020',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [BootScene, GameScene],
      callbacks: {
        preBoot: (game) => {
          game.registry.set('room', room);
          game.registry.set('roomCode', roomCode);
        },
      },
    };

    const game = new Phaser.Game(config);
    (window as unknown as { __blatGame?: Phaser.Game }).__blatGame = game;
  };

  // Wait a frame so #game-shell layout is non-zero after unhiding.
  requestAnimationFrame(() => requestAnimationFrame(mount));
}
