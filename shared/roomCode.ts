/** Unambiguous alphabet (no 0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 4): string {
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
  return /^[A-Z0-9]{4,6}$/.test(code);
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
