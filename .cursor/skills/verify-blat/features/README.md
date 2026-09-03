# blat verification map

Maintained source for proving user-facing blat behavior. Read this index, then the matching feature file.

## Baseline preconditions

- Doctor passes: `bash scripts/verify-blat-doctor.sh`.
- Client `http://127.0.0.1:5173`, server `http://127.0.0.1:2567`.
- Reuse the shared `npm run dev` / `game` terminal. Do not start a second instance on the same ports.
- Default entry: `http://localhost:5173/demo` (spectator, no password).
- Evidence: `/opt/cursor/artifacts/` on Cloud Agents; otherwise `/tmp/verify-blat/`.

## Driving conventions

- Start from `/demo` unless the feature says lobby.
- Prefer DOM ids (`#btn-demo`, `#lag-hud`) and visible canvas strings (`watching`, `Bot 1`) over click coordinates.
- Treat commands as literal.
- computerUse for the Phaser canvas. curl for `/api/health` and `/api/lag`. `npm test` for shared sim.
- Leave the shared game process running after a reused Launch.

## Proof and skip reporting

- Capture the user action and the resulting state.
- UI proof: screenshot with `/demo` or lobby visible, plus what you saw (HUD, combat, LAG).
- API proof: curl body and exit/http code.
- Sim proof: `npm test` pass/fail counts.
- Record the feature id with artifacts.
- An unreachable path is a fail with the unmet precondition, not a skip-as-verified.

## Features

- [Demo spectator](./demo-spectator.md) — `/demo` auto-joins bots fighting. Default verify path.
- [LAG observatory](./lag-observatory.md) — HUD + `GET /api/lag` + synthetic RTT tests.
- [Lobby create/join](./lobby.md) — passworded rooms, not the demo.
