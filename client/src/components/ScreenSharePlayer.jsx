import { useEffect, useRef, useState } from 'react';

export default function ScreenSharePlayer({
  isHost,
  isLive,
  sharing,
  connected,
  needsPlayback,
  error,
  quality,
  qualityProfiles,
  title,
  localVideoRef,
  remoteVideoRef,
  onStart,
  onStop,
  onResumePlayback,
  onQualityChange,
  roomConnected,
}) {
  const shellRef = useRef(null);
  const videoRef = isHost ? localVideoRef : remoteVideoRef;
  const [volume, setVolume] = useState(1);
  const [soundMuted, setSoundMuted] = useState(false);
  const [saturation, setSaturation] = useState(85);
  const [fullscreen, setFullscreen] = useState(false);
  const hasStream = (isHost && sharing) || (!isHost && isLive && connected);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isHost) return;
    video.volume = volume;
    video.muted = soundMuted;
  }, [videoRef, volume, soundMuted, isHost, connected]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (shellRef.current?.requestFullscreen) {
        await shellRef.current.requestFullscreen();
      } else if (videoRef.current?.webkitEnterFullscreen) {
        videoRef.current.webkitEnterFullscreen();
      }
    } catch {
      // Fullscreen support varies on mobile browsers; native video fallback is used above.
    }
  };

  return (
    <div className="player-panel">
      <div className="player-shell" ref={shellRef}>
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted={isHost || soundMuted}
          controls={false}
          className="screen-video"
          style={{ filter: `saturate(${saturation}%)` }}
        />

        {!isLive && !sharing && (
          <div className="player-empty"><div>
            <strong>No screen share yet</strong>
            <p>{isHost ? 'Share a browser tab, window, or screen when you are ready.' : 'Waiting for the host to share a screen.'}</p>
          </div></div>
        )}

        {isHost && sharing && <div className="live-badge"><span className="live-dot" />You're live</div>}

        {!isHost && isLive && !connected && (
          <div className="player-empty overlay"><div>
            <strong>Connecting to host…</strong>
            <p>The stream should appear in a few seconds.</p>
          </div></div>
        )}

        {!isHost && needsPlayback && (
          <div className="player-empty overlay playback-gate"><div>
            <strong>Ready to watch</strong>
            <p>Your browser needs one click before it can play sound.</p>
            <button className="btn btn-primary" onClick={onResumePlayback}>Play screen share</button>
          </div></div>
        )}
      </div>

      <div className="player-toolbar">
        <div className="screen-status">
          <span className={`sync-dot ${roomConnected && (hasStream || !isLive) ? '' : 'offline'}`} />
          <span>{isLive ? (connected || isHost ? 'Live' : 'Connecting…') : 'Ready'}</span>
          {!isHost && isLive && <span className="watching-title">{title || 'Screen share'}</span>}
        </div>

        <div className="media-controls">
          {isHost && (
            <label className="quality-control">
              <span>Quality</span>
              <select value={quality} onChange={(event) => onQualityChange(event.target.value)}>
                {Object.entries(qualityProfiles).map(([value, profile]) => (
                  <option value={value} key={value}>{profile.label}</option>
                ))}
              </select>
            </label>
          )}
          {!isHost && isLive && (
            <>
              <button className="icon-button" onClick={() => setSoundMuted((value) => !value)} aria-label={soundMuted ? 'Unmute screen audio' : 'Mute screen audio'}>
                {soundMuted ? '🔇' : '🔊'}
              </button>
              <label className="compact-slider" title="Screen volume">
                <span>Volume</span>
                <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
              </label>
            </>
          )}
          <label className="compact-slider color-slider" title="Adjust shared-screen color intensity">
            <span>Color {saturation}%</span>
            <input type="range" min="50" max="120" step="1" value={saturation} onChange={(event) => setSaturation(Number(event.target.value))} />
          </label>
          <button className="icon-button fullscreen-button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
            {fullscreen ? '↙' : '⛶'} <span>{fullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      <div className="player-controls">
        {isHost ? (
          <>
            {!sharing ? <button className="btn btn-primary" onClick={onStart}>Share my screen</button> : <button className="btn btn-secondary" onClick={onStop}>Stop sharing</button>}
            <span className="time-readout">{sharing ? 'Your selected screen is being broadcast' : 'Share a browser tab for the best audio'}</span>
          </>
        ) : (
          <span className="time-readout">{isLive ? 'Use the controls above for volume, color, and fullscreen.' : 'Waiting for host'}</span>
        )}
      </div>

      {error && <div className="error-banner screen-error">{error}</div>}

      {isHost && (
        <div className="screen-tips"><strong>Tips for best quality</strong><ul>
          <li>Choose a <em>browser tab</em> and enable “Share tab audio”.</li>
          <li>The color control compensates for displays or browsers that over-saturate captured video.</li>
          <li>DRM-protected services may block capture and display a black screen.</li>
        </ul></div>
      )}
    </div>
  );
}
