# blat

Local deathmatch slice of a Soldat-style 2D jetpack shooter, built for the browser.

## Play

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

### Controls

| Input | Action |
| --- | --- |
| A / D or ← / → | Move |
| W / ↑ / Space | Jump (grounded) or jet (air) |
| Mouse | Aim |
| Left click | Shoot |
| Right click or G | Throw grenade |

Fight two bots in a small arena. Die → respawn after 2 seconds.

## Stack

- Vite + TypeScript
- Phaser 4 (Arcade physics)

## Next

1. Lift simulation into a Colyseus room (server-authoritative)
2. Create / join via room code + shareable URL
