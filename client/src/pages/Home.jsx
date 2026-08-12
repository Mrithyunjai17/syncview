import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, getStoredName, setStoredName } from '../utils.js';

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState(getStoredName());
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validateName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter your display name.');
      return null;
    }
    setStoredName(trimmed);
    return trimmed;
  };

  const handleCreate = async () => {
    const displayName = validateName();
    if (!displayName) return;

    setLoading(true);
    setError('');
    try {
      const room = await createRoom(roomName.trim() || 'Screen Share Room');
      navigate(`/room/${room.id}`, { state: { name: displayName } });
    } catch {
      setError('Could not create a room. Make sure the server is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = () => {
    const displayName = validateName();
    if (!displayName) return;

    const code = joinCode.trim();
    if (!code) {
      setError('Enter a room code to join.');
      return;
    }

    navigate(`/room/${code}`, { state: { name: displayName } });
  };

  return (
    <main className="hero">
      <section className="hero-card">
        <div className="brand">
          <div className="brand-mark">SV</div>
          <div>
            <h1>SyncView</h1>
            <p>Share your screen, talk together</p>
          </div>
        </div>

        <p className="hero-copy">
          Create a private room, broadcast your screen, and stay connected with live voice and text chat.
        </p>

        <div className="form-stack">
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex"
              maxLength={24}
            />
          </div>

          <div className="field">
            <label htmlFor="roomName">Room name (optional)</label>
            <input
              id="roomName"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Friday Movie Night"
              maxLength={48}
            />
          </div>

          <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating…' : 'Create room'}
          </button>

          <div className="field">
            <label htmlFor="joinCode">Or join with room code</label>
            <input
              id="joinCode"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="abc12345"
            />
          </div>

          <button className="btn btn-secondary" onClick={handleJoin}>
            Join room
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <ul className="feature-list">
          <li>Low-latency screen sharing</li>
          <li>Live voice chat with mute controls</li>
          <li>Shareable room links for friends</li>
          <li>Text chat and host controls</li>
        </ul>
      </section>
    </main>
  );
}
