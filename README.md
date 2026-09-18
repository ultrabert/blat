# blat

Soldat-style 2D jetpack deathmatch in the browser, with a server-authoritative Colyseus room.

## Play locally

```bash
cp .env.example .env   # set BLAT_PASSWORD
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:2567

If `BLAT_PASSWORD` is set, enter it in the lobby to **create** a room. Joining by code or invite link does not need the password. Leave the password empty for open local play (anyone can create).

### Invite friends

1. **Create game** (shared password required when `BLAT_PASSWORD` is set)
2. Share the link (`?room=ABCDEF`) or the 6-letter code (**Copy link**)
3. Friends open the link or enter the code — no password

Lobby **Mode** + **Realistic** apply when you create. Open rooms list public matches (code, mode, players); join from the list is also passwordless.

One human → bots fill slots. Second human → bots leave.

### Controls

| Input | Action |
| --- | --- |
| A / D or ← / → | Move |
| W / ↑ / Space | Jump (grounded) or jet (air; off in Realistic) |
| Mouse | Aim |
| Left click | Shoot |
| 1 / 2 | Equip firearm / melee |
| R | Reload |
| Q | Drop gun |
| V | Cycle nade |
| E | Blat pulse (knockback ring) |
| Shift | Dash / lunge (ground-only in Realistic) |
| 3 | Punch |
| F | Toss carried flag |
| T | Chat |
| F1–F4 | Taunts |
| Tab (hold) | Scoreboard |
| Right click or G | Throw grenade (hold to cook; release to throw; max cook = boom in hand) |

## Play live

**https://blat.fly.dev/** — hard-refresh after a deploy. Creating a room uses the Fly secret `BLAT_PASSWORD`; joining an existing room does not.

Prompt in Cursor (desktop or iPhone) → agent ships → open **https://blat.fly.dev/demo** to watch bots fight, or create a game at **https://blat.fly.dev/**.

iPhone Cursor is for **prompts**. Play in Safari (or a computer) — the game needs a keyboard + mouse.

### Ship

```bash
npm run ship          # tests + fly deploy (desktop agent / this machine)
git push origin main  # GitHub Action also deploys on push to main
```

## Deploy (Fly.io)

One app serves the built client and Colyseus:

```bash
fly launch --no-deploy   # if first time; uses fly.toml
fly secrets set BLAT_PASSWORD='your-shared-password'
fly deploy
```

Then open `https://blat.fly.dev`. Same origin — no extra `VITE_COLYSEUS_URL` needed.

Keep **one machine** in a nearby region (`sin` by default). Colyseus rooms live in memory; two machines will break create/join without Redis.

```bash
fly scale count 1 --region sin
fly scale count 0 --region sjc   # if an old California machine still exists
```

## Stack

- Vite + TypeScript + Phaser 4 (client)
- Colyseus 0.16 (authoritative sim + rooms)
