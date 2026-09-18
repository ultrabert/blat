import { isDemoRoomCode } from './roomCode.js';

export type RoomAccessPhase = 'create' | 'join';

export const WRONG_PASSWORD_MESSAGE = 'Wrong password';

/**
 * Wave F room-access policy:
 * - Creating a non-demo room requires BLAT_PASSWORD when it is set.
 * - Joining an existing room is open (code / invite link, no password).
 * - Demo create/join is always passwordless.
 */
export function roomAccessError(
  phase: RoomAccessPhase,
  options: { code?: string; password?: string },
  expectedPassword: string | undefined,
): string | null {
  if (isDemoRoomCode(options.code || '')) return null;
  if (phase === 'join') return null;
  if (!expectedPassword) return null;
  if (options.password !== expectedPassword) return WRONG_PASSWORD_MESSAGE;
  return null;
}

export function assertRoomAccess(
  phase: RoomAccessPhase,
  options: { code?: string; password?: string },
  expectedPassword: string | undefined,
): void {
  const err = roomAccessError(phase, options, expectedPassword);
  if (err) throw new Error(err);
}
