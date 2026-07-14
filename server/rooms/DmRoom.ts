import { Room, Client } from 'colyseus';
import { TICK_MS, type PlayerInput } from '../../shared/constants.js';
import { GameState } from '../../shared/schema.js';
import { Simulation } from '../../shared/simulation.js';

export class DmRoom extends Room<GameState> {
  maxClients = 4;
  private sim!: Simulation;

  onCreate(): void {
    this.setState(new GameState());
    this.sim = new Simulation(this.state);
    this.sim.ensureBots(2);

    this.onMessage('input', (client, message: PlayerInput) => {
      this.sim.setInput(client.sessionId, message);
    });

    this.setSimulationInterval((deltaTime) => {
      this.sim.step(deltaTime || TICK_MS);
      const humans = [...this.sim.soldiers.values()].filter((s) => !s.state.isBot).length;
      this.sim.ensureBots(humans >= 2 ? 0 : 2);
    }, TICK_MS);
  }

  onJoin(client: Client, options: { name?: string } = {}): void {
    const name = (options.name || `Player`).slice(0, 16);
    this.sim.addPlayer(client.sessionId, name, false);
    console.log(`[dm] ${client.sessionId} joined as ${name}`);
  }

  onLeave(client: Client): void {
    this.sim.removePlayer(client.sessionId);
    console.log(`[dm] ${client.sessionId} left`);
  }
}
