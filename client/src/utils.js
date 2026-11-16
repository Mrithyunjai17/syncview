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
