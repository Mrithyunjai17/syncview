import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import SyncedVideoPlayer from '../components/SyncedVideoPlayer.jsx';
import ScreenSharePlayer from '../components/ScreenSharePlayer.jsx';
import ChatPanel, { MembersPanel } from '../components/ChatPanel.jsx';
import { useSocket } from '../hooks/useSocket.js';
import { useScreenShare } from '../hooks/useScreenShare.js';
import { getShareUrl, getStoredName } from '../utils.js';

export default function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const userName = location.state?.name || getStoredName() || 'Guest';
  const { socket, connected, room, isHost, joinError } = useSocket(roomId, userName);
  const [sourceMode, setSourceMode] = useState('screen');
  const [sideTab, setSideTab] = useState('chat');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [loadError, setLoadError] = useState('');
  const [copied, setCopied] = useState(false);

  const screenShare = useScreenShare({
    socket,
    isHost,
    screenShare: room?.screenShare,
    members: room?.members,
  });

  const shareUrl = useMemo(() => getShareUrl(roomId), [roomId]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadVideo = () => {
    if (!socket || !isHost) return;
    setLoadError('');

    const url = videoUrl.trim();
    if (!url) {
      setLoadError('Enter a direct video URL.');
      return;
    }

    if (screenShare.sharing) {
      screenShare.stopSharing();
    }

    socket.emit('playback:load', { videoUrl: url, videoTitle: videoTitle.trim() }, (response) => {
      if (!response?.ok) setLoadError(response?.error || 'Could not load video');
    });
  };

  const startScreenShare = () => {
    setSourceMode('screen');
    screenShare.startSharing();
  };

  if (joinError) {
    return (
      <main className="hero">
        <section className="hero-card">
          <h2>Could not join room</h2>
          <p className="hero-copy">{joinError}</p>
          <Link className="btn btn-primary" to="/">
            Back home
          </Link>
        </section>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="hero">
        <section className="hero-card">
          <p className="hero-copy">Connecting to room…</p>
        </section>
      </main>
    );
  }

  const activeScreenMode = sourceMode === 'screen' || room.screenShare?.active;

  return (
    <div className="room-layout">
      <header className="room-header">
        <div className="room-header-inner">
          <div className="room-title-block">
            <h2>{room.name}</h2>
            <div className="room-meta">
              <span className="pill">Room: {room.id}</span>
              <span className="pill">{room.members.length} watching</span>
              {room.screenShare?.active && <span className="pill pill-live">Live</span>}
              {isHost && <span className="pill pill-host">You are host</span>}
            </div>
          </div>

          <div className="btn-row" style={{ gridTemplateColumns: 'auto auto' }}>
            <button className="btn btn-secondary copy-link" onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy invite link'}
            </button>
            <Link className="btn btn-ghost" to="/">
              Leave
            </Link>
          </div>
        </div>
      </header>

      <div className="room-body">
        <section>
          <div className="source-tabs">
            <button
              className={`source-tab ${activeScreenMode ? 'active' : ''}`}
              onClick={() => setSourceMode('screen')}
            >
              Screen share
            </button>
            <button
              className={`source-tab ${!activeScreenMode ? 'active' : ''}`}
              onClick={() => setSourceMode('url')}
            >
              Video URL
            </button>
          </div>

          {activeScreenMode ? (
            <ScreenSharePlayer
              isHost={isHost}
              isLive={screenShare.isLive}
              sharing={screenShare.sharing}
              connected={screenShare.connected}
              error={screenShare.error}
              title={room.screenShare?.title}
              localVideoRef={screenShare.localVideoRef}
              remoteVideoRef={screenShare.remoteVideoRef}
              onStart={startScreenShare}
              onStop={screenShare.stopSharing}
              roomConnected={connected}
            />
          ) : (
            <SyncedVideoPlayer
              socket={socket}
              isHost={isHost}
              playback={room.playback}
              connected={connected}
            />
          )}

          {isHost && !activeScreenMode && (
            <div className="host-tools">
              <h3>Load video (host only)</h3>
              <small>Use a direct link to an MP4, WebM, or HLS (.m3u8) stream you have rights to watch.</small>
              <div className="field">
                <label htmlFor="videoTitle">Title</label>
                <input
                  id="videoTitle"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Episode 1"
                />
              </div>
              <div className="field">
                <label htmlFor="videoUrl">Video URL</label>
                <input
                  id="videoUrl"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://example.com/video.mp4"
                />
              </div>
              <button className="btn btn-primary" onClick={loadVideo}>
                Load for everyone
              </button>
              {loadError && <div className="error-banner">{loadError}</div>}
            </div>
          )}
        </section>

        <aside className="side-panel">
          <div className="panel-tabs">
            <button
              className={`panel-tab ${sideTab === 'chat' ? 'active' : ''}`}
              onClick={() => setSideTab('chat')}
            >
              Chat
            </button>
            <button
              className={`panel-tab ${sideTab === 'members' ? 'active' : ''}`}
              onClick={() => setSideTab('members')}
            >
              People
            </button>
          </div>

          {sideTab === 'chat' ? (
            <ChatPanel socket={socket} messages={room.messages} />
          ) : (
            <MembersPanel
              members={room.members}
              isHost={isHost}
              socket={socket}
              hostId={room.hostId}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
