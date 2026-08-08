export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function getShareUrl(roomId) {
  const base = window.location.origin;
  return `${base}/room/${roomId}`;
}

export async function createRoom(name) {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Could not create room');
  return res.json();
}

export async function fetchRoom(roomId) {
  const res = await fetch(`/api/rooms/${roomId}`);
  if (!res.ok) throw new Error('Room not found');
  return res.json();
}

export function getStoredName() {
  return localStorage.getItem('syncview:name') || '';
}

export function setStoredName(name) {
  localStorage.setItem('syncview:name', name);
}

export function getServerUrl() {
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  if (import.meta.env.DEV) return 'http://localhost:3001';
  return window.location.origin;
}
