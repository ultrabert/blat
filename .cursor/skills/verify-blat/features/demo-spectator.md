# Demo spectator

`/demo` is a passwordless spectator room where five bots fight in TDM on Arena. This is the default way an agent confirms the game boots and is playable to watch.

## Sub-features

- `demo-deep-link` opens `/demo` and auto-joins without the lobby form.
- `demo-watch-combat` shows living bots, guns firing, and the `watching` label.
- `demo-lobby-button` reaches the same room from Watch demo on `/`.
- `demo-live` after a Fly deploy is `https://blat.fly.dev/demo` (skip if staying local).

## How to get to it (user POV)

- Open `http://localhost:5173/demo` (or `http://127.0.0.1:5173/demo`).
- From the lobby, choose `Watch demo` (`#btn-demo`).
- After ship: open `https://blat.fly.dev/demo`.

## Driving it with computerUse + curl

Preconditions:

- `bash scripts/verify-blat-doctor.sh` exits 0.
- Do not type a lobby password.

- **Deep link.** computerUse: navigate to `http://localhost:5173/demo`. The lobby form must go away. `#room-bar-code` reads `DEMO`. Canvas shows `watching`.
- **Bots.** Wait until nametags `Bot 1`–`Bot 5` (at least two on screen). Score `Alpha` / `Bravo` may move.
- **Combat.** Watch several seconds. Proof is muzzle flashes, tracers, explosions, or blood — not a frozen load screen.
- **Health.** `curl -s http://127.0.0.1:2567/api/health` contains `"ok":true` and `"name":"blat"`.
- **Sim.** `npm test` exits 0 (does not replace combat proof).
- **Proof.** Screenshot of `/demo` with `watching` + combat. Optional: short screen recording of bots fighting.

## Gotchas

- `/demo` does **not** need `BLAT_PASSWORD`. If you are stuck on Name/Password, the route missed; go to `/demo` again.
- "Tap to hear" is not a failure. Visual combat is enough. iPhone Safari audio cannot be judged in this VM.
- Vite on `[::1]:5173` only: doctor fails IPv4. `vite.config.ts` must use `server.host: true`.
- Demo rooms are omitted from `GET /api/rooms`. An empty room list is expected.
- Cloud Agent `/demo` often runs ~15 fps. That is `frame`, not Fly ping — see `lag-observatory`.
- Do not create a normal room "to be safe." Stay on `/demo` for this feature.
