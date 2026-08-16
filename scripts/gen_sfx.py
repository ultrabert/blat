#!/usr/bin/env python3
"""Synthesize Soldat-ish arcade SFX as mono 44.1kHz 16-bit WAVs."""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

SR = 44100
OUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "sfx"


def clamp(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return lo if x < lo else hi if x > hi else x


def write_wav(name: str, samples: list[float]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b"".join(struct.pack("<h", int(clamp(s) * 32767)) for s in samples)
        w.writeframes(frames)
    print(f"  {path.name}  ({len(samples) / SR * 1000:.0f}ms)")


def noise(n: int, amp: float = 1.0) -> list[float]:
    return [random.uniform(-amp, amp) for _ in range(n)]


def env_exp(n: int, attack: float, decay: float) -> list[float]:
    """attack/decay in samples."""
    out = [0.0] * n
    for i in range(n):
        if i < attack:
            out[i] = i / max(1, attack)
        else:
            t = (i - attack) / max(1, decay)
            out[i] = math.exp(-t * 4.5)
    return out


def mix(*tracks: list[float]) -> list[float]:
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for t in tracks:
        for i, v in enumerate(t):
            out[i] += v
    peak = max(abs(x) for x in out) or 1.0
    if peak > 0.95:
        scale = 0.95 / peak
        out = [x * scale for x in out]
    return out


def tone(
    freq: float,
    n: int,
    amp: float,
    kind: str = "sine",
    freq_end: float | None = None,
) -> list[float]:
    out = [0.0] * n
    for i in range(n):
        t = i / SR
        f = freq if freq_end is None else freq + (freq_end - freq) * (i / max(1, n - 1))
        phase = 2 * math.pi * f * t
        if kind == "sine":
            s = math.sin(phase)
        elif kind == "triangle":
            s = 2 * abs(2 * ((f * t) % 1) - 1) - 1
        elif kind == "square":
            s = 1.0 if math.sin(phase) >= 0 else -1.0
        elif kind == "saw":
            s = 2 * ((f * t) % 1) - 1
        else:
            s = math.sin(phase)
        out[i] = s * amp
    return out


def apply_env(sig: list[float], attack_ms: float, decay_ms: float) -> list[float]:
    n = len(sig)
    e = env_exp(n, int(attack_ms * SR / 1000), int(decay_ms * SR / 1000))
    return [s * g for s, g in zip(sig, e)]


def bandpass_noise(n: int, center: float, q: float, amp: float) -> list[float]:
    """Simple resonant noise via IIR-ish feedback on white noise."""
    raw = noise(n, 1.0)
    out = [0.0] * n
    # crude band emphasis: ring-modulate noise with sine then soften
    for i in range(n):
        t = i / SR
        carrier = math.sin(2 * math.pi * center * t)
        # slight Q wobble
        wobble = 1.0 + 0.15 * math.sin(2 * math.pi * (center / q) * t)
        out[i] = raw[i] * carrier * amp * wobble
    # soft lowpass via moving average
    k = max(1, int(SR / (center * 0.35)))
    smoothed = [0.0] * n
    acc = 0.0
    for i in range(n):
        acc += out[i]
        if i >= k:
            acc -= out[i - k]
        smoothed[i] = acc / min(i + 1, k)
    return smoothed


def gun_crack(body_hz: float, crack_hz: float, body_ms: float, crack_ms: float, vol: float) -> list[float]:
    nb = int(body_ms * SR / 1000)
    nc = int(crack_ms * SR / 1000)
    body = apply_env(tone(body_hz, nb, vol * 0.7, "triangle", body_hz * 0.35), 0.5, body_ms)
    crack = apply_env(bandpass_noise(nc, crack_hz, 1.2, vol), 0.2, crack_ms)
    # metallic ring
    ring_n = int(0.08 * SR)
    ring = apply_env(tone(crack_hz * 1.7, ring_n, vol * 0.22, "sine", crack_hz * 0.9), 0.3, 70)
    return mix(body, crack, ring)


def gen_rifle() -> None:
    write_wav("shoot_rifle.wav", gun_crack(165, 2100, 55, 35, 0.85))


def gen_sniper() -> None:
    # heavier body + longer crack
    body = apply_env(tone(95, int(0.12 * SR), 0.9, "triangle", 38), 0.8, 110)
    crack = apply_env(bandpass_noise(int(0.07 * SR), 1600, 0.9, 0.95), 0.3, 65)
    boom = apply_env(tone(55, int(0.18 * SR), 0.55, "sine", 28), 1.0, 160)
    ring = apply_env(tone(2800, int(0.1 * SR), 0.18, "sine", 900), 0.4, 90)
    write_wav("shoot_sniper.wav", mix(body, crack, boom, ring))


def gen_shotgun() -> None:
    # thick blast + pellet hiss cloud
    body = apply_env(tone(120, int(0.1 * SR), 0.85, "saw", 40), 0.5, 90)
    blast = apply_env(noise(int(0.09 * SR), 0.9), 0.2, 80)
    # high hiss for pellets
    hiss = apply_env(bandpass_noise(int(0.12 * SR), 4200, 0.7, 0.55), 0.5, 110)
    thump = apply_env(tone(70, int(0.14 * SR), 0.65, "sine", 30), 1.0, 120)
    write_wav("shoot_shotgun.wav", mix(body, blast, hiss, thump))


def gen_explode() -> None:
    n = int(0.45 * SR)
    boom = apply_env(tone(70, n, 0.95, "sine", 22), 2.0, 400)
    crunch = apply_env(noise(int(0.32 * SR), 0.85), 1.0, 280)
    mid = apply_env(bandpass_noise(int(0.22 * SR), 380, 0.8, 0.5), 2.0, 200)
    write_wav("explode.wav", mix(boom, crunch, mid))


def gen_grenade() -> None:
    whoosh = apply_env(bandpass_noise(int(0.12 * SR), 700, 0.9, 0.45), 2.0, 100)
    ping = apply_env(tone(520, int(0.09 * SR), 0.35, "sine", 160), 1.0, 80)
    write_wav("grenade.wav", mix(whoosh, ping))


def gen_land() -> None:
    thud = apply_env(tone(100, int(0.12 * SR), 0.7, "triangle", 35), 1.0, 100)
    dust = apply_env(noise(int(0.08 * SR), 0.4), 0.5, 70)
    write_wav("land.wav", mix(thud, dust))


def gen_land_soft() -> None:
    thud = apply_env(tone(140, int(0.08 * SR), 0.4, "triangle", 50), 0.8, 70)
    dust = apply_env(noise(int(0.05 * SR), 0.22), 0.4, 45)
    write_wav("land_soft.wav", mix(thud, dust))


def gen_footstep() -> None:
    crunch = apply_env(bandpass_noise(int(0.045 * SR), 260 + random.random() * 40, 1.1, 0.45), 0.5, 40)
    write_wav("footstep.wav", crunch)


def gen_hit() -> None:
    tick = apply_env(tone(190, int(0.06 * SR), 0.35, "square", 80), 0.3, 50)
    write_wav("hit.wav", tick)


def gen_wet_hit() -> None:
    squelch = apply_env(bandpass_noise(int(0.1 * SR), 380, 0.7, 0.55), 0.8, 90)
    thump = apply_env(tone(85, int(0.09 * SR), 0.4, "sine", 35), 1.0, 80)
    splash = apply_env(noise(int(0.06 * SR), 0.35), 0.3, 50)
    write_wav("wet_hit.wav", mix(squelch, thump, splash))


def gen_death() -> None:
    fall = apply_env(tone(240, int(0.38 * SR), 0.4, "saw", 48), 5.0, 340)
    body = apply_env(tone(90, int(0.2 * SR), 0.35, "triangle", 30), 8.0, 180)
    write_wav("death.wav", mix(fall, body))


def gen_pickup() -> None:
    a = apply_env(tone(660, int(0.06 * SR), 0.28, "sine"), 1.0, 50)
    b = apply_env(tone(990, int(0.08 * SR), 0.22, "sine"), 1.0, 70)
    # delay second tone slightly
    pad = [0.0] * int(0.04 * SR)
    write_wav("pickup.wav", mix(a + [0.0] * int(0.06 * SR), pad + b))


def gen_cook_tick() -> None:
    tick = apply_env(tone(1400, int(0.035 * SR), 0.25, "sine", 900), 0.2, 30)
    click = apply_env(noise(int(0.02 * SR), 0.2), 0.1, 15)
    write_wav("cook_tick.wav", mix(tick, click))


def gen_jet_loop() -> None:
    """Seamless pink-ish hiss. No sawtooth / LFO ping."""
    n = int(0.85 * SR)
    b0 = b1 = b2 = lp = 0.0
    out = [0.0] * n
    for i in range(n):
        white = random.uniform(-1.0, 1.0)
        b0 = 0.99765 * b0 + white * 0.099046
        b1 = 0.963 * b1 + white * 0.2965164
        b2 = 0.57 * b2 + white * 1.0526913
        pink = b0 + b1 + b2
        lp += 0.12 * (pink - lp)
        out[i] = lp * 0.22
    fade = int(0.08 * SR)
    for i in range(fade):
        a = i / fade
        out[i] = out[i] * a + out[n - fade + i] * (1 - a)
    write_wav("jet_loop.wav", out)


def gen_roll() -> None:
    whoosh = apply_env(bandpass_noise(int(0.14 * SR), 500, 0.8, 0.4), 3.0, 120)
    write_wav("roll.wav", whoosh)


def main() -> None:
    random.seed(42)
    print(f"Writing SFX → {OUT}")
    gen_rifle()
    gen_sniper()
    gen_shotgun()
    gen_explode()
    gen_grenade()
    gen_land()
    gen_land_soft()
    gen_footstep()
    gen_hit()
    gen_wet_hit()
    gen_death()
    gen_pickup()
    gen_cook_tick()
    gen_jet_loop()
    gen_roll()
    print("done")


if __name__ == "__main__":
    main()
