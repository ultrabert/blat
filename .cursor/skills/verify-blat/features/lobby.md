# Lobby create/join

Humans create or join a 6-letter room from `/`. Demo is a different path. Use this feature only when the change touches lobby, passwords, room list, or modes.

## Sub-features

- `lobby-open` shows Name, Password to create, Mode, Realistic, Create game, Watch demo, room code, Join, open rooms.
- `lobby-create` starts a non-demo room and enters the canvas with `ROOM <code>` in `#room-bar-code`.
- `lobby-join` enters an existing public room by code.
- `lobby-password` rejects a wrong password on **create** when `BLAT_PASSWORD` is set. Join by code / `?room=` / open-room list does **not** need a password.

## How to get to it (user POV)

- Open `http://localhost:5173/` (not `/demo`).
- Choose `Create game` (`#btn-create`) or enter a code and `Join` (`#btn-join`).

## Driving it with computerUse + curl

Preconditions:

- Doctor passes.
- Stay on `/` unless proving join of a room you just created.
- If `curl -s http://127.0.0.1:2567/api/health` has `"passwordRequired":true`, fill `#access-password` from the environment secret. **Never print the password.**

- **Open lobby.** computerUse: `http://localhost:5173/`. Visible: `Create game`, `Watch demo`, `#room-code`.
- **Create.** Fill `#player-name` with `Agent`. Choose `#btn-create`. Canvas loads; `#room-bar-code` is `ROOM` plus a 6-character code, not `DEMO`. You are a soldier, not `watching`.
- **Join without password.** After creating, open `/` in a second profile (or clear `#access-password`), paste the 6-letter code, Join. Canvas loads the same `ROOM` code. `#lobby-error` stays empty.
- **List.** `curl -s http://127.0.0.1:2567/api/rooms` includes that code and omits `DEMO`.
- **Wrong password.** Only if `passwordRequired` is true: open a second browser profile or clear the field, type a bad password, Create. `#lobby-error` shows `Wrong password`.
- **Proof.** Screenshot of lobby and of the created game with `ROOM` code. Do not include password field values in artifacts.

## Gotchas

- Watch demo is **not** this feature; that is `demo-spectator`.
- Demo rooms never appear in `/api/rooms`.
- Local rooms are open to **create** when `BLAT_PASSWORD` is unset (`[blat] BLAT_PASSWORD unset — anyone can create rooms` in the server log). Join is always open.
- One Fly machine in `sin`. Do not scale out extra regions while verifying create/join.
- Bots fill a solo human game; a second human should make bots leave. Two-human lag cannot be judged in one VM.
