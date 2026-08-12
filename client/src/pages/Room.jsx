import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import ScreenSharePlayer from '../components/ScreenSharePlayer.jsx';
import VoiceChat from '../components/VoiceChat.jsx';
import ChatPanel, { MembersPanel } from '../components/ChatPanel.jsx';
import { useSocket } from '../hooks/useSocket.js';
import { useScreenShare } from '../hooks/useScreenShare.js';
import { useVoiceChat } from '../hooks/useVoiceChat.js';
import { getShareUrl, getStoredName } from '../utils.js';

export default function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const userName = location.state?.name || getStoredName() || 'Guest';
  const { socket, connected, room, isHost, joinError } = useSocket(roomId, userName);
  const [sideTab, setSideTab] = useState('chat');
  const [copied, setCopied] = useState(false);

  const screenShare = useScreenShare({ socket, isHost, screenShare: room?.screenShare });
  const voice = useVoiceChat({ socket, members: room?.members || [] });
  const shareUrl = useMemo(() => getShareUrl(roomId), [roomId]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this invite link:', shareUrl);
    }
  };

  if (joinError) {
    return (
      <main className="hero"><section className="hero-card">
        <h2>Could not join room</h2>
        <p className="hero-copy">{joinError}</p>
        <Link className="btn btn-primary" to="/">Back home</Link>
      </section></main>
    );
  }

  if (!room) {
    return <main className="hero"><section className="hero-card"><p>Connecting to room…</p></section></main>;
  }

  return (
    <div className="room-layout">
      <header className="room-header">
        <div className="room-header-inner">
          <div className="room-title-block">
            <h2>{room.name}</h2>
            <div className="room-meta">
              <span className="pill">Room: {room.id}</span>
              <span className="pill">{room.members.length} connected</span>
              {room.screenShare?.active && <span className="pill pill-live">Live screen</span>}
              {isHost && <span className="pill pill-host">You are host</span>}
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy invite link'}
            </button>
            <Link className="btn btn-ghost" to="/">Leave</Link>
          </div>
        </div>
      </header>

      <div className="room-body">
        <main className="media-column">
          <ScreenSharePlayer
            isHost={isHost}
            isLive={screenShare.isLive}
            sharing={screenShare.sharing}
            connected={screenShare.connected}
            needsPlayback={screenShare.needsPlayback}
            error={screenShare.error}
            quality={screenShare.quality}
            qualityProfiles={screenShare.qualityProfiles}
            title={room.screenShare?.title}
            localVideoRef={screenShare.localVideoRef}
            remoteVideoRef={screenShare.remoteVideoRef}
            onStart={screenShare.startSharing}
            onStop={screenShare.stopSharing}
            onResumePlayback={screenShare.resumePlayback}
            onQualityChange={screenShare.setQuality}
            roomConnected={connected}
          />
          <VoiceChat voice={voice} members={room.members} />
        </main>

        <aside className="side-panel">
          <div className="panel-tabs">
            <button className={`panel-tab ${sideTab === 'chat' ? 'active' : ''}`} onClick={() => setSideTab('chat')}>
              Chat
            </button>
            <button className={`panel-tab ${sideTab === 'members' ? 'active' : ''}`} onClick={() => setSideTab('members')}>
              People
            </button>
          </div>
          {sideTab === 'chat' ? (
            <ChatPanel socket={socket} messages={room.messages} />
          ) : (
            <MembersPanel members={room.members} isHost={isHost} socket={socket} hostId={room.hostId} />
          )}
        </aside>
      </div>
    </div>
  );
}
