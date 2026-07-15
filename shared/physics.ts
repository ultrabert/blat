import {
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  PLAYER,
  PLATFORMS,
} from './constants.js';

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
};

export type MoveInput = {
  move: number;
  jet: boolean;
  aimX: number;
  aimY: number;
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function len(x: number, y: number): number {
  return Math.hypot(x, y) || 1;
}

/** Pure movement + platform collision for one fixed timestep (seconds). */
export function stepMovement(body: MoveBody, input: MoveInput, dt: number): void {
  if (!body.alive) {
    body.vy += GRAVITY * dt;
    body.y += body.vy * dt;
    body.x += body.vx * dt;
    body.jetting = false;
    return;
  }

  const aimLen = len(input.aimX, input.aimY);
  body.aimX = input.aimX / aimLen;
  body.aimY = input.aimY / aimLen;
  if (body.aimX !== 0) body.facing = body.aimX >= 0 ? 1 : -1;

  if (input.move !== 0) {
    body.vx = input.move * PLAYER.speed;
    body.facing = input.move > 0 ? 1 : -1;
  } else {
    const drag = PLAYER.dragX * dt;
    if (Math.abs(body.vx) <= drag) body.vx = 0;
    else body.vx -= Math.sign(body.vx) * drag;
  }

  body.jetting = false;
  if (input.jet && body.onGround && body.vy >= -10) {
    body.vy = PLAYER.jumpVelocity;
    body.onGround = false;
  } else if (input.jet && body.fuel > 0) {
    body.vy += PLAYER.jetAcceleration * dt;
    body.fuel = Math.max(0, body.fuel - PLAYER.fuelBurnRate * dt);
    body.jetting = true;
  } else {
    body.fuel = Math.min(PLAYER.maxFuel, body.fuel + PLAYER.fuelRegenRate * dt);
  }

  body.vy += GRAVITY * dt;
  body.vx = clamp(body.vx, -PLAYER.maxVelocityX, PLAYER.maxVelocityX);
  body.vy = clamp(body.vy, -PLAYER.maxVelocityY, PLAYER.maxVelocityY);

  body.x += body.vx * dt;
  body.y += body.vy * dt;
  collideBody(body);
}

function collideBody(body: MoveBody): void {
  const halfW = (PLAYER.width - 4) / 2;
  const halfH = (PLAYER.height - 2) / 2;
  body.onGround = false;
  body.x = clamp(body.x, halfW, GAME_WIDTH - halfW);

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
    if (body.vy >= 0 && overlapTop > 0 && overlapTop <= 18 + Math.abs(body.vy) * 0.05) {
      body.y = top - halfH;
      body.vy = 0;
      body.onGround = true;
    }
  }
}

export function copyMoveBody(from: MoveBody): MoveBody {
  return { ...from };
}

export function fellOutOfWorld(body: MoveBody): boolean {
  return body.y > GAME_HEIGHT + 40;
}
