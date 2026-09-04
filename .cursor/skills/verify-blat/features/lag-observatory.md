# LAG observatory

Live snapshot smoothness is shown on `/demo` as a `LAG` line and posted to `GET /api/lag`. Synthetic 80/150 ms input delay is `npm test`, not the HUD. Local `/demo` RTT is loopback (~0).

## Sub-features

- `lag-hud` paints `LAG  patch …  frame …  behind …  extra …  jerk …  snaps …  OK|WARM` on the room bar (`#lag-hud`) and on the canvas.
- `lag-api` returns the last spectator report as JSON after ~1s on `/demo`.
- `lag-grade` treats `patch ≈ frame` as client hitch (OK), `patch >> frame` as late snapshots (WARM).
- `lag-tests` gates interp smoothness and prediction replay in `shared/lag.test.ts`.

## How to get to it (user POV)

- Watch `/demo`; the line appears top-left and next to Copy link.
- `curl http://localhost:2567/api/lag` after a spectator has joined.
- `npm test` (suite `lag-observatory`).

## Driving it with computerUse + curl

Preconditions:

- Doctor passes.
- A browser is on `http://localhost:5173/demo` for at least two seconds (otherwise `/api/lag` is `{ ok: false, hint: "No client report yet. Open /demo." }`).

- **HUD.** computerUse: read `#lag-hud` and the canvas line starting with `LAG`. It must include `patch`, `frame`, `behind`, `extra`, `jerk`, `snaps`, and `OK` or `WARM`.
- **API.** `curl -s http://127.0.0.1:2567/api/lag`. Body includes `patchMs`, `frameMs`, `line`, `ok`, `ageMs`.
- **Grade.** If `patchMs` is ~60 and `frameMs` is ~60, report **client hitch**, not net lag. Fail netcode only if `patchMs` is far above `frameMs` on a healthy 16 ms client, or `npm test` lag-observatory fails.
- **Sim delay.** `npm test` must pass `replay-cancels-80ms-input-delay` and `replay-cancels-150ms-input-delay`. That is the prediction-at-RTT proof.
- **Proof.** Screenshot of the LAG line on `/demo` plus the curl JSON (file or quoted body).

## Gotchas

- `/api/lag` is empty until a client POSTs; join `/demo` first.
- `jerk` / `snaps` rise when bots explode or turn. Constant-velocity smoothness is the unit test, not a quiet demo.
- `behind` can swing on a hitchy VM. Do not chase Fly interp from Cloud Agent frame time.
- Never claim internet RTT feel from this HUD.
