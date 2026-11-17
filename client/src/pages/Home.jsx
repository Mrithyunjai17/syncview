import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, getStoredName, parseRoomCode, storeName } from '../lib/api.js';

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState(getStoredName);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const requireName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter your name first.');
      return null;
    }
    storeName(trimmed);
    return trimmed;
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const displayName = requireName();
    if (!displayName) return;
    setBusy(true);
    setError('');
    try {
      const room = await createRoom(title.trim(), displayName);
      // Hand the ready-made session to the room page so the creator goes straight in.
      navigate(`/room/${room.id}`, { state: { created: { title: room.title, join: room.join } } });
    } catch (err) {
      setError(err.message || 'Could not create a room.');
      setBusy(false);
    }
  };

  const handleJoin = (event) => {
    event.preventDefault();
    if (!requireName()) return;
    const roomId = parseRoomCode(code);
    if (!roomId) {
      setError('Paste an invite link or room code.');
      return;
    }
    navigate(`/room/${roomId}`, { state: { autoJoin: true } });
  };

  return (
    <main className="home">
      <section className="home-intro">
        <div className="logo">
          <span className="logo-mark" aria-hidden="true" />
          SyncView
        </div>
        <h1>Watch together, from anywhere.</h1>
        <p>
          One person shares a tab or screen, everyone sees it in sharp, smooth quality and talks over
          live voice. No installs, no accounts.
        </p>
        <ul className="home-points">
          <li>Up to 1080p at 30 fps with the shared tab's audio</li>
          <li>Voice chat with echo cancellation and speaking indicators</li>
          <li>Works on restrictive networks through a relayed media server</li>
        </ul>
      </section>

      <section className="home-card" aria-label="Start or join a room">
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex"
            maxLength={24}
            autoComplete="nickname"
          />
        </label>

        <form onSubmit={handleCreate} className="stack">
          <label className="field">
            <span>Room name <em>optional</em></span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Friday movie night"
              maxLength={48}
            />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creating room…' : 'Create a room'}
          </button>
        </form>

        <div className="divider"><span>or join one</span></div>

        <form onSubmit={handleJoin} className="join-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Invite link or room code"
            aria-label="Invite link or room code"
          />
          <button className="btn btn-secondary">Join</button>
        </form>

        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
