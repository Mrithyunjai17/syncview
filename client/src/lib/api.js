async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return body;
}

/** Creates a room; with a name it also returns the creator's join token. */
export const createRoom = (title, name) =>
  request('/api/rooms', { method: 'POST', body: JSON.stringify({ title, name }) });

export const getRoom = (roomId) => request(`/api/rooms/${encodeURIComponent(roomId)}`);

export const getJoinToken = (roomId, name) =>
  request(`/api/rooms/${encodeURIComponent(roomId)}/token`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

/** Fire-and-forget report of a connection problem, so it lands in the server log. */
export function reportClientEvent(event, room, detail) {
  try {
    fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, room, detail: String(detail ?? ''), browser: navigator.userAgent }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never break the page.
  }
}

const NAME_KEY = 'syncview:name';

export function getStoredName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function storeName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private mode or blocked storage: the name just won't be remembered.
  }
}

/** Accepts a bare code ("abcd2345", "ABCD-2345", "abcd 2345") or a pasted invite link. */
export function parseRoomCode(input) {
  const value = input.trim();
  const fromLink = value.match(/\/room\/([a-z0-9-]+)/i);
  return (fromLink ? fromLink[1] : value).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** Room codes are shown as "abcd-2345" so they are easy to read out. */
export const formatRoomCode = (roomId) =>
  roomId.length === 8 ? `${roomId.slice(0, 4)}-${roomId.slice(4)}` : roomId;

export const inviteLink = (roomId) => `${window.location.origin}/room/${roomId}`;
