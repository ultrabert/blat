/** Unambiguous alphabet (no 0/O, 1/I/L). URL-safe and readable. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Public match codes are this long so random guessing of open rooms is harder. */
export const ROOM_CODE_LENGTH = 6;

const ALPHABET = ROOM_CODE_ALPHABET;

export function generateRoomCode(length = ROOM_CODE_LENGTH): string {
  let code = '';
  const bytes = cryptoGetRandom(length);
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  if (code === 'DEMO') return generateRoomCode(length);
  return code;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Reserved spectator room — skip password, bots fight each other. */
export const DEMO_ROOM_CODE = 'DEMO';

export function isDemoRoomCode(code: string): boolean {
  return normalizeRoomCode(code) === DEMO_ROOM_CODE;
}

function cryptoGetRandom(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}
