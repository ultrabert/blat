import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { matchMaker, Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DmRoom } from './rooms/DmRoom.js';
import { loadLocalEnv } from './loadEnv.js';

loadLocalEnv();

const PORT = Number(process.env.PORT || 2567);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const serveClient = existsSync(path.join(distDir, 'index.html'));

const app = express();
app.use(cors());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'blat',
    rooms: ['dm'],
    passwordRequired: Boolean(process.env.BLAT_PASSWORD),
  });
});

app.get('/api/rooms', async (_req, res) => {
  try {
    const listed = await matchMaker.query({});
    res.json({
      rooms: listed
        .filter((r) => !r.metadata?.demo)
        .map((r) => ({
          roomId: r.roomId,
          code: String(r.metadata?.code || ''),
          mode: String(r.metadata?.mode || 'dm'),
          realistic: !!r.metadata?.realistic,
          map: String(r.metadata?.map || 'Arena'),
          clients: r.clients,
          maxClients: r.maxClients,
        })),
    });
  } catch (err) {
    res.status(500).json({ rooms: [], error: String(err) });
  }
});

if (serveClient) {
  app.use(express.static(distDir));
  app.get(/^(?!\/(?:matchmake|api)\b).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      ok: true,
      name: 'blat',
      rooms: ['dm'],
      passwordRequired: Boolean(process.env.BLAT_PASSWORD),
      hint: 'Client not built yet. Run npm run build or npm run dev.',
    });
  });
}

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('dm', DmRoom).filterBy(['code']);

httpServer.listen(PORT, () => {
  console.log(`[blat] listening on http://localhost:${PORT}`);
  if (process.env.BLAT_PASSWORD) {
    console.log('[blat] access password is enabled');
  } else {
    console.log('[blat] BLAT_PASSWORD unset — rooms are open');
  }
  if (serveClient) {
    console.log(`[blat] serving client from ${distDir}`);
  }
  void matchMaker.onReady
    .then(() => matchMaker.createRoom('dm', { code: 'DEMO' }))
    .then((room: { roomId: string }) => console.log(`[blat] demo room ready ${room.roomId}`))
    .catch((err: unknown) => console.warn('[blat] demo room warmup failed', err));
});
