import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LiveKitRoom } from '@livekit/components-react';
import { DisconnectReason } from 'livekit-client';
import RoomView from '../components/RoomView.jsx';
import { formatRoomCode, getJoinToken, getRoom, getStoredName, reportClientEvent, storeName } from '../lib/api.js';
import { ROOM_OPTIONS } from '../lib/media.js';

const ENDED_MESSAGES = {
  [DisconnectReason.ROOM_DELETED]: 'This room has closed.',
  [DisconnectReason.PARTICIPANT_REMOVED]: 'You were removed from the room.',
  [DisconnectReason.DUPLICATE_IDENTITY]: 'You joined this room from another tab.',
  [DisconnectReason.JOIN_FAILURE]: 'Could not connect to the media server. Check your connection and try again.',
};

export default function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // The creator arrives with a ready-made session from the home page.
  const created = location.state?.created;
  const [room, setRoom] = useState(() => (created ? { id: roomId, title: created.title, participants: 0 } : null));
  const [session, setSession] = useState(() => created?.join || null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState(getStoredName);
  const [joining, setJoining] = useState(() => Boolean(location.state?.autoJoin && getStoredName()));
  const [notice, setNotice] = useState('');

  // Drop the one-time navigation state, so a refresh shows the join screen
  // instead of reusing an old session.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (room) return undefined;
    let cancelled = false;
    getRoom(roomId)
      .then((info) => !cancelled && setRoom(info))
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [roomId, room]);

  const join = useCallback(async (displayName) => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNotice('Enter your name to join.');
      return;
    }
    storeName(trimmed);
    setJoining(true);
    setNotice('');
    try {
      const { token, url, title } = await getJoinToken(roomId, trimmed);
      setRoom((current) => current || { id: roomId, title, participants: 0 });
      setSession({ token, url });
    } catch (err) {
      if (err.status === 404) setLoadError(err.message);
      else setNotice(err.message);
    } finally {
      setJoining(false);
    }
  }, [roomId]);

  // Joining by code from the home page with a name already entered: skip the
  // join screen. The token request checks the room exists, so don't wait for it.
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (autoJoinedRef.current || !location.state?.autoJoin || !getStoredName()) return;
    autoJoinedRef.current = true;
    join(getStoredName());
  }, [location.state, join]);

  const handleDisconnected = useCallback((reason) => {
    setSession(null);
    if (reason === DisconnectReason.CLIENT_INITIATED) {
      navigate('/');
      return;
    }
    reportClientEvent('disconnected', roomId, `reason=${reason}`);
    setNotice(ENDED_MESSAGES[reason] || 'You were disconnected. Rejoin when you are ready.');
  }, [navigate, roomId]);

  // A failed connection must never look like an empty room: drop back to the
  // join screen and say what went wrong.
  const handleConnectError = useCallback((err) => {
    reportClientEvent('connect-error', roomId, `${err?.name || 'Error'}: ${err?.message || err}`);
    setSession(null);
    setNotice(`Could not connect to the room: ${err?.message || 'unknown error'}. Check your connection and press Join to retry.`);
  }, [roomId]);

  if (loadError) {
    return (
      <main className="center-screen">
        <section className="panel-card">
          <h2>Room not available</h2>
          <p className="muted">{loadError}</p>
          <Link className="btn btn-primary" to="/">Start a new room</Link>
        </section>
      </main>
    );
  }

  if (session) {
    return (
      <LiveKitRoom
        className="room-root"
        serverUrl={session.url}
        token={session.token}
        connect
        options={ROOM_OPTIONS}
        onConnected={() => reportClientEvent('connected', roomId, '')}
        onDisconnected={handleDisconnected}
        onError={handleConnectError}
      >
        <RoomView roomId={roomId} title={room?.title} />
      </LiveKitRoom>
    );
  }

  return (
    <main className="center-screen">
      <form
        className="panel-card"
        onSubmit={(e) => {
          e.preventDefault();
          join(name);
        }}
      >
        <p className="eyebrow">{joining ? 'Joining' : "You're invited to"}</p>
        <h2>{room ? room.title : 'Checking room…'}</h2>
        <p className="prejoin-code">Room code <strong>{formatRoomCode(roomId)}</strong></p>
        {room && (
          <p className="muted">
            {room.participants === 0
              ? 'Nobody is here yet.'
              : `${room.participants} ${room.participants === 1 ? 'person is' : 'people are'} here.`}
          </p>
        )}
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex"
            maxLength={24}
            autoFocus
            autoComplete="nickname"
          />
        </label>
        <button className="btn btn-primary btn-block" disabled={joining}>
          {joining ? 'Joining…' : 'Join room'}
        </button>
        {notice && <p className="notice notice-error" role="alert">{notice}</p>}
        <Link className="link-quiet" to="/">Back to home</Link>
      </form>
    </main>
  );
}
