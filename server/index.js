import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

function getCorsOrigin() {
  if (process.env.CLIENT_ORIGIN) {
    return process.env.CLIENT_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean);
  }
  return isProd ? true : 'http://localhost:5173';
}

const corsOrigin = getCorsOrigin();

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  pingInterval: 10000,
  pingTimeout: 5000,
});

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {string} name
 * @property {string} hostId
 * @property {{ active: boolean, title: string, startedAt: number | null }} screenShare
 * @property {Array<{id: string, name: string, joinedAt: number, voiceEnabled: boolean, voiceMuted: boolean}>} members
 * @property {Array<{id: string, user: string, text: string, at: number}>} messages
 * @property {number} createdAt
 */

function createRoom(name) {
  const id = nanoid(8);
  /** @type {Room} */
  const room = {
    id,
    name: name || 'Screen Share Room',
    hostId: '',
    screenShare: {
      active: false,
      title: '',
      startedAt: null,
    },
    members: [],
    messages: [],
    createdAt: Date.now(),
  };
  rooms.set(id, room);
  return room;
}

function getPublicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    memberCount: room.members.length,
    screenShare: room.screenShare,
    createdAt: room.createdAt,
  };
}

function serializeRoom(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    screenShare: room.screenShare,
    members: room.members,
    messages: room.messages.slice(-100),
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

app.post('/api/rooms', (req, res) => {
  const room = createRoom(req.body?.name);
  res.json(getPublicRoom(room));
});

app.get('/api/rooms/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(getPublicRoom(room));
});

const clientDist = path.join(__dirname, '../client/dist');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }

    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) res.status(404).json({ error: 'Not found' });
    });
  });
} else if (isProd) {
  console.warn('client/dist not found — run "npm run build" before starting in production.');
}

io.on('connection', (socket) => {
  let currentRoomId = null;
  let userName = 'Guest';

  socket.on('room:join', ({ roomId, name }, ack) => {
    const room = rooms.get(roomId);
    if (!room) {
      ack?.({ ok: false, error: 'Room not found' });
      return;
    }

    userName = (name || 'Guest').trim().slice(0, 24) || 'Guest';
    currentRoomId = roomId;
    socket.join(roomId);

    if (!room.hostId) room.hostId = socket.id;

    const existing = room.members.find((m) => m.id === socket.id);
    if (!existing) {
      room.members.push({
        id: socket.id,
        name: userName,
        joinedAt: Date.now(),
        voiceEnabled: false,
        voiceMuted: false,
      });
      room.messages.push({
        id: nanoid(),
        user: 'System',
        text: `${userName} joined the room`,
        at: Date.now(),
      });
    } else {
      existing.name = userName;
    }

    ack?.({ ok: true, room: serializeRoom(room), youAreHost: room.hostId === socket.id });
    io.to(roomId).emit('room:update', serializeRoom(room));

  });

  socket.on('chat:send', ({ text }, ack) => {
    const room = rooms.get(currentRoomId);
    if (!room) return ack?.({ ok: false });

    const message = text?.trim().slice(0, 500);
    if (!message) return ack?.({ ok: false });

    const entry = { id: nanoid(), user: userName, text: message, at: Date.now() };
    room.messages.push(entry);
    if (room.messages.length > 200) room.messages.shift();

    io.to(currentRoomId).emit('chat:message', entry);
    ack?.({ ok: true });
  });

  socket.on('screen:start', ({ title }, ack) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.hostId !== socket.id) {
      return ack?.({ ok: false, error: 'Only the host can share their screen' });
    }

    room.screenShare = {
      active: true,
      title: (title || 'Live screen share').trim().slice(0, 120),
      startedAt: Date.now(),
    };
    io.to(currentRoomId).emit('screen:started', room.screenShare);
    io.to(currentRoomId).emit('room:update', serializeRoom(room));
    ack?.({ ok: true });
  });

  socket.on('screen:stop', (_payload, ack) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.hostId !== socket.id) {
      return ack?.({ ok: false, error: 'Only the host can stop screen share' });
    }

    room.screenShare = { active: false, title: '', startedAt: null };
    io.to(currentRoomId).emit('screen:stopped');
    io.to(currentRoomId).emit('room:update', serializeRoom(room));
    ack?.({ ok: true });
  });

  const relayToRoomMember = (eventName, payload, field) => {
    const room = rooms.get(currentRoomId);
    const targetId = payload?.to;
    if (!room || !targetId || !room.members.some((member) => member.id === targetId)) return;
    if (!payload[field]) return;
    io.to(targetId).emit(eventName, { from: socket.id, [field]: payload[field] });
  };

  socket.on('webrtc:offer', (payload) => relayToRoomMember('webrtc:offer', payload, 'offer'));
  socket.on('webrtc:answer', (payload) => relayToRoomMember('webrtc:answer', payload, 'answer'));
  socket.on('webrtc:ice-candidate', (payload) => {
    relayToRoomMember('webrtc:ice-candidate', payload, 'candidate');
  });

  socket.on('webrtc:viewer-ready', () => {
    const room = rooms.get(currentRoomId);
    if (!room?.screenShare.active || room.hostId === socket.id) return;
    io.to(room.hostId).emit('webrtc:viewer-ready', { viewerId: socket.id });
  });

  socket.on('voice:state', ({ enabled, muted }, ack) => {
    const room = rooms.get(currentRoomId);
    const member = room?.members.find((entry) => entry.id === socket.id);
    if (!room || !member) return ack?.({ ok: false });
    member.voiceEnabled = Boolean(enabled);
    member.voiceMuted = member.voiceEnabled ? Boolean(muted) : false;
    if (!member.voiceEnabled || member.voiceMuted) {
      io.to(currentRoomId).emit('voice:activity', { memberId: socket.id, speaking: false });
    }
    io.to(currentRoomId).emit('room:update', serializeRoom(room));
    ack?.({ ok: true });
  });

  socket.on('voice:activity', ({ speaking }) => {
    const room = rooms.get(currentRoomId);
    const member = room?.members.find((entry) => entry.id === socket.id);
    if (!room || !member?.voiceEnabled || member.voiceMuted) return;
    socket.to(currentRoomId).emit('voice:activity', {
      memberId: socket.id,
      speaking: Boolean(speaking),
    });
  });

  socket.on('voice:signal', ({ to, type, data }) => {
    const room = rooms.get(currentRoomId);
    const sender = room?.members.find((member) => member.id === socket.id);
    const target = room?.members.find((member) => member.id === to);
    if (!room || !sender?.voiceEnabled || !target?.voiceEnabled) return;
    if (!['offer', 'answer', 'ice'].includes(type) || !data) return;
    io.to(to).emit('voice:signal', { from: socket.id, type, data });
  });

  socket.on('host:transfer', ({ targetId }, ack) => {
    const room = rooms.get(currentRoomId);
    if (!room || room.hostId !== socket.id) {
      return ack?.({ ok: false, error: 'Only the host can transfer host' });
    }

    const target = room.members.find((m) => m.id === targetId);
    if (!target) return ack?.({ ok: false, error: 'Member not found' });

    room.hostId = targetId;
    room.screenShare = { active: false, title: '', startedAt: null };
    room.messages.push({
      id: nanoid(),
      user: 'System',
      text: `${target.name} is now the host`,
      at: Date.now(),
    });

    io.to(currentRoomId).emit('screen:stopped');
    io.to(currentRoomId).emit('room:update', serializeRoom(room));
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.members = room.members.filter((m) => m.id !== socket.id);

    if (room.members.length === 0) {
      rooms.delete(currentRoomId);
      return;
    }

    const hostLeft = room.hostId === socket.id;
    if (hostLeft) {
      room.hostId = room.members[0].id;
      room.screenShare = { active: false, title: '', startedAt: null };
      room.messages.push({
        id: nanoid(),
        user: 'System',
        text: `${room.members[0].name} is now the host`,
        at: Date.now(),
      });
    }

    room.messages.push({
      id: nanoid(),
      user: 'System',
      text: `${userName} left the room`,
      at: Date.now(),
    });

    if (hostLeft) io.to(currentRoomId).emit('screen:stopped');
    io.to(currentRoomId).emit('room:update', serializeRoom(room));
  });
});

httpServer.listen(PORT, () => {
  console.log(`SyncView server running on port ${PORT}${isProd ? ' (production)' : ''}`);
});
