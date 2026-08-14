# Soldat hitlist

Goal: make **blat** similarly fun to classic Soldat, then add original elements.  
Constraint: keep the arcade shared sim (no Matter/Box2D). Do not invent new game modes until Wave A–C feel right.

Work **one wave at a time**. Prompt from desktop or iPhone; ship; play/watch **https://blat.fly.dev/** and **/demo**.

## Wave A — second-to-second feel

The “is this Soldat?” test. If these are wrong, extra guns will not save it.

| # | Aspect | Soldat | Blat now | Why it matters |
|---|---|---|---|---|
| A1 | Jet as hover-strafe | Feather thrust, hang, ceiling slide, long air time | **Shipped** — thrust > gravity, ~5s fuel, jet strafe, ceiling slide. Grounded later if preferred. | Soldat’s fun *is* aerial gunplay. |
| A2 | Inertia + slopes | Polygon ramps; you slide, kick, carry speed | **Shipped** — ground accel/brake; arcade `RAMPS` you can stand and slide on | Movement skill ceiling. Can fake ramps in arcade sim without Box2D. |
| A3 | Mouse-lead camera | Screen pulled toward cursor; aim is the mouse | **Shipped** — camera pulled toward cursor (capped) | How you *look* while flying and spraying. |
| A4 | Snappy sim | ~60 fps local, tight hits | **Shipped** — `TICK_MS` 16 (~62 Hz), `INTERP_DELAY_MS` 50 | Rubber, late hits, sluggish jets. |
| A5 | Body blocking | Players collide / stack / boost | **Shipped** — pairwise AABB separate; stand-on | Close fights, nade boosts, spawn piles. |
| A6 | Prone | Lie down: tiny hitbox, slow, accurate | **Shipped** — hold S still ~240ms; crawl; tight spread | Peek, hide, bhop cancel. |
| A7 | Hit juice | Cam shake, blood on lens, corpses stay, wall blood | **Shipped** — shake, lens blood, wall splat, death pools | Reads as toy without it. |
| A8 | Sound as feedback | Distinct guns, ricochet, jet hiss, pain | **Shipped** — ricochet + pain (procedural fallback) | You *hear* Soldat before you see it. |

**A1–A8:** Wave A is in. Playtest feel before starting Wave B.

## Wave B — combat identity

| # | Aspect | Soldat | Blat now | Why it matters |
|---|---|---|---|---|
| B1 | Classic kit | DE, MP5, AK, Barrett, M79, LAW, flamer, knife, chainsaw, spas, minigun… | **Shipped** — that kit; spawn DE, loot the rest | Each gun is a different *game*. |
| B2 | Magazines + reload | Finite mags, reload, ammo pickups | **Shipped** — mag + reserve, `R`, ammo boxes | Rhythm, panic reloads, dry-gun melee. |
| B3 | Weapons as objects | Drop on death, throw, pick up off the ground | **Shipped** — swap on touch, `Q` drop, death drop | Map control and loot chaos. |
| B4 | Melee | Knife / chainsaw / punch | **Shipped** — knife always (`2`); chainsaw loot | Finisher when dry or in a pile. |
| B5 | Fast TTK + headshots | DE / Barrett delete; headshots matter | **Shipped** — DE 2-tap, Barrett head OHK, head 2× | Soldat is brutal, not a sponge fight. |
| B6 | Vest + medkits | Armor + health packs on map | **Shipped** — vest soak + medkits | Comeback path without camping spawns. |
| B7 | Nade variety | Frag, cluster, sting, extra throwables | **Shipped** — `V` cycle; cluster burst; sting pellets | Flush, area deny, self-boom skill. |
| B8 | Special ballistics | Flame, rockets, bouncing / slow shells | **Shipped** — flamer, LAW rocket, M79 shell | Toys that change how you move. |

**B1–B8:** Wave B is in. Playtest guns/loot before Wave C.

## Wave C — world and presentation

| # | Aspect | Soldat | Blat now | Why it matters |
|---|---|---|---|---|
| C1 | Maps | Many vertical poly maps (bunkers, ramps, sky) | **Shipped** — Ridge: bunkers, hill ramps, sky pads, side caves | Layout *is* the meta. |
| C2 | Spawns | Multiple, anti-camp | **Shipped** — farthest from living, skip recent | Spawn-kill kills fun. |
| C3 | HUD | Health/vest bars, ammo, nades, weapon icon | **Shipped** — bars + gun icon + nade counts | Read the fight at a glance. |
| C4 | Names + kill feed | Tags, obituaries with weapon | **Shipped** — nametags + `[AK HS]` feed | Know who killed you with what. |
| C5 | Scoreboard | Tab scores / ping | **Shipped** — Tab: K/D/ping | DM needs a reason to keep playing. |
| C6 | Soldier read | Distinct kits, held guns, gore poses | **Shipped** — skins, held guns, vest, ragdoll gore | Silhouette at range. |
| C7 | Scenery / parallax | Dense props, weather optional | **Shipped** — ridges, clouds, flags, barrels | Place, not a debug level. |
| C8 | Bots that use the map | Waypoints, jets, nades, guns | **Shipped** — waypoint steer, loot, cook nades | Demo and solo practice. |

**C1–C8:** Wave C is in. Playtest the map and HUD before Wave D.

## Wave D — after it’s fun

| # | Aspect | Soldat | Blat now | Why it matters |
|---|---|---|---|---|
| D1 | Modes | TDM, CTF, Pointmatch, Infiltration | **Shipped** — lobby select; demo is TDM | Same map, different reasons to move |
| D2 | Realistic | No jet, hotter guns | **Shipped** — jump only, damage ×1.65 | Grounded Soldat toggle |
| D3 | Chat / taunts | T + F-keys | **Shipped** — T chat, F1–F4 | Callouts without voice |
| D4 | Server browser | Public room list | **Shipped** — `/api/rooms` + lobby poll | Beyond invite codes |
| D5 | Minimap + weather | Radar, wind | **Shipped** — radar, wind drift, rain/dust | Read the fight / map |
| D6 | Original toy | — | **Shipped** — **E** blat pulse | Something that isn’t a Soldat clone |

**D1–D6:** Wave D is in. Playtest modes at **https://blat.fly.dev/** (hard-refresh). `/demo` is TDM.

## Wave E — Soldat leftovers + original dash

The clone is playable. This wave adds the missing Soldat toys and one blat-only move.

| # | Aspect | Soldat | Blat now | Why it matters |
|---|---|---|---|---|
| E1 | Bonuses | Berserker, Predator, Flame God | **Shipped** — yellow pads, 12s | Power-up chaos is Soldat |
| E2 | Sprees | Killing Spree / Rampage / … | **Shipped** — 3/5/7/10 + first blood | Hear the stomp |
| E3 | Leftover guns | SOCOM, Ruger, M4, Bow | **Shipped** — loot on Ridge | Each gun is a different game |
| E4 | Team colors | Blue / red kits | **Shipped** — Alpha navy, Bravo crimson | Read teams at range |
| E5 | Throw flag | Toss along aim | **Shipped** — **F** while carrying | CTF skill, not just run |
| E6 | Punch | Fist melee | **Shipped** — **3**, shove | Close pile without a knife swing |
| E7 | Original dash | — | **Shipped** — **Shift** lunge (air in arcade) | Blat movement, not a clone |
| E8 | Bonus read | Glow / fade | **Shipped** — HUD + predator fade | Know who is juiced |

**E1–E8:** Wave E is in. Hard-refresh **https://blat.fly.dev/**.

## Locked / not on this list

- Matter / Box2D (needs a netcode redesign)
- Horizontal Fly scale
- Touch controls (play is keyboard + mouse)
