import { Client, type Room } from 'colyseus.js';
import {
  DEMO_ROOM_CODE,
  generateRoomCode,
  isDemoRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '../shared/roomCode';
import type { GameState } from '../shared/schema';
import { MODE_LABEL, parseMode } from '../shared/match';
import { startGame } from './game/startGame';
import { sound } from './game/audio/SoundBus';

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
const btnDemo = document.querySelector<HTMLButtonElement>('#btn-demo')!;
const btnJoin = document.querySelector<HTMLButtonElement>('#btn-join')!;
const btnCopy = document.querySelector<HTMLButtonElement>('#btn-copy')!;
const modeSelect = document.querySelector<HTMLSelectElement>('#match-mode')!;
const realisticBox = document.querySelector<HTMLInputElement>('#match-realistic')!;
const roomList = document.querySelector<HTMLElement>('#room-list')!;
const roomBarCode = document.querySelector<HTMLElement>('#room-bar-code')!;
const errorEl = document.querySelector<HTMLElement>('#lobby-error')!;
const statusEl = document.querySelector<HTMLElement>('#lobby-status')!;
const soundGate = document.querySelector<HTMLButtonElement>('#sound-gate')!;

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
    mode: parseMode(modeSelect.value),
    realistic: realisticBox.checked ? 'true' : 'false',
    ...extra,
  };
}

function setBusy(busy: boolean): void {
  btnCreate.disabled = busy;
  btnDemo.disabled = busy;
  btnJoin.disabled = busy;
  nameInput.disabled = busy;
  passwordInput.disabled = busy;
  codeInput.disabled = busy;
  modeSelect.disabled = busy;
  realisticBox.disabled = busy;
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
  if (isDemoRoomCode(code)) {
    url.pathname = '/demo';
    return url.toString();
  }
  url.pathname = url.pathname.replace(/\/demo\/?$/, '/') || '/';
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

function syncSoundGate(): void {
  soundGate.hidden = !lobby.hidden || sound.running();
}

sound.bindGestures();
sound.onState(syncSoundGate);
soundGate.addEventListener('click', () => sound.unlock());

function enterGame(room: Room<GameState>, code: string, spectate = false): void {
  sound.unlock();
  if (spectate || isDemoRoomCode(code)) {
    history.replaceState(null, '', '/demo');
  } else {
    setRoomInUrl(code);
  }
  roomBarCode.textContent = spectate || isDemoRoomCode(code) ? 'DEMO' : `ROOM ${code}`;
  lobby.hidden = true;
  gameShell.hidden = false;
  showStatus('');
  showError('');
  syncSoundGate();
  startGame(room, code, { spectate: spectate || isDemoRoomCode(code) });
}

btnCopy.addEventListener('click', async () => {
  sound.unlock();
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
  sound.unlock();
  void createRoom();
});

btnDemo.addEventListener('click', () => {
  sound.unlock();
  void joinDemo();
});

btnJoin.addEventListener('click', () => {
  sound.unlock();
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

async function joinDemo(): Promise<void> {
  showError('');
  setBusy(true);
  lobby.classList.add('lobby-splash');
  showStatus('Connecting to demo…');
  try {
    const client = new Client(COLYSEUS_URL);
    const room = await withTimeout(
      client.joinOrCreate<GameState>('dm', {
        code: DEMO_ROOM_CODE,
        name: 'Watcher',
      }),
      8000,
      'Demo',
    );
    enterGame(room, DEMO_ROOM_CODE, true);
  } catch (err) {
    console.error(err);
    lobby.classList.remove('lobby-splash');
    showError(formatJoinError(err));
    showStatus('');
  } finally {
    setBusy(false);
  }
}

// Deep link: /demo or /?demo=1 or /?room=ABCD
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const params = new URLSearchParams(window.location.search);
if (path === '/demo' || params.has('demo')) {
  void joinDemo();
} else {
  const initialCode = normalizeRoomCode(params.get('room') || '');
  if (initialCode) {
    if (isDemoRoomCode(initialCode)) void joinDemo();
    else {
      codeInput.value = initialCode;
      void joinRoom(initialCode);
    }
  }
}

type ListedRoom = {
  code: string;
  mode: string;
  realistic: boolean;
  clients: number;
  maxClients: number;
};

async function refreshRooms(): Promise<void> {
  if (!lobby.hidden) {
    try {
      const res = await fetch(`${COLYSEUS_URL}/api/rooms`);
      const data = (await res.json()) as { rooms?: ListedRoom[] };
      const rooms = (data.rooms || []).filter((r) => r.code && r.code !== 'DEMO');
      if (!rooms.length) {
        roomList.textContent = 'No public rooms — create one.';
      } else {
        roomList.replaceChildren();
        for (const r of rooms) {
          const row = document.createElement('div');
          row.className = 'room-row';
          const label = document.createElement('span');
          label.textContent = `${r.code} · ${MODE_LABEL[parseMode(r.mode)]}${r.realistic ? ' · real' : ''} · ${r.clients}/${r.maxClients}`;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Join';
          btn.addEventListener('click', () => void joinRoom(r.code));
          row.append(label, btn);
          roomList.append(row);
        }
      }
    } catch {
      roomList.textContent = 'Could not list rooms.';
    }
  }
  window.setTimeout(() => void refreshRooms(), 4000);
}

void refreshRooms();
