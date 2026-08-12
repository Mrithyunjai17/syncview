import { io } from '../client/node_modules/socket.io-client/build/esm/index.js';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3001';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function connect() {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, { transports: ['websocket'], forceNew: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

const roomResponse = await fetch(`${BASE_URL}/api/rooms`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Automated smoke test' }),
});
assert(roomResponse.ok, 'Room creation failed');
const room = await roomResponse.json();

const host = await connect();
const viewer = await connect();
const hostJoin = await emitAck(host, 'room:join', { roomId: room.id, name: 'Host' });
const viewerJoin = await emitAck(viewer, 'room:join', { roomId: room.id, name: 'Viewer' });
assert(hostJoin.ok && hostJoin.youAreHost, 'First member was not assigned host');
assert(viewerJoin.ok && !viewerJoin.youAreHost, 'Viewer joined incorrectly');

const screenStart = await emitAck(host, 'screen:start', { title: 'Test share' });
assert(screenStart.ok, 'Host could not start screen sharing');

let incorrectlyStopped = false;
host.once('screen:stopped', () => { incorrectlyStopped = true; });
viewer.disconnect();
await wait(150);
assert(!incorrectlyStopped, 'A viewer disconnect incorrectly stopped the host screen share');

const activeRoomResponse = await fetch(`${BASE_URL}/api/rooms/${room.id}`);
const activeRoom = await activeRoomResponse.json();
assert(activeRoom.screenShare.active, 'Room lost active screen state after viewer left');

const voicePeer = await connect();
await emitAck(voicePeer, 'room:join', { roomId: room.id, name: 'Voice peer' });
assert((await emitAck(host, 'voice:state', { enabled: true })).ok, 'Host voice state failed');
assert((await emitAck(voicePeer, 'voice:state', { enabled: true })).ok, 'Peer voice state failed');

const relayedSignal = new Promise((resolve) => {
  voicePeer.once('voice:signal', resolve);
});
host.emit('voice:signal', {
  to: voicePeer.id,
  type: 'offer',
  data: { type: 'offer', sdp: 'smoke-test' },
});
const signal = await Promise.race([relayedSignal, wait(1000).then(() => null)]);
assert(signal?.from === host.id && signal?.type === 'offer', 'Voice signaling was not relayed');

await emitAck(host, 'screen:stop', {});
host.disconnect();
voicePeer.disconnect();

console.log('Smoke test passed: room, screen lifecycle, disconnect regression, and voice signaling.');
