/**
 * @mechanic arcade-physics-core
 * @mechanic crouch-cover
 * @mechanic limited-jetpack
 * @mechanic advanced-movement
 * @mechanic realistic-mode
 * @mechanic wind-weather
 * @tradeoff momentum-vs-control (overspeed coasts; air steer is soft)
 * @tradeoff cannonball-vs-accuracy (dive converts fall→speed, wide spread)
 */
import {
  COVERS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  PLAYER,
  PLATFORMS,
  RAMPS,
  TICK_MS,
  playerHalfExtents,
} from './constants.js';
import { recoverRecoil } from './accuracy.js';

export type MoveBody = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuel: number;
  facing: number;
  aimX: number;
  aimY: number;
  jetting: boolean;
  alive: boolean;
  onGround: boolean;
  crouching: boolean;
  rollMs: number;
  rollCdMs: number;
  /** Locked horizontal direction for the active roll (-1/1). */
  rollDir: number;
  /** Previous tick crouch hold — edge-detect rolls / cannonball. */
  holdCrouch: boolean;
  /** Previous tick jet hold — edge-detect backflip. */
  holdJet: boolean;
  /** Upward aim kick (radians), decays over time. */
  recoil: number;
  /** Bunny-hop grace after landing (ms). */
  landGraceMs: number;
  /** Air dive converting fall into horizontal speed. */
  cannonballMs: number;
  /** Brief flip window for visuals / locked facing. */
  backflipMs: number;
  prone: boolean;
  proneHoldMs: number;
  /** Wave D — Soldat realistic: jump only, no air jet. */
  realistic?: boolean;
  /** Horizontal wind (px/s) applied while airborne. */
  windVx?: number;
};

export type MoveInput = {
  move: number;
  jet: boolean;
  crouch: boolean;
  aimX: number;
  aimY: number;
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function len(x: number, y: number): number {
  return Math.hypot(x, y) || 1;
}

function snapFeetToGround(body: MoveBody): void {
  const { halfW, halfH } = playerHalfExtents(body.crouching, body.prone);
  const searchH = playerHalfExtents(false, false).halfH;
  let bestTop: number | null = null;
  for (const plat of PLATFORMS) {
    const left = plat.x - plat.w / 2;
    const right = plat.x + plat.w / 2;
    const top = plat.y - plat.h / 2;
    if (body.x + halfW <= left || body.x - halfW >= right) continue;
    const feet = body.y + searchH;
    if (feet >= top - 6 && feet <= top + 24) {
      if (bestTop === null || top < bestTop) bestTop = top;
    }
  }
  if (bestTop !== null) {
    body.y = bestTop - halfH;
    body.vy = 0;
    body.onGround = true;
  }
}

function applyHorizontal(
  body: MoveBody,
  input: MoveInput,
  dt: number,
  grounded: boolean,
): void {
  if (body.rollMs > 0 || body.cannonballMs > 0 || body.backflipMs > 0) return;

  if (grounded) {
    const wishSpeed = body.prone
      ? PLAYER.proneSpeed
      : body.crouching
        ? PLAYER.crouchSpeed
        : PLAYER.speed;
    if (input.move !== 0) {
      const wish = input.move * wishSpeed;
      const reversing = body.vx !== 0 && Math.sign(body.vx) !== input.move;
      if (Math.sign(body.vx) === input.move && Math.abs(body.vx) > wishSpeed + 10) {
        const decay = PLAYER.overspeedDecayGround * dt;
        if (Math.abs(body.vx) <= decay) body.vx = wish;
        else body.vx -= Math.sign(body.vx) * decay;
      } else {
        const a = reversing ? PLAYER.groundBrake : PLAYER.groundAccel;
        body.vx += input.move * a * dt;
        if (!reversing && Math.abs(body.vx) > wishSpeed && Math.sign(body.vx) === input.move) {
          body.vx = wish;
        }
      }
      body.facing = input.move > 0 ? 1 : -1;
    } else {
      const drag = PLAYER.dragX * dt * (body.crouching ? 1.4 : 1);
      if (Math.abs(body.vx) <= drag) body.vx = 0;
      else body.vx -= Math.sign(body.vx) * drag;
    }
    return;
  }

  // Air: soft steer, preserve momentum
  if (input.move !== 0) {
    body.vx += input.move * PLAYER.airAccel * dt;
    body.facing = input.move > 0 ? 1 : -1;
  } else {
    const decay = PLAYER.overspeedDecayAir * dt;
    if (Math.abs(body.vx) <= decay) body.vx = 0;
    else body.vx -= Math.sign(body.vx) * decay;
  }
}

/**
 * Pure movement + platform/cover collision for one fixed timestep (seconds).
 * @mechanic advanced-movement
 */
export function stepMovement(body: MoveBody, input: MoveInput, dt: number): void {
  if (!body.alive) {
    body.vy += GRAVITY * dt;
    body.y += body.vy * dt;
    body.x += body.vx * dt;
    body.jetting = false;
    body.crouching = false;
    body.rollMs = 0;
    body.rollDir = 0;
    body.holdCrouch = false;
    body.holdJet = false;
    body.recoil = 0;
    body.landGraceMs = 0;
    body.cannonballMs = 0;
    body.backflipMs = 0;
    body.prone = false;
    body.proneHoldMs = 0;
    return;
  }

  body.recoil = recoverRecoil(body.recoil, dt, body.crouching);

  const aimLen = len(input.aimX, input.aimY);
  body.aimX = input.aimX / aimLen;
  body.aimY = input.aimY / aimLen;

  if (body.rollCdMs > 0) body.rollCdMs = Math.max(0, body.rollCdMs - dt * 1000);
  if (body.backflipMs > 0) body.backflipMs = Math.max(0, body.backflipMs - dt * 1000);
  if (body.cannonballMs > 0) {
    body.cannonballMs = Math.max(0, body.cannonballMs - dt * 1000);
    body.crouching = true;
  }

  const wasGrounded = body.onGround;
  const wantCrouch = input.crouch && body.onGround && !input.jet;
  const crouchEdge = input.crouch && !body.holdCrouch;
  const jetEdge = input.jet && !body.holdJet;
  body.holdCrouch = input.crouch;
  body.holdJet = input.jet;

  const prevCrouch = body.crouching;
  const prevProne = body.prone;
  const wasRolling = body.rollMs > 0;

  // --- Cannonball: tap crouch while falling fast ---
  if (
    !body.onGround &&
    crouchEdge &&
    body.vy >= PLAYER.cannonballMinVy &&
    body.cannonballMs <= 0 &&
    body.rollMs <= 0 &&
    body.backflipMs <= 0
  ) {
    const dir = input.move !== 0 ? (input.move > 0 ? 1 : -1) : body.facing || 1;
    const boost = Math.max(PLAYER.cannonballMinBoost, body.vy * PLAYER.cannonballConvert);
    body.vx = dir * boost + body.vx * 0.12;
    body.vy *= 0.18;
    body.cannonballMs = PLAYER.cannonballDurationMs;
    body.crouching = true;
    body.facing = dir;
    body.rollMs = 0;
    body.rollDir = 0;
  }

  // --- Ground roll (existing) ---
  if (body.rollMs > 0) {
    body.rollMs = Math.max(0, body.rollMs - dt * 1000);
    body.crouching = true;
    const dir = body.rollDir || body.facing || 1;
    body.facing = dir;
    body.vx = dir * PLAYER.rollSpeed;
    body.vy = Math.min(body.vy, 0);
    if (body.rollMs <= 0) {
      body.rollCdMs = PLAYER.rollCooldownMs;
      body.rollDir = 0;
      body.crouching = wantCrouch;
      if (wantCrouch && input.move !== 0) {
        // Keep a chunk of roll speed so prone-cancel into crouch-walk isn't a hard stop
        const keep = Math.min(Math.abs(body.vx), PLAYER.rollSpeed * 0.55);
        body.vx = (input.move > 0 ? 1 : -1) * Math.max(PLAYER.crouchSpeed, keep);
      } else if (wantCrouch) {
        body.vx *= 0.35;
      } else {
        // Stand cancel — preserve lateral for chaining into a hop
        body.vx *= 0.75;
      }
    }
  } else if (
    crouchEdge &&
    input.move !== 0 &&
    body.onGround &&
    body.rollCdMs <= 0 &&
    body.cannonballMs <= 0
  ) {
    body.rollMs = PLAYER.rollDurationMs;
    body.rollDir = input.move > 0 ? 1 : -1;
    body.facing = body.rollDir;
    body.vx = body.rollDir * PLAYER.rollSpeed;
    body.crouching = true;
  } else if (body.cannonballMs <= 0 && body.backflipMs <= 0) {
    body.crouching = wantCrouch || (!body.onGround && input.crouch);
    if (!body.crouching) body.rollDir = 0;
  }

  if (!input.crouch || !body.onGround || body.rollMs > 0 || body.cannonballMs > 0) {
    if (!input.crouch || !body.onGround) {
      body.prone = false;
      body.proneHoldMs = 0;
    }
  } else if (Math.abs(input.move) < 0.5) {
    body.proneHoldMs += dt * 1000;
    if (body.proneHoldMs >= PLAYER.proneHoldMs) body.prone = true;
  } else if (!body.prone) {
    body.proneHoldMs = 0;
  }
  if (body.prone) body.crouching = true;

  // Aim facing when not locked in a move
  if (
    body.rollMs <= 0 &&
    body.cannonballMs <= 0 &&
    body.backflipMs <= 0 &&
    body.aimX !== 0
  ) {
    body.facing = body.aimX >= 0 ? 1 : -1;
  }

  if (body.onGround && (prevCrouch !== body.crouching || prevProne !== body.prone)) {
    snapFeetToGround(body);
  }

  applyHorizontal(body, input, dt, body.onGround);

  const canJet = !body.realistic;
  body.jetting = false;
  if (input.jet && body.onGround && body.vy >= -10) {
    // Kick jump + bunny hop
    if (input.move !== 0) {
      body.vx += input.move * PLAYER.kickJumpBoost;
    }
    if (
      body.landGraceMs > 0 &&
      Math.abs(body.vx) >= PLAYER.bunnyMinSpeed
    ) {
      body.vx = clamp(
        body.vx * PLAYER.bunnyBoost,
        -PLAYER.bunnyBoostCap,
        PLAYER.bunnyBoostCap,
      );
    }
    body.vy = PLAYER.jumpVelocity;
    body.onGround = false;
    body.crouching = false;
    body.rollMs = 0;
    body.rollDir = 0;
    body.cannonballMs = 0;
    body.landGraceMs = 0;
    body.prone = false;
    body.proneHoldMs = 0;
  } else if (
    canJet &&
    jetEdge &&
    !body.onGround &&
    input.crouch &&
    body.fuel >= PLAYER.backflipFuelCost &&
    body.backflipMs <= 0 &&
    body.rollMs <= 0
  ) {
    // Backflip: air crouch + jet tap — reverse facing, convert to climb
    const dir = input.move !== 0 ? (input.move > 0 ? 1 : -1) : -(body.facing || 1);
    body.facing = dir;
    body.vx = dir * PLAYER.backflipVx + body.vx * -0.2;
    body.vy = PLAYER.backflipVy;
    body.fuel = Math.max(0, body.fuel - PLAYER.backflipFuelCost);
    body.backflipMs = PLAYER.backflipDurationMs;
    body.cannonballMs = 0;
    body.crouching = false;
    body.jetting = true;
  } else if (canJet && input.jet && body.fuel > 0) {
    // @mechanic limited-jetpack — thrust beats gravity; hold climbs, feather hovers
    body.vy += PLAYER.jetAcceleration * dt;
    if (body.vy < -PLAYER.jetMaxAscent) body.vy = -PLAYER.jetMaxAscent;
    body.fuel = Math.max(0, body.fuel - PLAYER.fuelBurnRate * dt);
    body.jetting = true;
    body.crouching = false;
    body.rollMs = 0;
    body.rollDir = 0;
    if (body.cannonballMs > 0) body.cannonballMs = 0;
    if (input.move !== 0 && body.backflipMs <= 0) {
      body.vx += input.move * PLAYER.jetStrafeAccel * dt;
    }
  } else {
    const regen = body.onGround
      ? PLAYER.fuelRegenRate
      : PLAYER.fuelRegenRate * PLAYER.fuelRegenAirMult;
    body.fuel = Math.min(PLAYER.maxFuel, body.fuel + regen * dt);
  }

  body.vy += GRAVITY * dt;
  if (!body.onGround && body.windVx) {
    body.vx += body.windVx * 0.55 * dt;
  }
  body.vx = clamp(body.vx, -PLAYER.maxVelocityX, PLAYER.maxVelocityX);
  body.vy = clamp(body.vy, -PLAYER.maxVelocityY, PLAYER.maxVelocityY);

  body.x += body.vx * dt;
  body.y += body.vy * dt;
  collideBody(body);

  if (body.onGround) {
    if (!wasGrounded) body.landGraceMs = PLAYER.bunnyWindowMs;
    else body.landGraceMs = Math.max(0, body.landGraceMs - dt * 1000);
    // Landing ends dive / flip
    body.cannonballMs = 0;
    if (body.backflipMs > 0 && body.vy >= 0) body.backflipMs = 0;
  }

  if (wasRolling && body.rollMs <= 0 && body.onGround) {
    snapFeetToGround(body);
  }
}

function collideBody(body: MoveBody): void {
  const { halfW, halfH } = playerHalfExtents(body.crouching, body.prone);
  const wasGrounded = body.onGround;
  body.onGround = false;
  body.x = clamp(body.x, halfW, GAME_WIDTH - halfW);

  const snapDepth = body.crouching || body.rollMs > 0 || body.cannonballMs > 0 ? 28 : 18;

  for (const plat of PLATFORMS) {
    const left = plat.x - plat.w / 2;
    const right = plat.x + plat.w / 2;
    const top = plat.y - plat.h / 2;
    const bottom = plat.y + plat.h / 2;

    const playerLeft = body.x - halfW;
    const playerRight = body.x + halfW;
    const playerTop = body.y - halfH;
    const playerBottom = body.y + halfH;

    if (
      playerRight <= left ||
      playerLeft >= right ||
      playerBottom <= top ||
      playerTop >= bottom
    ) {
      continue;
    }

    const overlapTop = playerBottom - top;
    const overlapBottom = bottom - playerTop;
    const travel = Math.abs(body.vy) / 28;
    const slop = snapDepth + travel + 4;

    // Soldat ceiling slide: jetting up into a slab underside, then strafe along it.
    if (
      body.vy < 0 &&
      (body.jetting || body.backflipMs > 0) &&
      overlapBottom > 0 &&
      overlapBottom <= slop &&
      overlapBottom < overlapTop
    ) {
      body.y = bottom + halfH;
      body.vy = 0;
      continue;
    }

    const canLand =
      body.rollMs > 0 || body.cannonballMs > 0 || wasGrounded || body.vy >= -40;
    if (canLand && overlapTop > 0 && overlapTop <= slop) {
      body.y = top - halfH;
      body.vy = 0;
      body.onGround = true;
    }
  }

  collideRamps(body);

  // Map sky — hang and strafe under the world ceiling
  const sky = halfH + 8;
  if (body.y < sky) {
    body.y = sky;
    if (body.vy < 0) body.vy = 0;
  }

  for (const cover of COVERS) {
    const vxBefore = body.vx;
    resolveSolid(body, halfW, halfH, cover.x, cover.y, cover.w, cover.h);
    if (
      (body.rollMs > 0 || body.cannonballMs > 0) &&
      body.vx === 0 &&
      Math.abs(vxBefore) > 50
    ) {
      body.vx = vxBefore * 0.5;
    }
  }
}

function resolveSolid(
  body: MoveBody,
  halfW: number,
  halfH: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
): void {
  const left = cx - w / 2;
  const right = cx + w / 2;
  const top = cy - h / 2;
  const bottom = cy + h / 2;

  const playerLeft = body.x - halfW;
  const playerRight = body.x + halfW;
  const playerTop = body.y - halfH;
  const playerBottom = body.y + halfH;

  if (
    playerRight <= left ||
    playerLeft >= right ||
    playerBottom <= top ||
    playerTop >= bottom
  ) {
    return;
  }

  const overlapLeft = playerRight - left;
  const overlapRight = right - playerLeft;
  const overlapTop = playerBottom - top;
  const overlapBottom = bottom - playerTop;
  const minX = Math.min(overlapLeft, overlapRight);
  const minY = Math.min(overlapTop, overlapBottom);

  if (minX < minY) {
    if (overlapLeft < overlapRight) body.x = left - halfW;
    else body.x = right + halfW;
    body.vx = 0;
  } else if (overlapTop < overlapBottom) {
    body.y = top - halfH;
    body.vy = 0;
    body.onGround = true;
  } else {
    body.y = bottom + halfH;
    body.vy = Math.max(0, body.vy);
  }
}

function collideRamps(body: MoveBody): void {
  const { halfH } = playerHalfExtents(body.crouching, body.prone);
  const feetX = body.x;
  const feetY = body.y + halfH;
  const dt = TICK_MS / 1000;
  for (const r of RAMPS) {
    const span = r.bx - r.ax || 1;
    const t = (feetX - r.ax) / span;
    if (t < -0.02 || t > 1.02) continue;
    const surfaceY = r.ay + t * (r.by - r.ay);
    const pen = feetY - surfaceY;
    if (pen > -10 && pen < 24 && body.vy >= -90) {
      body.y = surfaceY - halfH;
      body.vy = 0;
      body.onGround = true;
      const slope = (r.by - r.ay) / span;
      body.vx += GRAVITY * slope * dt * 0.85;
    }
  }
}

export type Blocker = {
  x: number;
  y: number;
  halfW: number;
  halfH: number;
  vx: number;
};

/** Push `body` out of other soldiers (prediction vs remotes, or half of a pair). */
export function separateFromSolids(body: MoveBody, blockers: Blocker[]): void {
  if (!body.alive) return;
  const { halfW, halfH } = playerHalfExtents(body.crouching, body.prone);
  for (const o of blockers) {
    const dx = body.x - o.x;
    const dy = body.y - o.y;
    const overlapX = halfW + o.halfW - Math.abs(dx);
    const overlapY = halfH + o.halfH - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) continue;
    if (dy < 0 && overlapY <= overlapX + 8 && body.vy >= -40) {
      body.y = o.y - o.halfH - halfH;
      body.vy = 0;
      body.onGround = true;
      body.vx += o.vx * 0.12;
      continue;
    }
    if (overlapX < overlapY) {
      const dir = dx >= 0 ? 1 : -1;
      body.x += overlapX * dir;
      body.vx += dir * 40;
    } else {
      const dir = dy >= 0 ? 1 : -1;
      body.y += overlapY * dir;
      if (dir > 0) body.vy = Math.max(body.vy, 0);
      else body.vy = Math.min(body.vy, 0);
    }
  }
}

export function copyMoveBody(from: MoveBody): MoveBody {
  return { ...from };
}

export function fellOutOfWorld(body: MoveBody): boolean {
  return body.y > GAME_HEIGHT + 40;
}
