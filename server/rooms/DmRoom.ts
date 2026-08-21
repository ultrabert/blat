import { Room, Client } from 'colyseus';
import { DEMO_BOTS, TICK_MS, type PlayerInput } from '../../shared/constants.js';
import { MATCH, TAUNTS } from '../../shared/match.js';
import { isDemoRoomCode, normalizeRoomCode } from '../../shared/roomCode.js';
import { GameState } from '../../shared/schema.js';
import { Simulation } from '../../shared/simulation.js';

type JoinOptions = {
  code?: string;
  name?: string;
  password?: string;
  mode?: string;
  realistic?: boolean | string;
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
  private lastChatAt = new Map<string, number>();
  private simAcc = 0;

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
      options.mode = options.mode || 'tdm';
    } else {
      this.maxClients = 8;
    }
    this.setState(new GameState());
    this.sim = new Simulation(this.state, {
      mode: options.mode,
      realistic: options.realistic === true || options.realistic === 'true',
    });
    this.sim.ensureBots(this.demo ? DEMO_BOTS : 2);
    this.setMetadata({
      code,
      demo: this.demo,
      mode: this.state.mode,
      realistic: this.state.realistic,
      map: this.state.mapName,
    });

    this.onMessage('input', (client, message: PlayerInput | PlayerInput[]) => {
      if (Array.isArray(message)) {
        for (const packet of message) this.sim.setInput(client.sessionId, packet);
        return;
      }
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
    this.onMessage('chat', (client, message: { text?: string }) => {
      if (!this.allowChat(client.sessionId)) return;
      const soldier = this.sim.soldiers.get(client.sessionId);
      const name = soldier?.state.name || options.name || 'Soldier';
      this.sim.addChat(name, String(message?.text || ''));
    });
    this.onMessage('taunt', (client, message: { i?: number }) => {
      if (!this.allowChat(client.sessionId)) return;
      const soldier = this.sim.soldiers.get(client.sessionId);
      const i = Math.max(0, Math.min(3, Number(message?.i) || 0));
      const name = soldier?.state.name || 'Soldier';
      this.sim.addChat(name, TAUNTS[i]!, 'taunt');
    });

    // Patch immediately after sim ticks so lastAck / poses aren't waiting on
    // a second 16ms interval (up to a full tick of extra delay).
    this.setPatchRate(null);
    this.setSimulationInterval((deltaTime) => {
      this.simAcc += Number(deltaTime) > 0 ? Number(deltaTime) : TICK_MS;
      if (this.simAcc > TICK_MS * 5) this.simAcc = TICK_MS * 5;
      let stepped = false;
      while (this.simAcc >= TICK_MS) {
        this.sim.step(TICK_MS);
        this.simAcc -= TICK_MS;
        stepped = true;
      }
      if (this.demo) {
        this.sim.ensureBots(DEMO_BOTS);
      } else {
        const humans = [...this.sim.soldiers.values()].filter((s) => !s.state.isBot).length;
        this.sim.ensureBots(humans >= 2 ? 0 : 2);
      }
      if (stepped) this.broadcastPatch();
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
    this.lastChatAt.delete(client.sessionId);
    console.log(`[dm] ${client.sessionId} left ${this.roomCode}`);
  }

  private allowChat(id: string): boolean {
    const now = Date.now();
    if ((this.lastChatAt.get(id) || 0) + MATCH.chatCooldownMs > now) return false;
    this.lastChatAt.set(id, now);
    return true;
  }
}
