/**
 * Sample-based SFX bus (Soldat-ish WAVs in /assets/sfx).
 * Falls back to short procedural synthesis if a buffer isn't loaded yet.
 * Call unlock() from a user gesture (lobby click / first pointer).
 */
export type ShootKind = string;

function shootBuf(kind: string): BufKey {
  if (kind === 'barrett') return 'shoot_sniper';
  if (kind === 'spas') return 'shoot_shotgun';
  if (kind === 'm79' || kind === 'law') return 'explode';
  if (kind === 'flamer') return 'jet_loop';
  if (kind === 'knife' || kind === 'chainsaw') return 'hit';
  return 'shoot_rifle';
}

type BufKey =
  | 'shoot_rifle'
  | 'shoot_sniper'
  | 'shoot_shotgun'
  | 'explode'
  | 'grenade'
  | 'land'
  | 'land_soft'
  | 'footstep'
  | 'hit'
  | 'wet_hit'
  | 'death'
  | 'pickup'
  | 'cook_tick'
  | 'jet_loop'
  | 'roll';

const ASSET: Record<BufKey, string> = {
  shoot_rifle: '/assets/sfx/shoot_rifle.wav',
  shoot_sniper: '/assets/sfx/shoot_sniper.wav',
  shoot_shotgun: '/assets/sfx/shoot_shotgun.wav',
  explode: '/assets/sfx/explode.wav',
  grenade: '/assets/sfx/grenade.wav',
  land: '/assets/sfx/land.wav',
  land_soft: '/assets/sfx/land_soft.wav',
  footstep: '/assets/sfx/footstep.wav',
  hit: '/assets/sfx/hit.wav',
  wet_hit: '/assets/sfx/wet_hit.wav',
  death: '/assets/sfx/death.wav',
  pickup: '/assets/sfx/pickup.wav',
  cook_tick: '/assets/sfx/cook_tick.wav',
  jet_loop: '/assets/sfx/jet_loop.wav',
  roll: '/assets/sfx/roll.wav',
};

export class SoundBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<BufKey, AudioBuffer>();
  private jetGain: GainNode | null = null;
  private jetSrc: AudioBufferSourceNode | OscillatorNode | null = null;
  private jetting = false;
  private unlocked = false;
  private lastCookTickAt = 0;

  unlock(): void {
    if (this.unlocked) {
      void this.ctx?.resume();
      return;
    }
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.62;
    this.master.connect(this.ctx.destination);
    this.unlocked = true;
    void this.ctx.resume();
    void this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      (Object.keys(ASSET) as BufKey[]).map(async (key) => {
        try {
          const res = await fetch(ASSET[key]);
          if (!res.ok) return;
          const raw = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(raw.slice(0));
          this.buffers.set(key, buf);
        } catch {
          /* keep procedural fallback */
        }
      }),
    );
  }

  shoot(kind: ShootKind = 'de'): void {
    const key = shootBuf(kind);
    const gain =
      kind === 'barrett' ? 0.95 : kind === 'spas' || kind === 'law' ? 0.9 : kind === 'de' ? 0.82 : 0.74;
    const rate =
      kind === 'mp5' || kind === 'minigun' ? 1.08 + Math.random() * 0.08 : 0.96 + Math.random() * 0.08;
    if (this.play(key, { gain, rate })) {
      if (kind === 'knife' || kind === 'chainsaw') this.fallbackTone(900, 400, 0.12, 0.04);
      return;
    }
    this.fallbackShoot(kind);
  }

  grenade(): void {
    if (this.play('grenade', { gain: 0.7, rate: 0.97 + Math.random() * 0.06 })) return;
    this.fallbackTone(420, 140, 0.2, 0.14);
  }

  explode(distanceScale = 1): void {
    const vol = 0.95 * Math.max(0.2, Math.min(1, distanceScale));
    if (this.play('explode', { gain: vol, rate: 0.94 + Math.random() * 0.08 })) return;
    this.fallbackExplode(vol);
  }

  land(heavy = true): void {
    const key: BufKey = heavy ? 'land' : 'land_soft';
    if (this.play(key, { gain: heavy ? 0.75 : 0.5, rate: 0.95 + Math.random() * 0.1 })) return;
    this.fallbackTone(heavy ? 110 : 150, 40, heavy ? 0.4 : 0.22, 0.14);
  }

  footstep(): void {
    if (this.play('footstep', { gain: 0.4, rate: 0.9 + Math.random() * 0.2 })) return;
    this.fallbackNoise(0.04, 280, 0.16);
  }

  death(): void {
    this.setJetting(false);
    if (this.play('death', { gain: 0.65 })) return;
    this.fallbackTone(220, 45, 0.22, 0.4);
  }

  wetHit(): void {
    if (this.play('wet_hit', { gain: 0.7, rate: 0.92 + Math.random() * 0.12 })) return;
    this.fallbackNoise(0.1, 400, 0.28);
  }

  hit(): void {
    if (this.play('hit', { gain: 0.55, rate: 0.95 + Math.random() * 0.1 })) return;
    this.fallbackTone(160, 70, 0.12, 0.07);
  }

  ricochet(): void {
    if (this.play('hit', { gain: 0.28, rate: 1.55 + Math.random() * 0.25 })) {
      this.fallbackTone(2400, 900, 0.12, 0.045);
      return;
    }
    this.fallbackRicochet();
  }

  pain(): void {
    if (this.play('wet_hit', { gain: 0.38, rate: 0.62 + Math.random() * 0.12 })) {
      this.fallbackTone(210, 90, 0.16, 0.12);
      return;
    }
    this.fallbackPain();
  }

  pickup(): void {
    if (this.play('pickup', { gain: 0.55 })) return;
    this.fallbackTone(660, 990, 0.2, 0.1);
  }

  cookTick(urgency = 0): void {
    const now = performance.now();
    const minGap = Math.max(55, 220 - Math.max(0, Math.min(1, urgency)) * 170);
    if (now - this.lastCookTickAt < minGap) return;
    this.lastCookTickAt = now;
    const rate = 0.95 + urgency * 0.2 + Math.random() * 0.04;
    if (this.play('cook_tick', { gain: 0.28 + urgency * 0.2, rate })) return;
    this.fallbackTone(1400 + urgency * 400, 900, 0.18, 0.04);
  }

  roll(): void {
    if (this.play('roll', { gain: 0.45, rate: 0.95 + Math.random() * 0.1 })) return;
  }

  setJetting(on: boolean): void {
    if (on === this.jetting) return;
    this.jetting = on;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    if (!on) {
      const t = ctx.currentTime;
      if (this.jetGain) {
        this.jetGain.gain.cancelScheduledValues(t);
        this.jetGain.gain.setValueAtTime(Math.max(0.001, this.jetGain.gain.value), t);
        this.jetGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      }
      try {
        this.jetSrc?.stop(t + 0.1);
      } catch {
        /* already stopped */
      }
      this.jetSrc = null;
      this.jetGain = null;
      return;
    }

    const t = ctx.currentTime;
    this.jetGain = ctx.createGain();
    this.jetGain.gain.setValueAtTime(0.001, t);
    this.jetGain.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
    this.jetGain.connect(this.master);

    const loop = this.buffers.get('jet_loop');
    if (loop) {
      this.jetSrc = ctx.createBufferSource();
      this.jetSrc.buffer = loop;
      this.jetSrc.loop = true;
      this.jetSrc.connect(this.jetGain);
      this.jetSrc.start(t);
      return;
    }

    // Procedural fallback jet
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 28;
    lfoG.gain.value = 8;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);
    lfo.start(t);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 2;
    osc.connect(filter);
    filter.connect(this.jetGain);
    osc.start(t);
    this.jetSrc = osc;
  }

  private play(
    key: BufKey,
    opts: { gain?: number; rate?: number } = {},
  ): boolean {
    const ctx = this.ensure();
    const buf = this.buffers.get(key);
    if (!ctx || !this.master || !buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 0.7;
    src.connect(g);
    g.connect(this.master);
    src.start();
    return true;
  }

  private ensure(): AudioContext | null {
    if (!this.unlocked || !this.ctx) return null;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private noiseSource(durationSec: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }

  private fallbackShoot(kind: ShootKind): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const bodyHz = kind === 'barrett' ? 95 : kind === 'spas' || kind === 'law' ? 120 : kind === 'de' ? 140 : 180;
    const crackHz = kind === 'barrett' ? 1600 : kind === 'spas' ? 900 : 1800;
    const thump = ctx.createOscillator();
    const thumpG = ctx.createGain();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(bodyHz, t);
    thump.frequency.exponentialRampToValueAtTime(bodyHz * 0.3, t + 0.08);
    thumpG.gain.setValueAtTime(kind === 'mp5' || kind === 'ak' ? 0.35 : 0.5, t);
    thumpG.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    thump.connect(thumpG);
    thumpG.connect(this.master);
    thump.start(t);
    thump.stop(t + 0.12);
    const noise = this.noiseSource(kind === 'spas' || kind === 'flamer' ? 0.1 : 0.05);
    const ng = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = crackHz;
    bp.Q.value = 0.8;
    ng.gain.setValueAtTime(0.4, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'spas' ? 0.1 : 0.05));
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(this.master);
    noise.start(t);
    noise.stop(t + 0.12);
  }

  private fallbackTone(f0: number, f1: number, vol: number, dur: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private fallbackNoise(dur: number, hz: number, vol: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const noise = this.noiseSource(dur);
    const g = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = hz;
    bp.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    noise.start(t);
    noise.stop(t + dur + 0.01);
  }

  private fallbackRicochet(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const ping = ctx.createOscillator();
    const pg = ctx.createGain();
    ping.type = 'triangle';
    ping.frequency.setValueAtTime(2600 + Math.random() * 400, t);
    ping.frequency.exponentialRampToValueAtTime(700, t + 0.07);
    pg.gain.setValueAtTime(0.18, t);
    pg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    ping.connect(pg);
    pg.connect(this.master);
    ping.start(t);
    ping.stop(t + 0.09);
    this.fallbackNoise(0.035, 3200, 0.12);
  }

  private fallbackPain(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(190 + Math.random() * 40, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.16);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    o.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
    this.fallbackNoise(0.08, 380, 0.1);
  }

  private fallbackExplode(vol: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const boom = ctx.createOscillator();
    const bg = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(90, t);
    boom.frequency.exponentialRampToValueAtTime(28, t + 0.35);
    bg.gain.setValueAtTime(vol, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    boom.connect(bg);
    bg.connect(this.master);
    boom.start(t);
    boom.stop(t + 0.42);
  }
}

/** Shared instance for lobby unlock + in-game playback. */
export const sound = new SoundBus();
