/**
 * @mechanic arcade-physics-core
 * @mechanic crouch-cover
 * @mechanic limited-jetpack
 * @mechanic advanced-movement
 * @mechanic realistic-mode
 * @mechanic wind-weather
 * @mechanic air-dash
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
  playerHalfExtents,
} from './constants.js';
import { BONUS } from './bonuses.js';
import { recoverRecoil } from './accuracy.js';
import { surfaceIsCeiling, terrainBandsAt } from './terrain.js';

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
  /** Wave E — berserker bonus speed. */
  berserk?: boolean;
  dashCdMs?: number;
  dashMs?: number;
};

export type MoveInput = {
  move: number;
  jet: boolean;
  crouch: boolean;
  aimX: number;
  aimY: number;
  dash?: boolean;
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
  for (const r of RAMPS) {
    const lo = Math.min(r.ax, r.bx);
    const hi = Math.max(r.ax, r.bx);
    if (body.x < lo || body.x > hi) continue;
    const span = r.bx - r.ax || 1;
    const top = r.ay + ((body.x - r.ax) / span) * (r.by - r.ay);
    if (surfaceIsCeiling(body.x, top)) continue;
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
    const wishSpeed =
      (body.prone
        ? PLAYER.proneSpeed
        : body.crouching
          ? PLAYER.crouchSpeed
          : PLAYER.speed) * (body.berserk ? BONUS.berserkSpeed : 1);
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
      const slope = Math.abs(rampSlopeAt(body.x, body.y + playerHalfExtents(body.crouching, body.prone).halfH));
      const dragRate = slope > 0.12 ? PLAYER.slopeDrag : PLAYER.dragX;
      const drag = dragRate * dt * (body.crouching ? 1.4 : 1);
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
  if ((body.dashCdMs ?? 0) > 0) body.dashCdMs = Math.max(0, (body.dashCdMs ?? 0) - dt * 1000);
  if ((body.dashMs ?? 0) > 0) body.dashMs = Math.max(0, (body.dashMs ?? 0) - dt * 1000);
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

  /** @mechanic air-dash */
  const canDash = !body.realistic || body.onGround;
  if (
    input.dash &&
    canDash &&
    (body.dashCdMs ?? 0) <= 0 &&
    body.fuel >= PLAYER.dashFuel &&
    body.rollMs <= 0 &&
    body.cannonballMs <= 0
  ) {
    const dirX = input.move !== 0 ? input.move : body.aimX >= 0 ? 1 : -1;
    body.vx = dirX * PLAYER.dashSpeed + body.vx * 0.15;
    if (!body.onGround) body.vy = body.aimY * PLAYER.dashSpeed * 0.5 + body.vy * 0.2;
    else body.vy = Math.min(body.vy, -80);
    body.fuel = Math.max(0, body.fuel - PLAYER.dashFuel);
    body.dashCdMs = PLAYER.dashCooldownMs;
    body.dashMs = PLAYER.dashDurationMs;
    body.crouching = false;
    body.prone = false;
  }

  body.vy += GRAVITY * dt;
  if (!body.onGround && body.windVx) {
    body.vx += body.windVx * 0.55 * dt;
  }
  body.vx = clamp(body.vx, -PLAYER.maxVelocityX, PLAYER.maxVelocityX);
  body.vy = clamp(body.vy, -PLAYER.maxVelocityY, PLAYER.maxVelocityY);

  body.x += body.vx * dt;
  body.y += body.vy * dt;
  collideBody(body, dt);

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

function collideBody(body: MoveBody, dt: number): void {
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

  collideTerrain(body, wasGrounded, dt);
  collideRamps(body, wasGrounded, dt);
  applySlopeSlide(body, dt);

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

function collideTerrain(body: MoveBody, wasGrounded: boolean, dt: number): void {
  const { halfW, halfH } = playerHalfExtents(body.crouching, body.prone);
  const feetY = body.y + halfH;
  const headY = body.y - halfH;
  const rising = body.vy < -12;
  const climbing = body.jetting && rising;
  for (const band of terrainBandsAt(body.x)) {
    const overlap = feetY > band.top + 2 && headY < band.bottom - 2;
    if (!overlap) {
      const prevFeet = feetY - body.vy * dt;
      const crossedTop =
        prevFeet <= band.top + 2 && feetY >= band.top - 4 && body.vy >= -8;
      const followDown =
        wasGrounded && !climbing && feetY <= band.top && band.top - feetY < 18;
      if ((crossedTop || followDown) && !climbing) {
        seatOnY(body, band.top, halfH);
      }
      const prevHead = headY - body.vy * dt;
      const crossedBot =
        rising && prevHead >= band.bottom - 2 && headY <= band.bottom + 4;
      if (crossedBot) {
        body.y = band.bottom + halfH;
        if (body.vy < 0) body.vy = 0;
      }
      continue;
    }
    const distTop = feetY - band.top;
    const distBot = band.bottom - headY;
    const distLeft = body.x - band.left;
    const distRight = band.right - body.x;
    const distX = Math.min(distLeft, distRight);
    if (distX < distTop && distX < distBot && distX < 28) {
      if (distLeft < distRight) body.x = band.left - halfW;
      else body.x = band.right + halfW;
      body.vx = 0;
      continue;
    }
    // Cave roof only when rising into it. Falling / walking ejects to the hill top
    // so the pit edge cannot dump you through the wedge into the cave.
    if (rising && distBot <= distTop) {
      body.y = band.bottom + halfH;
      if (body.vy < 0) body.vy = 0;
      continue;
    }
    if (climbing && distTop < 22) continue;
    seatOnY(body, band.top, halfH);
  }
}

function seatOnY(body: MoveBody, surfaceY: number, halfH: number): void {
  body.y = surfaceY - halfH;
  body.vy = 0;
  body.onGround = true;
}

/** Downhill slope under the feet (dy/dx). 0 on flats / air. */
export function rampSlopeAt(x: number, feetY: number): number {
  let best = 0;
  let bestDist = 14;
  for (const r of RAMPS) {
    const lo = Math.min(r.ax, r.bx);
    const hi = Math.max(r.ax, r.bx);
    if (x < lo || x > hi) continue;
    const span = r.bx - r.ax || 1;
    const surfaceY = r.ay + ((x - r.ax) / span) * (r.by - r.ay);
    if (surfaceIsCeiling(x, surfaceY)) continue;
    const dist = Math.abs(surfaceY - feetY);
    if (dist < bestDist) {
      bestDist = dist;
      best = (r.by - r.ay) / span;
    }
  }
  return best;
}

function applySlopeSlide(body: MoveBody, dt: number): void {
  if (!body.onGround || body.jetting || body.rollMs > 0 || body.cannonballMs > 0) return;
  const { halfH } = playerHalfExtents(body.crouching, body.prone);
  const slope = rampSlopeAt(body.x, body.y + halfH);
  if (Math.abs(slope) < 0.12) return;
  body.vx += GRAVITY * slope * PLAYER.slopeSlide * dt;
}

function collideRamps(body: MoveBody, wasGrounded: boolean, dt: number): void {
  const { halfH } = playerHalfExtents(body.crouching, body.prone);
  const feetX = body.x;
  const feetY = body.y + halfH;
  const prevFeet = feetY - body.vy * dt;
  const climbing = body.jetting && body.vy < -8;
  const travel = Math.abs(body.vy) * dt + Math.abs(body.vx) * dt * 0.6;
  const slop = (wasGrounded ? 22 : 10) + travel;

  let bestY = 0;
  let bestPen = Infinity;
  let found = false;
  for (const r of RAMPS) {
    const span = r.bx - r.ax || 1;
    const t = (feetX - r.ax) / span;
    if (t < 0 || t > 1) continue;
    const surfaceY = r.ay + t * (r.by - r.ay);
    if (surfaceIsCeiling(feetX, surfaceY)) continue;
    const pen = feetY - surfaceY;
    const crossed = prevFeet <= surfaceY + 2 && feetY >= surfaceY - 4;
    const near = pen > -(wasGrounded ? 18 : 6) && pen < slop;
    if (climbing && pen < slop) continue;
    const canLand = wasGrounded || body.vy >= 0 || body.rollMs > 0 || body.cannonballMs > 0;
    if (!crossed && !(near && canLand)) continue;
    if (Math.abs(pen) < bestPen || crossed) {
      bestPen = Math.abs(pen);
      bestY = surfaceY;
      found = true;
    }
  }
  if (!found) return;
  body.y = bestY - halfH;
  body.vy = 0;
  body.onGround = true;
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
