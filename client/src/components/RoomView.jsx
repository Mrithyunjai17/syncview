import { useEffect, useRef, useState } from 'react';
import {
  AudioTrack,
  useChat,
  useRoomContext,
  useConnectionState,
  useParticipants,
  useStartAudio,
  useTracks,
} from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import Stage from './Stage.jsx';
import ControlBar from './ControlBar.jsx';
import PeoplePanel from './PeoplePanel.jsx';
import ChatPanel from './ChatPanel.jsx';
import Icon from './Icon.jsx';
import { ShareProvider } from './useScreenShareControl.js';
import { formatRoomCode, inviteLink, reportClientEvent } from '../lib/api.js';
import { explainStall, probeNetwork } from '../lib/netcheck.js';

function usePersistentNumber(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(key));
      return Number.isFinite(stored) && localStorage.getItem(key) !== null ? stored : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Storage unavailable; keep the value for this session only.
    }
  }, [key, value]);
  return [value, setValue];
}

/** Plays everyone else's microphones at the chosen voice volume. */
function VoiceAudio({ volume }) {
  const micTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })
    .filter((ref) => !ref.participant.isLocal);
  return micTracks.map((ref) => (
    <AudioTrack key={`${ref.participant.identity}-mic`} trackRef={ref} volume={volume} />
  ));
}

export default function RoomView({ roomId, title }) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const participants = useParticipants();
  const chat = useChat();
  const { mergedProps: startAudioProps, canPlayAudio } = useStartAudio({ props: {} });

  const [tab, setTab] = useState('chat');
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [copied, setCopied] = useState('');
  const [voiceVolume, setVoiceVolume] = usePersistentNumber('syncview:voiceVolume', 1);
  const [unread, setUnread] = useState(0);
  const seenCount = useRef(0);

  // Until LiveKit confirms the connection, show that we're connecting rather
  // than an "empty" room. Report slow connects so they show up in the server log.
  const [everConnected, setEverConnected] = useState(false);
  useEffect(() => {
    if (connection === ConnectionState.Connected) setEverConnected(true);
  }, [connection]);
  // If the first connection stalls, check the browser's network access and
  // explain the likely cause instead of spinning forever.
  const [stall, setStall] = useState(null);
  useEffect(() => {
    if (everConnected) {
      setStall(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await probeNetwork();
      if (cancelled) return;
      reportClientEvent('slow-connect', roomId, `host=${result.host} srflx=${result.srflx} supported=${result.supported}`);
      setStall(explainStall(result));
    }, 10_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [everConnected, roomId]);

  const chatVisible = panelOpen && tab === 'chat';
  useEffect(() => {
    const count = chat.chatMessages.length;
    if (chatVisible) {
      seenCount.current = count;
      setUnread(0);
    } else {
      setUnread(count - seenCount.current);
    }
  }, [chat.chatMessages.length, chatVisible]);

  const copy = async (what) => {
    const text = what === 'link' ? inviteLink(roomId) : formatRoomCode(roomId);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      window.prompt(what === 'link' ? 'Copy this invite link:' : 'Copy this room code:', text);
    }
  };

  const openPanel = (next) => {
    if (panelOpen && tab === next) setPanelOpen(false);
    else {
      setTab(next);
      setPanelOpen(true);
    }
  };

  return (
    <ShareProvider>
    <div className={`room ${panelOpen ? 'with-panel' : ''}`}>
      <header className="room-bar">
        <div className="room-title">
          <h1>{title || 'Watch party'}</h1>
          <span className={`status-dot status-${connection}`} title={connection} />
          {connection === ConnectionState.Reconnecting && <span className="muted small">Reconnecting…</span>}
        </div>
        <button
          className="room-code"
          onClick={() => copy('code')}
          title="Room code: click to copy"
          aria-label={`Room code ${formatRoomCode(roomId)}, click to copy`}
        >
          <span className="room-code-label">Code</span>
          <span className="room-code-value">{copied === 'code' ? 'Copied' : formatRoomCode(roomId)}</span>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => copy('link')}>
          <Icon name={copied === 'link' ? 'check' : 'link'} size={16} />
          <span className="hide-narrow">{copied === 'link' ? 'Link copied' : 'Copy invite link'}</span>
        </button>
      </header>

      {!canPlayAudio && (
        <button {...startAudioProps} className="audio-unlock" style={undefined}>
          <Icon name="volume" size={18} /> Click to turn on sound
        </button>
      )}

      <main className="room-stage">
        {everConnected ? (
          <Stage roomCode={formatRoomCode(roomId)} peopleCount={participants.length} onCopyLink={() => copy('link')} linkCopied={copied === 'link'} />
        ) : (
          <div className="stage-empty" role="status">
            {stall ? (
              <>
                <div className="stage-empty-art warn" aria-hidden="true"><Icon name="screenOff" size={36} /></div>
                <h2>{stall.title}</h2>
                <p className="muted">{stall.body}</p>
                <div className="row-actions">
                  <button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
                  <button className="btn btn-ghost" onClick={() => room.disconnect()}>Leave</button>
                </div>
                <p className="muted small">Still trying in the background: this screen will switch to the room if it connects.</p>
              </>
            ) : (
              <>
                <div className="spinner" aria-hidden="true" />
                <h2>Connecting to room {formatRoomCode(roomId)}…</h2>
                <p className="muted">This usually takes a second or two.</p>
              </>
            )}
          </div>
        )}
      </main>

      {panelOpen && (
        <aside className="room-panel">
          <div className="panel-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
              Chat
            </button>
            <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
              People <span className="count">{participants.length}</span>
            </button>
            <button className="icon-btn panel-close" onClick={() => setPanelOpen(false)} aria-label="Close panel">
              <Icon name="close" size={18} />
            </button>
          </div>
          {tab === 'chat'
            ? <ChatPanel chat={chat} />
            : <PeoplePanel participants={participants} voiceVolume={voiceVolume} onVoiceVolume={setVoiceVolume} />}
        </aside>
      )}

      <ControlBar
        onToggleChat={() => openPanel('chat')}
        onTogglePeople={() => openPanel('people')}
        chatActive={panelOpen && tab === 'chat'}
        peopleActive={panelOpen && tab === 'people'}
        unread={unread}
        peopleCount={participants.length}
      />

      <VoiceAudio volume={voiceVolume} />
    </div>
    </ShareProvider>
  );
}
