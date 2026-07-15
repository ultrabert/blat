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

If `BLAT_PASSWORD` is set, enter it in the lobby before create/join. Leave it empty for open local play.

### Invite friends

1. **Create game**
2. Share the link (`?room=ABCD`) or the 4-letter code (**Copy link**)
3. Friends open the link or enter the code + the shared password

One human → bots fill slots. Second human → bots leave.

### Controls

| Input | Action |
| --- | --- |
| A / D or ← / → | Move |
| W / ↑ / Space | Jump (grounded) or jet (air) |
| Mouse | Aim |
| Left click | Shoot |
| Right click or G | Throw grenade |

## Deploy (Fly.io)

One app serves the built client and Colyseus:

```bash
fly launch --no-deploy   # if first time; uses fly.toml
fly secrets set BLAT_PASSWORD='your-shared-password'
fly deploy
```

Then open `https://<your-app>.fly.dev`. Same origin — no extra `VITE_COLYSEUS_URL` needed.

Keep **one machine** in a nearby region (`sin` by default). Colyseus rooms live in memory; two machines will break create/join without Redis.

```bash
fly scale count 1 --region sin
fly scale count 0 --region sjc   # if an old California machine still exists
```

## Stack

- Vite + TypeScript + Phaser 4 (client)
- Colyseus 0.16 (authoritative sim + rooms)
