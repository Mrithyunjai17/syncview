import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { customAlphabet } from 'nanoid';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === 'production';

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const livekitConfigured = Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);

if (!livekitConfigured) {
  console.warn('LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET (see server/.env.example).');
}

// RoomServiceClient talks HTTP(S); the client SDK uses the ws(s) form of the same URL.
const roomService = livekitConfigured
  ? new RoomServiceClient(LIVEKIT_URL.replace(/^ws/, 'http'), LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
  : null;

/** Room codes avoid look-alike characters so they are easy to read out loud. */
const newRoomId = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 8);
const newIdentitySuffix = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 6);
const ROOM_ID_PATTERN = /^[a-z0-9]{8}$/;

const ROOM = {
  /** Seconds a room stays open if nobody joins it. */
  emptyTimeout: 10 * 60,
  /** Seconds a room survives after the last person leaves, so a refresh can rejoin. */
  departureTimeout: 2 * 60,
  maxParticipants: 12,
};

// ---------------------------------------------------------------------------
// Small per-IP rate limiter (in memory; good enough for a single instance).
// ---------------------------------------------------------------------------
function createLimiter({ windowMs, max }) {
  const buckets = new Map();
  setInterval(() => {
    const now = Date.now();
    buckets.forEach((bucket, key) => {
      if (bucket.resetAt <= now) buckets.delete(key);
    });
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes.' });
    }
    bucket.count += 1;
    return next();
  };
}

const createRoomLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: 20 });
const tokenLimiter = createLimiter({ windowMs: 60 * 1000, max: 60 });

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
// Behind Render's proxy, req.ip must come from X-Forwarded-For for per-client limits.
if (isProd) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',').map((v) => v.trim()) || (isProd ? false : true) }));
app.use(express.json({ limit: '4kb' }));

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function parseTitle(metadata) {
  try {
    return JSON.parse(metadata || '{}').title || 'Watch party';
  } catch {
    return 'Watch party';
  }
}

async function findRoom(roomId) {
  if (!ROOM_ID_PATTERN.test(roomId)) return null;
  const [room] = await roomService.listRooms([roomId]);
  return room || null;
}

/** A join token scoped to one room. Viewers can talk and share, but never publish a camera. */
function createJoinToken(roomId, name) {
  // A fresh identity per join: a refresh never collides with the old, still-closing session.
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 16) || 'guest'}-${newIdentitySuffix()}`,
    name,
    ttl: '6h',
  });
  token.addGrant({
    room: roomId,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
    canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
  });
  return token.toJwt();
}

function requireLivekit(_req, res, next) {
  if (!roomService) {
    return res.status(503).json({
      error: 'The server is missing its LiveKit settings. Add them to server/.env and restart.',
    });
  }
  return next();
}

/** Wrap async handlers so a LiveKit outage returns a clean 502 instead of crashing. */
const route = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error(`${req.method} ${req.path} failed:`, error?.message || error);
    if (!res.headersSent) res.status(502).json({ error: 'Could not reach the media server. Try again.' });
  }
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, livekit: livekitConfigured });
});

app.post('/api/rooms', requireLivekit, createRoomLimiter, route(async (req, res) => {
  const title = cleanText(req.body?.title, 48) || 'Watch party';
  const name = cleanText(req.body?.name, 24);
  const id = newRoomId();
  await roomService.createRoom({
    name: id,
    emptyTimeout: ROOM.emptyTimeout,
    departureTimeout: ROOM.departureTimeout,
    maxParticipants: ROOM.maxParticipants,
    metadata: JSON.stringify({ title }),
  });
  console.log(`create room=${id} title="${title}" by="${name}"`);
  // The creator joins straight away, so hand back their token now and save
  // two extra round trips to LiveKit.
  const join = name ? { token: await createJoinToken(id, name), url: LIVEKIT_URL } : null;
  res.status(201).json({ id, title, join });
}));

app.get('/api/rooms/:id', requireLivekit, route(async (req, res) => {
  const room = await findRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'This room does not exist or has closed.' });
  res.json({ id: room.name, title: parseTitle(room.metadata), participants: room.numParticipants });
}));

app.post('/api/rooms/:id/token', requireLivekit, tokenLimiter, route(async (req, res) => {
  const name = cleanText(req.body?.name, 24);
  if (!name) return res.status(400).json({ error: 'Enter a display name.' });

  const room = await findRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'This room does not exist or has closed.' });
  if (room.numParticipants >= ROOM.maxParticipants) {
    return res.status(409).json({ error: 'This room is full.' });
  }

  console.log(`join room=${room.name} name="${name}" alreadyInRoom=${room.numParticipants}`);
  res.json({ token: await createJoinToken(room.name, name), url: LIVEKIT_URL, title: parseTitle(room.metadata) });
}));

// Browsers report connection problems here so they show up in the server log.
const clientLogLimiter = createLimiter({ windowMs: 60 * 1000, max: 30 });
app.post('/api/client-log', clientLogLimiter, (req, res) => {
  const event = cleanText(req.body?.event, 40);
  const room = cleanText(req.body?.room, 16);
  const detail = cleanText(req.body?.detail, 400);
  const browser = cleanText(req.body?.browser, 160);
  console.log(`client ${event} room=${room} detail="${detail}" browser="${browser}"`);
  res.status(204).end();
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---------------------------------------------------------------------------
// Production client
// ---------------------------------------------------------------------------
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  // Hashed build assets never change, so they can be cached forever.
  app.use('/assets', express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else if (isProd) {
  console.warn('client/dist not found. Run "npm run build" before starting in production.');
}

app.listen(PORT, () => {
  console.log(`SyncView server on http://localhost:${PORT}${isProd ? ' (production)' : ''}`);
});
