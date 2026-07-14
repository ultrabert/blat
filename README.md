# blat

Soldat-style 2D jetpack deathmatch in the browser, with a server-authoritative Colyseus room.

## Play

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:2567

Open two browser tabs to fight another human. With one tab, two bots fill the arena.

### Controls

| Input | Action |
| --- | --- |
| A / D or ← / → | Move |
| W / ↑ / Space | Jump (grounded) or jet (air) |
| Mouse | Aim |
| Left click | Shoot |
| Right click or G | Throw grenade |

## Stack

- Vite + TypeScript + Phaser 4 (client render / input)
- Colyseus 0.16 (authoritative simulation + state sync)

## Next

Create / join via room code + shareable URL.
