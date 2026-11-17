import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioTrack, VideoTrack, useLocalParticipant, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import Icon from './Icon.jsx';
import { useScreenShareControl } from './useScreenShareControl.js';

const IDLE_MS = 2500;

function displayName(participant) {
  return participant.isLocal ? 'You' : participant.name || participant.identity;
}

function readVolume() {
  try {
    const stored = localStorage.getItem('syncview:movieVolume');
    return stored === null ? 1 : Math.min(1, Math.max(0, Number(stored)));
  } catch {
    return 1;
  }
}

export default function Stage({ roomCode, peopleCount, onCopyLink, linkCopied }) {
  const shares = useTracks([Track.Source.ScreenShare]);
  const shareAudio = useTracks([Track.Source.ScreenShareAudio], { onlySubscribed: true });
  const { localParticipant } = useLocalParticipant();
  const share = useScreenShareControl();

  const [pinned, setPinned] = useState(null);
  const active = useMemo(() => {
    if (!shares.length) return null;
    // Prefer the share the viewer picked, otherwise the most recent one.
    return shares.find((ref) => ref.participant.identity === pinned) || shares[shares.length - 1];
  }, [shares, pinned]);

  const activeAudio = active
    ? shareAudio.find((ref) => ref.participant.identity === active.participant.identity)
    : null;

  const [volume, setVolume] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem('syncview:movieVolume', String(volume));
    } catch {
      // ignore
    }
  }, [volume]);

  const frameRef = useRef(null);
  const videoRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef(null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const toggleFullscreen = async () => {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else if (frame.requestFullscreen) {
      await frame.requestFullscreen().catch(() => {});
    } else {
      // iOS Safari only supports fullscreen on the video element itself.
      videoRef.current?.webkitEnterFullscreen?.();
    }
  };

  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture().catch(() => {});
    else await video.requestPictureInPicture?.().catch(() => {});
  };

  if (!active) {
    return (
      <div className="stage-empty">
        <div className="stage-empty-art" aria-hidden="true"><Icon name="screen" size={40} /></div>
        <h2>Nothing is playing yet</h2>
        <p className="muted">
          Share a browser tab with a movie or show. Pick <strong>a tab</strong> and keep
          <strong> Share tab audio</strong> on so everyone hears it.
        </p>
        <button className="btn btn-primary" onClick={share.start} disabled={share.busy || !share.supported}>
          <Icon name="screen" size={18} /> {share.busy ? 'Choose what to share…' : 'Share a tab or screen'}
        </button>
        {!share.supported && <p className="notice">Screen sharing needs Chrome, Edge or Firefox on a computer. You can still watch and talk.</p>}
        {share.error && <p className="notice notice-error">{share.error}</p>}

        <div className="invite-card">
          <div>
            <span className="invite-label">Room code</span>
            <strong className="invite-code">{roomCode}</strong>
            <span className="muted small">
              {peopleCount <= 1 ? 'Only you are here so far.' : `${peopleCount} people are here.`}
            </span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onCopyLink}>
            <Icon name={linkCopied ? 'check' : 'link'} size={16} />
            {linkCopied ? 'Link copied' : 'Copy invite link'}
          </button>
        </div>
      </div>
    );
  }

  const isMine = active.participant.identity === localParticipant.identity;

  return (
    <div
      ref={frameRef}
      className={`stage-frame ${idle ? 'idle' : ''}`}
      onMouseMove={wake}
      onTouchStart={wake}
      onMouseLeave={() => setIdle(true)}
    >
      {isMine ? (
        <div className="stage-self">
          <VideoTrack trackRef={active} className="stage-self-preview" muted />
          <div>
            <h2>You're sharing</h2>
            <p className="muted">Everyone in the room is watching this. Keep this tab open while you watch.</p>
            <button className="btn btn-danger" onClick={share.stop}>
              <Icon name="screenOff" size={18} /> Stop sharing
            </button>
          </div>
        </div>
      ) : (
        <>
          <VideoTrack ref={videoRef} trackRef={active} className="stage-video" onDoubleClick={toggleFullscreen} />
          {activeAudio && <AudioTrack trackRef={activeAudio} volume={muted ? 0 : volume} />}
        </>
      )}

      <div className="stage-top">
        <span className="live-badge">LIVE</span>
        <span className="stage-owner">{displayName(active.participant)}</span>
        {shares.length > 1 && (
          <div className="share-switch" role="group" aria-label="Choose a screen to watch">
            {shares.map((ref) => (
              <button
                key={ref.participant.identity}
                className={ref.participant.identity === active.participant.identity ? 'active' : ''}
                onClick={() => setPinned(ref.participant.identity)}
              >
                {displayName(ref.participant)}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isMine && (
        <div className="stage-controls">
          <button
            className="icon-btn"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute movie audio' : 'Mute movie audio'}
            title={activeAudio ? 'Movie audio' : 'This share has no audio'}
            disabled={!activeAudio}
          >
            <Icon name={muted || !activeAudio || volume === 0 ? 'volumeOff' : 'volume'} />
          </button>
          <input
            className="slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              setMuted(false);
            }}
            aria-label="Movie volume"
            disabled={!activeAudio}
          />
          {!activeAudio && <span className="small muted">No audio shared</span>}
          <span className="spacer" />
          {document.pictureInPictureEnabled && (
            <button className="icon-btn" onClick={togglePip} aria-label="Picture in picture">
              <Icon name="pip" />
            </button>
          )}
          <button className="icon-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <Icon name="fullscreen" />
          </button>
        </div>
      )}
    </div>
  );
}
