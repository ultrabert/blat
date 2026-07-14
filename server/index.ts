import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DmRoom } from './rooms/DmRoom.js';

const PORT = Number(process.env.PORT || 2567);

const app = express();
app.use(cors());
app.get('/', (_req, res) => {
  res.json({ ok: true, name: 'blat', rooms: ['dm'] });
});

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('dm', DmRoom);

httpServer.listen(PORT, () => {
  console.log(`[blat] Colyseus listening on http://localhost:${PORT}`);
});
