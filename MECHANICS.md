# Game Mechanics Spec

Living source of truth for Soldat-inspired mechanics in **blat**.
Update this file when behavior changes. Prefer small, testable layers.

## Architecture trade-offs (locked)

| Choice | Benefit | Cost |
|---|---|---|
| Custom fixed-step arcade sim (`shared/`) + Colyseus authority | Predictable ticks, easy client prediction, low bandwidth | Not full rigid-body Soldat; no Matter/Box2D |
| Grounded jet (ascent cap, hungry fuel, soft air steer) | Ground fights matter; jets are bursts | Less freestyle aerial dueling |
| Client prediction (move + projectiles) | Responsive feel over internet | Must share exact step math with server |
| Client-only ragdoll/gibs | Cheap, juicy | Bodies are not authoritative obstacles |
| Single Fly machine | Correct in-memory rooms | No horizontal scale yet |

**Do not** migrate to Matter/Box2D without an explicit redesign of netcode + prediction.

## Phase status

| Phase | Focus | Status |
|---|---|---|
| 1 | Foundation movement / platforms | Done (arcade) |
| 2 | Ballistic combat | **Done** — drop, inheritance, power→damage (`npm test`) |
| 3 | Jet polish + crouch / low cover / rolls | **Done** — S/↓ crouch, roll, waist covers |
| 4 | Accuracy, recoil, body hitboxes | **Done** — stance spread, recoil climb, head/torso/legs |
| 5 | Advanced movement (cannonball, etc.) | **Done** — bhop, kick jump, cannonball, backflip, air momentum |
| 6 | Grenade cook, richer ragdoll/knockback | **Done** — cook/hold, blast+bullet knockback, death fling |
| 7 | Weapon arsenal + pickups | **Done** — rifle / sniper / shotgun + map pickups |
| 8 | Modes / realism toggles / polish | Partial (DM lobby + spectator demo) |

## Mechanic: arcade-physics-core

**Phase:** 1  
**Tags:** `@mechanic arcade-physics-core`  
**Description:** Shared fixed-timestep movement, gravity, platform collision.  
**Dependencies:** none  
**Trade-offs:** Changing `GRAVITY` / `PLAYER.*` retunes jet, jump, grenades, and ballistics together.  
**Tests:** movement stays within arena; platforms support landing.  
**Files:** `shared/physics.ts`, `shared/constants.ts`, `shared/simulation.ts`

## Mechanic: ballistic-projectiles

**Phase:** 2  
**Tags:** `@mechanic ballistic-projectiles`  
**Description:** Bullets arc under gravity, inherit a fraction of shooter velocity, lose speed over time (damage scales with remaining speed). Hits use swept traces (no tunneling).  
**Dependencies:** `arcade-physics-core`, hit traces  
**Trade-offs:**
- Higher muzzle speed → less drop, stronger inheritance punch  
- Higher bullet gravity → more skill ceiling, harder close-mid spray  
- Drag/damage falloff punishes long shots; must stay fair vs grenades  
**Tests:** `shared/ballistics.test.ts`  
**Files:** `shared/ballistics.ts`, `shared/simulation.ts`, `shared/trace.ts`, `src/game/net/ProjectilePredictor.ts`

## Mechanic: limited-jetpack

**Phase:** 1/3  
**Tags:** `@mechanic limited-jetpack`  
**Description:** Fuel-limited upward thrust; regenerates (faster grounded).  
**Trade-offs:** More fuel / thrust undermines grounded movement skill and future accuracy penalties.  
**Files:** `shared/physics.ts`, HUD in `GameScene`

## Mechanic: throwable-grenades

**Phase:** 6  
**Tags:** `@mechanic throwable-grenades`  
**Description:** Hold RMB/G to cook; release to throw with remaining fuse (`fuseMs − cook`). Max cook detonates in hand. Arcs, bounces on platforms/covers, blast damage + knockback.  
**Trade-offs:**
- Blast radius vs crouch-cover — grenades are the intended flush  
- Cook-vs-safety — longer cook = less flight time, risk of self-blast  
**Tests:** `shared/grenades.test.ts`  
**Files:** `shared/grenades.ts`, `shared/simulation.ts`, `ProjectilePredictor`, `GameScene`

## Mechanic: knockback

**Phase:** 6  
**Tags:** `@mechanic knockback`  
**Description:** Bullets and blasts add velocity to living players. Death keeps that velocity so client ragdoll flings with the hit.  
**Trade-offs:** Strong knockback is juicy but can shove fights around — tune `KNOCKBACK` / `GRENADE.blastKnockback`.  
**Tests:** `shared/grenades.test.ts`  
**Files:** `shared/grenades.ts`, `shared/simulation.ts`, `StickSoldier`

## Mechanic: client-prediction

**Phase:** netcode  
**Tags:** `@mechanic client-prediction`  
**Description:** Local movement + projectiles predict; server reconciles via sequenced inputs.  
**Trade-offs:** Any sim divergence → rubber-banding / ghost shots. Shared math is mandatory.  
**Files:** `src/game/net/PredictionController.ts`, `ProjectilePredictor.ts`, `shared/simulation.ts`

## Mechanic: crouch-cover

**Phase:** 3  
**Tags:** `@mechanic crouch-cover`  
**Description:** Crouch (S/↓) lowers hitbox + muzzle. Crouch+move starts a short momentum roll. Waist-high `COVERS` are solid for bullets and bodies — crouched players hide fully; standing peeks (head exposed). Grenade arcs clear covers.  
**Dependencies:** hit traces, movement  
**Trade-offs:**
- Safety vs offense (can't easily shoot through your own barricade while crouched)  
- Rolls are fast but on cooldown — spam softens gunfights if CD too low  
- Cover density changes map flow; keep sparse  
**Tests:** `shared/cover.test.ts`  
**Files:** `shared/constants.ts` (`COVERS`), `shared/physics.ts`, `shared/trace.ts`, `GameScene`, `StickSoldier`

## Mechanic: state-accuracy

**Phase:** 4  
**Tags:** `@mechanic state-accuracy`  
**Description:** Fire direction includes stance-based cone spread (still < crouch-tight; move/air/jet/roll wider). Spread is deterministic from input `seq` so client prediction matches the server. Crosshair radius reflects current cone.  
**Dependencies:** `ballistic-projectiles`, movement stance  
**Trade-offs:**
- Mobility vs accuracy — jetting/rolling is loud and inaccurate by design  
- Crouch tightens the cone but slows you and ties into cover  
**Tests:** `shared/accuracy.test.ts`  
**Files:** `shared/accuracy.ts`, `shared/simulation.ts`, `ProjectilePredictor`, `GameScene`

## Mechanic: recoil

**Phase:** 4  
**Tags:** `@mechanic recoil`  
**Description:** Each shot adds upward aim kick that decays over time (faster while crouched). Kick is applied before spread; not networked — client keeps local recoil across reconcile.  
**Trade-offs:** Spray climbs the cone; tap-firing recovers. Crouch recovers faster (`recoil-vs-firerate`).  
**Files:** `shared/accuracy.ts`, `shared/physics.ts` (decay in `stepMovement`), fire paths

## Mechanic: body-hitboxes

**Phase:** 4  
**Tags:** `@mechanic body-hitboxes`  
**Description:** Player AABB hits resolve to head / torso / legs by vertical fraction (crouch-aware). Damage multiplies: head 1.85×, torso 1×, legs 0.65×.  
**Dependencies:** swept traces  
**Trade-offs:** Rewards aim at peeks over cover; legs are forgiving for low sprays.  
**Tests:** `shared/accuracy.test.ts`  
**Files:** `shared/accuracy.ts`, `shared/trace.ts`, `shared/simulation.ts`

## Mechanic: advanced-movement

**Phase:** 5  
**Tags:** `@mechanic advanced-movement`  
**Description:** Momentum chaining on top of arcade movement:
- **Overspeed coast** — same-direction speed above walk decays slowly (prone/roll cancel keeps momentum)
- **Air control** — soft lateral accel; does not snap `vx`
- **Bunny hop** — jump inside `landGraceMs` after landing multiplies horizontal speed (capped)
- **Kick jump** — grounded jump while strafing adds a forward nudge
- **Cannonball** — tap crouch while falling fast → convert `vy` into dive `vx` (tucked hitbox, wide spread)
- **Backflip** — in air, hold crouch + tap jet → reverse climb (fuel cost)

**Dependencies:** `arcade-physics-core`, `limited-jetpack`, rolls  
**Trade-offs:**
- Mobility skill ceiling vs beginner snap-strafe feel (walk still snaps; overspeed is opt-in via chaining)
- Cannonball / flip are inaccurate and spend attention / fuel  
**Tests:** `shared/movement.test.ts`  
**Files:** `shared/physics.ts`, `shared/constants.ts` (`PLAYER.*` move tunables), prediction, `StickSoldier`

## Mechanic: weapon-arsenal

**Phase:** 7  
**Tags:** `@mechanic weapon-arsenal`  
**Description:** Three guns with shared fire math:
- **Rifle (1)** — default, mid RoF / mid spread  
- **Sniper (2)** — slow bolt, tight cone, high damage & muzzle speed  
- **Shotgun (3)** — slow pump, 7 pellets, wide cone, per-pellet damage  

Keys `1/2/3` equip owned weapons. Crosshair reflects weapon cone.  
**Trade-offs:** Range vs RoF — sniper punishes spray; shotgun owns close range; rifle is the flexible middle.  
**Tests:** `shared/weapons.test.ts`  
**Files:** `shared/weapons.ts`, `shared/simulation.ts`, `ProjectilePredictor`, `GameScene`

## Mechanic: weapon-pickups

**Phase:** 7  
**Tags:** `@mechanic weapon-pickups`  
**Description:** Map pads unlock sniper/shotgun (and a mid rifle pad). Touch to grant + equip; pad respawns after `PICKUP_RESPAWN_MS`. Unlocks persist across death.  
**Files:** `shared/weapons.ts` (`WEAPON_PICKUPS`), `shared/simulation.ts`, `schema.PickupState`

## Mechanic: bot-dm-ai

**Phase:** 8  
**Tags:** `@mechanic bot-dm-ai`  
**Description:** Bots pick a sticky target (prefer humans, else other soldiers) and hold it for ~0.7–2.2s, then nearest or random. Close range they strafe / back off / roll instead of always walking into the target. Demo spectator room keeps `DEMO_BOTS` (5) fighting.  
**Trade-offs:** Random retarget + strafe breaks 1v1 mirror loops; bots look less “aimed.” Extra demo bots cost a bit of sim.  
**Files:** `shared/simulation.ts` (`updateBotBrain`), `shared/constants.ts` (`BOT`, `DEMO_BOTS`), `server/rooms/DmRoom.ts`

## How agents / humans must edit mechanics

1. Read the matching section here before changing tagged code.  
2. Note new trade-offs in this file when behavior changes.  
3. Keep or update related tests (`npm test`).  
4. Prefer shared `shared/*` math over duplicated client/server logic.

Search code for `@mechanic <name>`.
