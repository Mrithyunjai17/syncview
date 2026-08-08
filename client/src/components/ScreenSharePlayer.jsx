export default function ScreenSharePlayer({
  isHost,
  isLive,
  sharing,
  connected,
  error,
  title,
  localVideoRef,
  remoteVideoRef,
  onStart,
  onStop,
  roomConnected,
}) {
  const showPreview = isHost && sharing;
  const showRemote = !isHost && isLive;
  const videoRef = showPreview ? localVideoRef : remoteVideoRef;
  const hasStream = showPreview || (showRemote && connected);

  return (
    <div className="player-panel">
      <div className="player-shell">
        <video ref={videoRef} playsInline autoPlay controls={false} className="screen-video" />

        {!isLive && !sharing && (
          <div className="player-empty">
            <div>
              <strong>No screen share yet</strong>
              <p>
                {isHost
                  ? 'Click “Share my screen” to broadcast Netflix, YouTube, or anything on your screen.'
                  : 'Waiting for the host to start sharing their screen.'}
              </p>
            </div>
          </div>
        )}

        {isHost && sharing && (
          <div className="live-badge">
            <span className="live-dot" />
            You're live
          </div>
        )}

        {!isHost && isLive && !connected && (
          <div className="player-empty overlay">
            <div>
              <strong>Connecting to host…</strong>
              <p>The stream should appear in a few seconds.</p>
            </div>
          </div>
        )}
      </div>

      <div className="player-controls">
        {isHost ? (
          <>
            {!sharing ? (
              <button className="btn btn-primary" onClick={onStart}>
                Share my screen
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={onStop}>
                Stop sharing
              </button>
            )}
            <span className="time-readout">
              {sharing ? 'Pick the movie tab or full screen in the browser prompt' : 'Share a tab for best audio'}
            </span>
          </>
        ) : (
          <span className="time-readout">
            {isLive ? `Watching: ${title || 'Live screen share'}` : 'Waiting for host'}
          </span>
        )}

        <div className="sync-indicator">
          <span className={`sync-dot ${roomConnected && (hasStream || !isLive) ? '' : 'offline'}`} />
          {isHost
            ? sharing
              ? connected
                ? 'Viewers connected'
                : 'Waiting for viewers'
              : roomConnected
                ? 'Ready'
                : 'Reconnecting…'
            : isLive
              ? connected
                ? 'Live'
                : 'Connecting…'
              : roomConnected
                ? 'Ready'
                : 'Reconnecting…'}
        </div>
      </div>

      {error && <div className="error-banner screen-error">{error}</div>}

      {isHost && (
        <div className="screen-tips">
          <strong>Tips for best quality</strong>
          <ul>
            <li>Choose a <em>browser tab</em> when watching Netflix, Prime, or YouTube — this captures tab audio too.</li>
            <li>Turn on “Share tab audio” in the Chrome share dialog if prompted.</li>
            <li>Friends see a live view of your screen — no sync needed, they watch what you watch.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
