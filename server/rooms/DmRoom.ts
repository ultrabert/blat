import { Room, Client } from 'colyseus';
import { DEMO_BOTS, TICK_MS, type PlayerInput } from '../../shared/constants.js';
import { isDemoRoomCode, normalizeRoomCode } from '../../shared/roomCode.js';
import { GameState } from '../../shared/schema.js';
import { Simulation } from '../../shared/simulation.js';

type JoinOptions = {
  code?: string;
  name?: string;
  password?: string;
};

function assertPassword(options: JoinOptions): void {
  if (isDemoRoomCode(options.code || '')) return;
  const expected = process.env.BLAT_PASSWORD;
  if (!expected) return;
  if (options.password !== expected) {
    throw new Error('Wrong password');
  }
}

export class DmRoom extends Room<GameState> {
  maxClients = 4;
  private sim!: Simulation;
  roomCode = '';
  private demo = false;

  onCreate(options: JoinOptions = {}): void {
    assertPassword(options);

    const code = normalizeRoomCode(options.code || '');
    if (!code) {
      throw new Error('Room code required');
    }

    this.roomCode = code;
    this.demo = isDemoRoomCode(code);
    if (this.demo) {
      this.maxClients = 12;
      this.autoDispose = false;
    }
    this.setMetadata({ code, demo: this.demo });
    this.setState(new GameState());
    this.sim = new Simulation(this.state);
    this.sim.ensureBots(this.demo ? DEMO_BOTS : 2);

    this.onMessage('input', (client, message: PlayerInput) => {
      this.sim.setInput(client.sessionId, message);
    });
    this.onMessage('weapon', (client, message: { weapon?: string }) => {
      if (message?.weapon) this.sim.setWeapon(client.sessionId, String(message.weapon));
    });
    this.onMessage('ping', (client, sentAt: number) => {
      client.send('pong', sentAt);
    });
    this.onMessage('rtt', (client, rtt: number) => {
      this.sim.setPing(client.sessionId, Number(rtt) || 0);
    });

    this.setPatchRate(TICK_MS);
    this.setSimulationInterval((deltaTime) => {
      this.sim.step(deltaTime || TICK_MS);
      if (this.demo) {
        this.sim.ensureBots(DEMO_BOTS);
        return;
      }
      const humans = [...this.sim.soldiers.values()].filter((s) => !s.state.isBot).length;
      this.sim.ensureBots(humans >= 2 ? 0 : 2);
    }, TICK_MS);

    console.log(`[dm] room created code=${code} id=${this.roomId}${this.demo ? ' demo' : ''}`);
  }

  onAuth(_client: Client, options: JoinOptions = {}): boolean {
    assertPassword(options);
    return true;
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    if (this.demo) {
      console.log(`[dm] ${client.sessionId} watching demo ${this.roomCode}`);
      return;
    }
    const name = (options.name || `Player`).slice(0, 16);
    this.sim.addPlayer(client.sessionId, name, false);
    console.log(`[dm] ${client.sessionId} joined ${this.roomCode} as ${name}`);
  }

  onLeave(client: Client): void {
    this.sim.removePlayer(client.sessionId);
    console.log(`[dm] ${client.sessionId} left ${this.roomCode}`);
  }
}
