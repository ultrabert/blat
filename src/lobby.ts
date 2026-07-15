import { Client, type Room } from 'colyseus.js';
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '../shared/roomCode';
import type { GameState } from '../shared/schema';
import { startGame } from './game/startGame';

const COLYSEUS_URL =
  import.meta.env.VITE_COLYSEUS_URL ??
  (import.meta.env.DEV ? 'http://localhost:2567' : window.location.origin);

const NAME_KEY = 'blat-player-name';
const PASSWORD_KEY = 'blat-access-password';

const lobby = document.querySelector<HTMLElement>('#lobby')!;
const gameShell = document.querySelector<HTMLElement>('#game-shell')!;
const nameInput = document.querySelector<HTMLInputElement>('#player-name')!;
const passwordInput = document.querySelector<HTMLInputElement>('#access-password')!;
const codeInput = document.querySelector<HTMLInputElement>('#room-code')!;
const btnCreate = document.querySelector<HTMLButtonElement>('#btn-create')!;
const btnJoin = document.querySelector<HTMLButtonElement>('#btn-join')!;
const btnCopy = document.querySelector<HTMLButtonElement>('#btn-copy')!;
const roomBarCode = document.querySelector<HTMLElement>('#room-bar-code')!;
const errorEl = document.querySelector<HTMLElement>('#lobby-error')!;
const statusEl = document.querySelector<HTMLElement>('#lobby-status')!;

nameInput.value = localStorage.getItem(NAME_KEY) || '';
passwordInput.value = localStorage.getItem(PASSWORD_KEY) || '';

function playerName(): string {
  const name = nameInput.value.trim() || 'Soldier';
  localStorage.setItem(NAME_KEY, name);
  return name.slice(0, 16);
}

function accessPassword(): string {
  const password = passwordInput.value;
  localStorage.setItem(PASSWORD_KEY, password);
  return password;
}

function joinOptions(extra: Record<string, string> = {}): Record<string, string> {
  return {
    name: playerName(),
    password: accessPassword(),
    ...extra,
  };
}

function setBusy(busy: boolean): void {
  btnCreate.disabled = busy;
  btnJoin.disabled = busy;
  nameInput.disabled = busy;
  passwordInput.disabled = busy;
  codeInput.disabled = busy;
}

function showError(message: string): void {
  errorEl.hidden = !message;
  errorEl.textContent = message;
}

function showStatus(message: string): void {
  statusEl.hidden = !message;
  statusEl.textContent = message;
}

function roomUrl(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

function setRoomInUrl(code: string): void {
  const url = roomUrl(code);
  history.replaceState(null, '', url);
}

function formatJoinError(err: unknown, code?: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/wrong password/i.test(raw)) return 'Wrong password';
  if (code && /not found|no rooms/i.test(raw)) return `No open room for code ${code}`;
  return raw || 'Could not join room';
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms),
    ),
  ]);
}

async function createRoom(): Promise<void> {
  showError('');
  setBusy(true);
  showStatus('Creating room…');

  try {
    const client = new Client(COLYSEUS_URL);
    let room: Room<GameState> | null = null;
    let code = '';

    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateRoomCode(4);
      showStatus(attempt === 0 ? 'Creating room…' : `Creating room… (retry ${attempt + 1})`);
      try {
        room = await withTimeout(
          client.create<GameState>('dm', joinOptions({ code })),
          5000,
          'Create',
        );
        break;
      } catch (err) {
        console.warn('[blat] create attempt failed', attempt + 1, err);
        if (/wrong password/i.test(err instanceof Error ? err.message : String(err))) {
          throw err;
        }
        if (attempt === 4) throw err;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    if (!room) throw new Error('Could not create room');
    enterGame(room, code);
  } catch (err) {
    console.error(err);
    showError(formatJoinError(err));
    showStatus('');
  } finally {
    setBusy(false);
  }
}

async function joinRoom(rawCode: string): Promise<void> {
  const code = normalizeRoomCode(rawCode);
  showError('');

  if (!isValidRoomCode(code)) {
    showError('Enter a 4–6 character room code');
    return;
  }

  setBusy(true);
  showStatus(`Joining ${code}…`);

  try {
    const client = new Client(COLYSEUS_URL);
    const room = await withTimeout(
      client.join<GameState>('dm', joinOptions({ code })),
      5000,
      'Join',
    );
    enterGame(room, code);
  } catch (err) {
    console.error(err);
    showError(formatJoinError(err, code));
    showStatus('');
  } finally {
    setBusy(false);
  }
}

function enterGame(room: Room<GameState>, code: string): void {
  setRoomInUrl(code);
  roomBarCode.textContent = `ROOM ${code}`;
  lobby.hidden = true;
  gameShell.hidden = false;
  showStatus('');
  showError('');
  startGame(room, code);
}

btnCopy.addEventListener('click', async () => {
  const code = normalizeRoomCode(roomBarCode.textContent?.replace(/^ROOM\s+/i, '') || '');
  if (!code) return;
  const url = roomUrl(code);
  try {
    await navigator.clipboard.writeText(url);
    btnCopy.textContent = 'Copied!';
    setTimeout(() => {
      btnCopy.textContent = 'Copy link';
    }, 1200);
  } catch {
    window.prompt('Copy this link:', url);
  }
});

btnCreate.addEventListener('click', () => {
  void createRoom();
});

btnJoin.addEventListener('click', () => {
  void joinRoom(codeInput.value);
});

codeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') void joinRoom(codeInput.value);
});

passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const code = normalizeRoomCode(codeInput.value);
    if (code) void joinRoom(code);
    else void createRoom();
  }
});

nameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const code = normalizeRoomCode(codeInput.value);
    if (code) void joinRoom(code);
    else void createRoom();
  }
});

// Deep link: /?room=ABCD
const initialCode = normalizeRoomCode(new URLSearchParams(window.location.search).get('room') || '');
if (initialCode) {
  codeInput.value = initialCode;
  void joinRoom(initialCode);
}
