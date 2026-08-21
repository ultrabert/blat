# Game Mechanics Spec

Living source of truth for Soldat-inspired mechanics in **blat**.
Update this file when behavior changes. Prefer small, testable layers.

## Architecture trade-offs (locked)

| Choice | Benefit | Cost |
|---|---|---|
| Custom fixed-step arcade sim (`shared/`) + Colyseus authority | Predictable ticks, easy client prediction, low bandwidth | Not full rigid-body Soldat; no Matter/Box2D |
| Hover jet (thrust > gravity, long fuel, sky/cave ceiling slide) | Soldat-style aerial gunplay | Ground fights are optional; can retune grounded later |
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
| 7 | Weapon arsenal + pickups | **Done** — Wave B kit, mags, drops, vest, nades |
| 8 | Modes / realism toggles / polish | **Done** — TDM/CTF/Point/Infil, realistic, chat, browser, minimap, wind, blat pulse |
| 9 | Bonuses / leftover kit / dash | **Done** — Wave E |

## Mechanic: arcade-physics-core

**Phase:** 1  
**Tags:** `@mechanic arcade-physics-core`  
**Description:** Shared fixed-timestep movement, gravity, platform collision.  
**Dependencies:** none  
**Trade-offs:** Changing `GRAVITY` / `PLAYER.*` retunes jet, jump, grenades, and ballistics together. Ground walk uses `groundAccel` / `groundBrake` (no snap). Hills are solid `TERRAIN_POLYS` fill (`terrainBandsAt`); `RAMPS` are the walkable tops (cave-drop segments are ceilings, not floors). Standing on a ramp slides downhill once (`PLAYER.slopeSlide`, weaker `slopeDrag`) — not applied in both terrain seat and ramp collide. Landing uses a swept cross or a near window when grounded / falling (`vy >= 0`) / rolling / cannonballing. Hover/climb jet does not glue. Overlap ejects along the **nearest** face (side / cave roof / hill top) — not across a 600px dirt wedge. Jetting never seats onto the ridge. Sim ticks at `TICK_MS` 16 (~62 Hz) with `INTERP_DELAY_MS` 33 (~2 snapshots) and `EXTRAPOLATE_MS` 48 of dead-reckon. Server patches immediately after each sim tick (not a second interval). Server and client both step that fixed dt (Colyseus wall-clock is accumulated, not passed into physics).  
**Tests:** movement stays within arena; platforms support landing; ground accel does not snap; ramps set `onGround`; idle bowl slides downhill; slow falls land; dirt ejects to the surface; jet near a ramp does not snap on.  
**Files:** `shared/physics.ts`, `shared/constants.ts`, `shared/terrain.ts`, `shared/simulation.ts`

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

**Phase:** 1/3 — **A1 retune**  
**Tags:** `@mechanic limited-jetpack`  
**Description:** Fuel-limited thrust that **beats gravity**. Hold W/Space to climb; feather to hover; strafe in air while jetting. Pads are one-way (jet through from below). The map sky and cave roofs dump upward speed so you can slide under them. Fuel lasts ~5s continuous; ground regen is slower than the burn (a pad touch is not a full tank) and glide regen is a trickle so feathering still empties. Grounded W/Space is still a jump, then jets.  
**Trade-offs:** Aerial duels dominate if fuel is too generous; spread is still worse while jetting (`state-accuracy`). Can retune toward grounded later without a netcode change. Realistic mode disables air jet/backflip (ground jump stays).  
**Tests:** `shared/movement.test.ts` (`limited-jetpack`, `ground-fuel-refill-is-not-instant`, `jet-from-right-spawn-clears-the-loft`)  
**Files:** `shared/physics.ts`, `shared/constants.ts` (`PLAYER.jet*`, fuel), HUD in `GameScene`

## Mechanic: throwable-grenades

**Phase:** 6  
**Tags:** `@mechanic throwable-grenades`  
**Description:** Right-click / G throws a short lob (hold to cook; release to throw with remaining fuse). A tap still leaves the hand. Downward aim is lofted so the nade does not plant at your feet. Max cook detonates in hand. Arcs, bounces on platforms/covers/ramps/terrain fill. Fuse detonates — nades do not explode on player contact. Blast damage + knockback. Frag radius 128 reaches behind the mid sandbag so a cooked nade flushes crouch-cover; blast ignores cover (bullets do not).  
**Trade-offs:**
- Blast radius vs crouch-cover — grenades are the intended flush  
- Cook-vs-safety — longer cook = less flight time, risk of self-blast  
- Short throw vs map-wide bombs — air drag is light (~0.35/s); range is the throw vector, not a dump  
- Impact fuse was too strong (point-blank stick), so nades bounce until the timer  
**Tests:** `shared/grenades.test.ts` (`frag-blast-reaches-behind-mid-cover`, `forward-lob-is-short-range`)  
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
**Description:** Local movement + projectiles predict; server reconciles via sequenced inputs. Held fire is true on every sim tick while the button is down (autos don’t skip a cooldown window on a hitch). Reconcile runs once per sim step (not every render frame). Server lockstep is always `TICK_MS` and consumes **one** input per tick (no wall-clock dt, no burst drain). A full input queue drops the **oldest** seq so the live packet is not ignored. Client sends the tick’s inputs in **one** message. Replay error under 8px keeps predicted pose. Grounded replay never overwrites Y (lagged slope Y at a different X hops you off the surface). Else blend 0.2; snap beyond `RECONCILE_SNAP_DIST` of the **replayed** pose (not raw RTT lag). Remotes interpolate on the server `state.now` clock (one sample per sim tick) and extrapolate with velocity when a patch is late — not on the render-loop clock.  
**Trade-offs:** Any sim divergence → rubber-banding / ghost shots. Shared math is mandatory. Small deadzone can hide a few pixels of authority error in exchange for no slope chatter. A hitch can leave a short input backlog (one seq per tick) instead of teleporting. Your own gunplay is predicted; opponents are ~`INTERP_DELAY_MS` behind the latest snapshot **plus** one-way RTT (geography to the single Fly machine).  
**Tests:** `shared/simulation.net.test.ts`, `shared/netinterp.test.ts`  
**Files:** `src/game/net/PredictionController.ts`, `ProjectilePredictor.ts`, `shared/simulation.ts`, `shared/netinterp.ts`, `server/rooms/DmRoom.ts`

## Mechanic: crouch-cover

**Phase:** 3  
**Tags:** `@mechanic crouch-cover`  
**Description:** Crouch (S/↓) lowers hitbox + muzzle. Crouch+move starts a short momentum roll. Hold S still ~240ms on ground to go **prone** (tiny AABB, crawl speed, tightest spread). Release S stands. Waist-high `COVERS` are solid for bullets and bodies — crouched players hide fully; standing peeks (head exposed). Grenade arcs clear covers.  
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
- Prone is tighter still (`proneMult`) but you crawl and present a low silhouette  
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
**Description:** Player AABB hits resolve to head / torso / legs by vertical fraction (crouch-aware). Damage multiplies: head 2.0×, torso 1×, legs 0.65×. Barrett head is always lethal.  
**Dependencies:** swept traces  
**Trade-offs:** Rewards aim at peeks over cover; legs are forgiving for low sprays.  
**Tests:** `shared/accuracy.test.ts`  
**Files:** `shared/accuracy.ts`, `shared/trace.ts`, `shared/simulation.ts`

## Mechanic: advanced-movement

**Phase:** 5  
**Tags:** `@mechanic advanced-movement`  
**Description:** Momentum chaining on top of arcade movement:
- **Overspeed coast** — same-direction speed above walk decays slowly (prone/roll cancel keeps momentum)
- **Ground inertia** — accelerate / brake toward walk (or crouch/crawl) speed; no snap from rest
- **Air control** — soft lateral accel; does not snap `vx`
- **Bunny hop** — jump inside `landGraceMs` after landing multiplies horizontal speed (capped)
- **Kick jump** — grounded jump while strafing adds a forward nudge
- **Cannonball** — tap crouch while falling fast → convert `vy` into dive `vx` (tucked hitbox, wide spread)
- **Backflip** — in air, hold crouch + tap jet → reverse climb (fuel cost)

**Dependencies:** `arcade-physics-core`, `limited-jetpack`, rolls  
**Trade-offs:**
- Mobility skill ceiling vs beginner snap-strafe feel (walk accelerates; overspeed is still opt-in via chaining)
- Cannonball / flip are inaccurate and spend attention / fuel  
**Tests:** `shared/movement.test.ts`  
**Files:** `shared/physics.ts`, `shared/constants.ts` (`PLAYER.*` move tunables), prediction, `StickSoldier`

## Mechanic: weapon-arsenal

**Phase:** 7 — **B1 / B5 retune**  
**Tags:** `@mechanic weapon-arsenal`  
**Description:** Soldat-ish kit. Spawn with Desert Eagle. Map guns are objects. `1` firearm / `2` melee.
- **DE** — 7-round tap cannon; 2-tap torso, head deletes  
- **MP5 / AK / minigun** — spray vs mid vs hose  
- **Barrett** — bolt, body chunky (88, still sub-lethal), head OHK; cave pad is the pilgrimage  
- **SPAS-12** — 10-pellet pump, wide cone; close range is easy to tag  
- **M79 / LAW** — arcing shell / flat rocket, explode on hit. LAW holds 4 in the tube; empty drops still chamber a mag (infinite reserve).  
- **Flamer** — rising particle hose (~220px), not a puff  
- **Knife / chainsaw** — melee (dry-gun finisher)  

Shared `planFire` keeps client prediction identical to the server. Head multiplier is 2.0.  
**Trade-offs:** Fast TTK + vest makes armor pickups matter; DE/Barrett punish misses less than the old sponge rifle.  
**Tests:** `shared/weapons.test.ts`  
**Files:** `shared/weapons.ts`, `shared/fire.ts`, `shared/simulation.ts`, `ProjectilePredictor`, `GameScene`

## Mechanic: magazines-reload

**Phase:** B2  
**Tags:** `@mechanic magazines-reload`  
**Description:** Firearms have a finite mag. Empty mag or `R` reloads (`reloadMs`). Reload always refills the mag — guns do not run out of reserve. Picking up a gun with 0 in the mag also chambers a full mag. Mag size, fire rate, and reload time are the balance. Melee has no mag.  
**Trade-offs:** No ammo drought or ammo-box camping. Spray guns pay in reload downtime instead.  
**Tests:** `shared/weapons.test.ts` (`magazines-reload`)  
**Files:** `shared/weapons.ts`, `shared/simulation.ts`, HUD

## Mechanic: weapon-pickups

**Phase:** 7 — **B3 retune**  
**Tags:** `@mechanic weapon-pickups`  
**Description:** Touching a weapon **swaps** (drops the gun you were holding behind you). Death drops your firearm (and chainsaw). `Q` throws the gun. Drops cannot be grabbed for `PICKUP_ARM_MS` so you do not immediately re-collect the crate. Unlocks do **not** persist across death — you respawn with DE + knife. Six power pads (AK, minigun, LAW, Barrett, M79, flamer) sit on decks, open cave rooms, and sky — off spawn, not under the bowl. Client hides pickups the hill occludes. Drops `sitOnWalkable` so they do not stick inside dirt. Weapon pads respawn on `WEAPON_RESPAWN_MS` (90s); kits/nades stay on `PICKUP_RESPAWN_MS`. Drops are ephemeral.  
**Trade-offs:** Getting a Barrett or LAW is a trip and a hold. Losing it (death drop) is the other way to contest it. SPAS / M4 / bow / etc. stay in the arsenal but are not map pads.  
**Tests:** `shared/weapons.test.ts` (`weapon-pickups`)  
**Files:** `shared/weapons.ts` (`MAP_PICKUPS`), `shared/simulation.ts`, `schema.PickupState`

## Mechanic: melee

**Phase:** B4  
**Tags:** `@mechanic melee`  
**Description:** Knife always (key `2`). Short trace, high damage. Chainsaw is in the arsenal (hold-fire ticks) but has no map pad.  
**Files:** `shared/weapons.ts`, `shared/simulation.ts` (`resolveMelee`)

## Mechanic: vest-medkits

**Phase:** B6  
**Tags:** `@mechanic vest-medkits`  
**Description:** Vest 0–100 soaks ~50% of body shots (less on head). Medkits +50 HP. Map pads. Spawn with no vest.  
**Tests:** `shared/weapons.test.ts` (`vest-medkits`)  
**Files:** `shared/fire.ts` (`applyVestDamage`), `shared/weapons.ts`, simulation pickups

## Mechanic: nade-variety

**Phase:** B7  
**Tags:** `@mechanic throwable-grenades`  
**Description:** Frag / cluster / sting. `V` cycles. Right-click / G throws (hold to cook). Cluster bursts into child nades; sting is a weak blast plus radial pellets. Spawn 2/1/1.  
**Tests:** `shared/weapons.test.ts` (`nade-variety`), `shared/grenades.test.ts`  
**Files:** `shared/grenades.ts` (`NADE`), `shared/simulation.ts`

## Mechanic: special-ballistics

**Phase:** B8  
**Tags:** `@mechanic special-ballistics`  
**Description:** Per-shot gravity/drag/life from the weapon def. LAW is a flat rocket; M79 a heavy shell; both explode on hit. Flamer particles live ~560ms with moderate drag and a slight lift so the stream reaches across a room.  
**Files:** `shared/fire.ts` (`planFire`), `shared/ballistics.ts`, simulation `stepBullet`

## Mechanic: bot-dm-ai

**Phase:** 8  
**Tags:** `@mechanic bot-dm-ai`  
**Description:** Bots pick a sticky target (prefer humans), steer via `WAYPOINTS` (jet to high pads / drop into caves), skip paths that clip solid hills, jump when a crate or wall pins them, seek medkits when hurt and `DESTINATION_GUNS` when still on DE (Barrett/LAW/AK even through dirt, via waypoints). Cave-floor jets only when the goal is outside the cave. Cook nades more often at crouched targets. Demo spectator room keeps `DEMO_BOTS` (5) fighting.  
**Trade-offs:** Waypoint greedy-steer is not a navmesh — bots can still take odd paths around bunkers. Extra demo bots cost a bit of sim.  
**Tests:** `shared/world.test.ts` (`arena-map`, `bot-dm-ai`)  
**Files:** `shared/simulation.ts` (`updateBotBrain`), `shared/constants.ts` (`BOT`, `WAYPOINTS`, `DEMO_BOTS`), `server/rooms/DmRoom.ts`

## Mechanic: body-blocking

**Phase:** A5  
**Tags:** `@mechanic body-blocking`  
**Description:** Living players are solid to each other. Pairwise AABB separate (50/50) after soldier steps; you can stand on shoulders. Client prediction pushes the local body out of interpolated remotes.  
**Trade-offs:** Spawn piles and nade-boosts become possible; prediction vs remote can still ghost for a frame.  
**Tests:** `shared/movement.test.ts` (`prone-and-blocking`)  
**Files:** `shared/physics.ts` (`separateFromSolids`), `shared/simulation.ts`, `PredictionController`

## Mechanic: mouse-lead-camera

**Phase:** A3  
**Tags:** `@mechanic mouse-lead-camera`  
**Description:** Local camera follows the player plus a capped pull toward the cursor (lead 0.42, max 240px). Follow is dt-based (`1 - exp(-18 dt)`), not 0.5/frame — high refresh was amplifying 1–2px pose noise into hops. Spectator camera still eases toward the fight cluster.  
**Files:** `src/game/scenes/GameScene.ts`

## Mechanic: arena-map

**Phase:** C1  
**Tags:** `@mechanic arena-map`  
**Description:** Arena homage (chakapoko's default DM): rim decks, a sloped pit you can run, a mid span, sky pads, and side caves under the bowl. Center floor at y=850 (x=1280) stays solid so cover/prone tests hold. Arcade `PLATFORMS` + `RAMPS` + `COVERS` — not Box2D. `TERRAIN_POLYS` are the filled Soldat-style hills (solid dirt, same shape the client paints): dirt bowls with grass caps, a sand pit bed, dark cave chambers. Gun and kit pads sit on decks/pads, not strung along the bowl run. Loft crates sit on the outer edge so the flag has a walk lane onto the bowl. Caves are air under the rim decks (`x<400` / `x>2160`) plus a door through each bowl so the under-hill tunnel connects.  
**Trade-offs:** One authored map, not a map pack. Caves punish spawn-campers who sit in the pit. Not a vertex-perfect Arena port — layout and slopes, painted to read as places.  
**Tests:** `shared/world.test.ts` (`arena-map`)  
**Files:** `shared/constants.ts`, `src/game/scenes/GameScene.ts` (`drawTerrain`), `BootScene`

## Mechanic: anti-camp-spawns

**Phase:** C2  
**Tags:** `@mechanic anti-camp-spawns`  
**Description:** Respawn picks the slot farthest from living players and skips the last few used indices.  
**Tests:** `shared/world.test.ts`  
**Files:** `shared/spawns.ts`, `shared/simulation.ts`

## Mechanic: combat-hud

**Phase:** C3  
**Tags:** `@mechanic combat-hud`  
**Description:** Labeled HP / vest / jet / pulse / dash meters on a plate, centered weapon well with big mag count, nade chips, match clock up top. Headshot and multi-kill banners punch in the middle of the screen.  
**Files:** `src/game/hud.ts`, `GameScene`

## Mechanic: kill-feed

**Phase:** C4  
**Tags:** `@mechanic kill-feed`  
**Description:** Nametags over other soldiers. Obituaries `Killer [AK] HS Victim` (or `Victim [FALL]`). Synced `killFeed` array (max 8). Headshot rows highlight gold.  
**Files:** `shared/schema.ts` (`KillFeedEntry`), `shared/simulation.ts`, `StickSoldier`, `src/game/hud.ts`

## Mechanic: scoreboard

**Phase:** C5  
**Tags:** `@mechanic scoreboard`  
**Description:** Hold Tab for K/D/ping. Client RTT handshake (`ping`/`pong`/`rtt`). Bots show —.  
**Files:** `src/game/hud.ts`, `server/rooms/DmRoom.ts`, `PlayerState.deaths` / `ping`

## Mechanic: soldier-read

**Phase:** C6  
**Tags:** `@mechanic soldier-read`  
**Description:** Painted kits with a thin dark edge so figures read on dirt. Held guns are blued-steel vector props with a small brass muzzle. Local barrel snaps to the cursor; remotes ease slightly. Vest is a cool shade, not a pale wash. In the air the body stays upright (jet lean into travel, legs trail); roll/cannonball/backflip spin dies when the move ends so flyers do not stay twisted. Cosmetic only — hitboxes stay on the sim capsule.  
**Files:** `src/game/StickSoldier.ts`, `src/game/skins.ts`

## Mechanic: combat-sfx

**Phase:** 8  
**Tags:** `@mechanic combat-sfx`  
**Description:** Sampled gun reports (CC0). Local shots play dry. Other players' / bots' shots play when a new server bullet appears (pellet-debounced), quieter and panned from the camera. LAW layers a short boom. Jet is a quiet hiss loop. Audio unlock ignores OS key-repeat so holding W/Space does not replay the HTML beep. Falls back to synth if a clip is missing. Clips ship as `.ogg` and `.m4a`. iPhone/iPad play AAC through HTMLAudio (`playsinline`) after a tap — Web Audio stays suspended on `/demo` auto-join and a silent buffer does not unlock Safari. A full-screen "Tap to hear" gate stays up until a clip actually plays; the Ring switch still mutes Safari. Desktop keeps the Web Audio bus.  
**Files:** `src/game/audio/SoundBus.ts`, `shared/sfxExts.ts`, `GameScene`, lobby  
**Tests:** `shared/sfxExts.test.ts`

## Mechanic: scenery-parallax

**Phase:** C7  
**Tags:** `@mechanic scenery-parallax`  
**Description:** Parallax ridges/clouds plus grounded world props (flags, barrels, antennas). `bg_scrub` is a painted horizon plate, not a bush — do not stamp it on the playfield. No collision.  
**Files:** `src/game/scenery.ts`, `BootScene`, `GameScene.drawBackground`

## Mechanic: match-modes

**Phase:** D1 / 8  
**Tags:** `@mechanic match-modes`  
**Description:** Soldat modes on Arena. TDM / CTF / Infiltration are teams (Alpha left, Bravo right, no friendly fire). DM and Pointmatch are FFA. Score limits: DM 20, TDM 40, CTF 5, Point 80, Infil 5. Round 6 minutes.  
- **CTF:** flags at loft `{180,280}` / `{2380,280}`. Touch enemy flag to carry; score at own home if own flag is home. Die drops it; return after 8s or teammate touch.  
- **Pointmatch:** hill `{1280,740}` r=72; sole occupant +4 score/sec.  
- **Infiltration:** Bravo holds loft `{200,210}` for 1600ms to score; Alpha defends.  
Demo room defaults to TDM.  
**Tests:** `shared/match.test.ts`, `shared/modes.test.ts`  
**Files:** `shared/match.ts`, `shared/simulation.ts`, `server/rooms/DmRoom.ts`, lobby mode select

## Mechanic: realistic-mode

**Phase:** D2  
**Tags:** `@mechanic realistic-mode`  
**Description:** Soldat-style toggle. Air jet and backflip off; grounded jump still works. Damage × 1.65. Synced on `GameState.realistic` / `MoveBody.realistic` so prediction matches.  
**Trade-offs:** Ground fights dominate; map verticality is harder without jets.  
**Tests:** `shared/match.test.ts` (`realistic-air-jet-does-not-climb`), `shared/modes.test.ts`  
**Files:** `shared/physics.ts`, `shared/simulation.ts`, lobby checkbox

## Mechanic: blat-pulse

**Phase:** D6  
**Tags:** `@mechanic blat-pulse`  
**Description:** Original toy. **E** — radial knockback (r=88) plus a small self-boost along aim. 4.2s cooldown. Does not hit teammates. Bots use it in knife range. FX via `pulseX/Y/At`.  
**Tests:** `shared/match.test.ts`, `shared/modes.test.ts`  
**Files:** `shared/match.ts` (`blatImpulse`), `shared/simulation.ts` (`tryBlat`)

## Mechanic: wind-weather

**Phase:** D5  
**Tags:** `@mechanic wind-weather`  
**Description:** `windVx` shifts ~11s. Airborne bodies drift `windVx * 0.55 * dt`; grenades `* 0.7`. Weather 0 clear / 1 rain / 2 dust (client particles).  
**Tests:** `shared/match.test.ts` (`wind-drifts-airborne-bodies`)  
**Files:** `shared/physics.ts`, `shared/simulation.ts`, `GameScene.drawWeather`

## Mechanic: chat-taunts

**Phase:** D3  
**Tags:** `@mechanic chat-taunts`  
**Description:** **T** focuses chat, Enter sends. F1–F4 taunts. Server sanitizes (strip controls, max 80, keep 10) and rate-limits ~450ms.  
**Tests:** `shared/match.test.ts` (`chat-is-sanitized`)  
**Files:** `shared/match.ts` (`sanitizeChat`), `DmRoom`, `GameScene`

## Mechanic: server-browser

**Phase:** D4  
**Tags:** `@mechanic server-browser`  
**Description:** `GET /api/rooms` lists non-demo rooms (code, mode, realistic, clients). Lobby polls every 4s. Invite codes still work.  
**Files:** `server/index.ts`, `src/lobby.ts`

## Mechanic: minimap

**Phase:** D5  
**Tags:** `@mechanic minimap`  
**Description:** Bottom-right radar: soldiers, flags, hill, infil. Local pip brighter.  
**Files:** `src/game/minimap.ts`

## Mechanic: soldat-bonuses

**Phase:** E1  
**Tags:** `@mechanic soldat-bonuses`  
**Description:** Timed power-ups on Arena pads (12s, respawn ~22s). **Berserk** — walk faster, melee ×2.6. **Predator** — near-invisible to enemies (hidden on minimap). **Flame God** — infinite flamer + flame immunity.  
**Tests:** `shared/bonuses.test.ts`  
**Files:** `shared/bonuses.ts`, `shared/simulation.ts`, `MAP_PICKUPS`

## Mechanic: kill-sprees

**Phase:** E2  
**Tags:** `@mechanic kill-sprees`  
**Description:** Unbroken kill streak. First blood, then 3 Killing Spree / 5 Rampage / 7 Unstoppable / 10 Godlike (chat kind `spree`). Resets on death. Rapid kills within 3.5s also stack **DOUBLE / TRIPLE / QUAD / PENTA / HEXA / UNREAL** (chat kind `medal`). Local player gets a center banner + sting; headshots banner without filling chat. Multiples punch larger.  
**Tests:** `shared/bonuses.test.ts` (`kill-sprees`)  
**Files:** `shared/bonuses.ts` (`spreeLabel`, `multiKillLabel`), `simulation.kill`, `src/game/hud.ts`

## Mechanic: leftover-kit

**Phase:** E3 / E6  
**Tags:** `@mechanic leftover-kit`  
**Description:** USSOCOM, Ruger 77, M4A1, Bow exist in the arsenal. **3** punch (short, shove). They are not map pads — the six power guns are the destinations.  
**Tests:** `shared/bonuses.test.ts` (`leftover-kit`)  
**Files:** `shared/weapons.ts`

## Mechanic: throw-flag

**Phase:** E5  
**Tags:** `@mechanic throw-flag`  
**Description:** **F** tosses a carried CTF flag along aim (~170px). Return timer starts.  
**Tests:** `shared/bonuses.test.ts` (`throw-flag`)  
**Files:** `shared/simulation.ts` (`tossFlag`)

## Mechanic: air-dash

**Phase:** E7  
**Tags:** `@mechanic air-dash`  
**Description:** Original blat lunge. **Shift** — burst along move/facing, costs 16 fuel, 860ms cooldown. Arcade: air+ground. Realistic: ground only. Shared `stepMovement` so prediction matches.  
**Tests:** `shared/bonuses.test.ts` (`air-dash`)  
**Files:** `shared/physics.ts`, `PLAYER.dash*`

## How agents / humans must edit mechanics

1. Read the matching section here before changing tagged code.  
2. Note new trade-offs in this file when behavior changes.  
3. Keep or update related tests (`npm test`).  
4. Prefer shared `shared/*` math over duplicated client/server logic.

Search code for `@mechanic <name>`.
