---
name: verify-blat
description: Drive the blat 2D jetpack deathmatch like a player and prove it works. Use after feel, art, audio, weapons, HUD, netcode, lobby, or /demo changes; when asked to verify, playtest, or watch bots; or before claiming a playable change is done.
---

# Verify blat

Agent-facing control skill. Prove user-visible behavior on the **real game**, not by reading source. `npm test` and `/demo` are both required for playable work; neither replaces the other.

Read `features/README.md` and the matching feature file before driving. Default feature when none is named: `demo-spectator`.

## Launch

Shared instance: Vite `:5173` + Colyseus `:2567`. Cloud Agent environments already run `npm run dev` in the `game` terminal. **Reuse that.** Do not start a second copy.

Ready when all of these are true:

- Client log: `Local: http://localhost:5173/` and `Network: http://<ip>:5173/` (IPv4, not `[::1]` only).
- Server log: `[blat] listening on http://localhost:2567` and `[blat] demo room ready`.
- `bash scripts/verify-blat-doctor.sh` exits 0.

If doctor fails because nothing is listening:

```bash
SESSION_NAME="game"
tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_NAME" 2>/dev/null \
  || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c "$PWD" -- "${SHELL:-zsh}" -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_NAME:0.0" 'npm run dev' C-m
```

Without that tmux config, run `npm run dev` in a dedicated terminal. Wait until both ready lines appear, then doctor again.

If `npm ci` failed on boot, run `npm install` (lockfile drift). Vite must set `server.host: true` in `vite.config.ts` so `127.0.0.1:5173` works.

Teardown is **Cleanup**, not Launch. Leave a reused `game` terminal running.

## Doctor

```bash
bash scripts/verify-blat-doctor.sh
```

Requires: `127.0.0.1:5173/demo` HTTP 200, `127.0.0.1:2567/api/health` `{"ok":true,"name":"blat",...}`, client listening on **IPv4**. Warn-only: `/api/lag` empty until a spectator has been on `/demo` for ~1s.

If doctor fails, fix Launch. Do not drive a half-up instance.

## Drive

Harnesses: **computerUse** (desktop Chrome) for the canvas; **curl** for health/lag; **`npm test`** for shared sim.

| Surface | URL / command | Password |
|---|---|---|
| Spectator demo | `http://localhost:5173/demo` or `http://127.0.0.1:5173/demo` | none |
| Lobby | `http://localhost:5173/` | `BLAT_PASSWORD` if set; never print it |
| Live after Fly deploy | `https://blat.fly.dev/demo` | none for `/demo` |
| Health | `curl -s http://127.0.0.1:2567/api/health` | — |
| Lag | `curl -s http://127.0.0.1:2567/api/lag` | — |
| Sim | `npm test` | — |

Stable handles (prefer these over coordinates):

- Lobby: `#btn-demo` (Watch demo), `#btn-create`, `#btn-join`, `#player-name`, `#access-password`, `#room-code`, `#match-mode`, `#match-realistic`, `#room-list`.
- In-game chrome: `#room-bar-code` (`DEMO` or `ROOM ABCD`), `#btn-copy`, `#lag-hud` (text starts with `LAG`).
- Canvas (Phaser, not DOM): bottom `watching`, top `DEMO`, team scores `Alpha` / `Bravo`, nametags `Bot 1`–`Bot 5`.

Default drive (feature `demo-spectator`):

1. `npm test` — must be 0 failures.
2. Doctor.
3. computerUse: open `http://localhost:5173/demo`. Do not stay on the lobby. Wait until `watching` and at least two `Bot N` nametags are visible. Watch **several seconds** of combat (muzzle flashes, tracers, or explosions).
4. Read the LAG line from `#lag-hud` and/or the canvas top-left. Then `curl -s http://127.0.0.1:2567/api/lag`.
5. Report what you **saw**, not what the code says. Include LAG numbers.

A "Tap to hear" overlay is not a failure. Dismiss it or ignore it; visuals are enough. Do not create/join a normal room unless the mapped feature is `lobby`.

## Evidence

Cloud Agent: copy proof to `/opt/cursor/artifacts/` (survives cleanup). Local: `/tmp/verify-blat/` is fine if that folder is missing.

Minimum proof for `demo-spectator`:

- Screenshot of `/demo` with `watching` + bots in combat, URL bar showing `/demo`.
- LAG line readable in the shot **or** the `curl /api/lag` JSON.
- `npm test` summary (pass count).

Proof standards:

- Exercise the real path (`/demo` in a browser, not a mocked room).
- Capture action **and** result (opened demo → bots fighting + LAG report), not only a lobby screenshot.
- `npm test` does not prove guns fired. `/demo` does not prove replay-at-80ms. Run both for playable/netcode work.
- Do not treat `patch ~60ms` on a Cloud Agent VM as Fly lag when `patch ≈ frame`. See feature `lag-observatory`.
- Never print `BLAT_PASSWORD`.

If `/show-me` is active this run, append one checkpoint row with that skill's `log.sh`. Evidence is the artifact path / doctor log / LAG JSON — do not invent a second log format. See `.cursor/skills/show-me/SKILL.md`.

## Cleanup

- If you **reused** the environment `game` terminal: leave it running. Do not kill it.
- If you **started** `npm run dev` for this run: stop that specific process (Ctrl-C in its tmux pane, or `kill <pid>` from the pane). Never `pkill -f`.
- Do not delete `/opt/cursor/artifacts` or other proof files.
- Do not stop Colyseus/Vite to "reset" between features on a shared instance.

## Helpers

```bash
bash scripts/verify-blat-doctor.sh
curl -s http://127.0.0.1:2567/api/health
curl -s http://127.0.0.1:2567/api/lag
npm test
```

## Cannot judge in a VM

Internet RTT feel, iPhone Safari audio (Ring switch / tap-to-hear), two-human lag. Say so. Prediction-at-delay is `npm test` (`lag-observatory` in `shared/lag.test.ts`).
