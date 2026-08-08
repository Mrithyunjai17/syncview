import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { formatTime } from '../utils.js';

const DRIFT_THRESHOLD = 0.35;
const SYNC_INTERVAL = 4000;

export default function SyncedVideoPlayer({ socket, isHost, playback, connected }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const suppressRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const loadSource = useCallback(
    (url) => {
      const video = videoRef.current;
      if (!video || !url) return;

      destroyHls();
      setReady(false);

      if (url.includes('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => setReady(true));
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setReady(false);
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          setReady(true);
        }
      } else {
        video.src = url;
        setReady(true);
      }
    },
    [destroyHls],
  );

  const applyPlaybackState = useCallback((state) => {
    const video = videoRef.current;
    if (!video || !state?.videoUrl) return;

    suppressRef.current = true;

    const targetTime = Number(state.currentTime) || 0;
    if (Math.abs(video.currentTime - targetTime) > DRIFT_THRESHOLD) {
      video.currentTime = targetTime;
    }

    video.playbackRate = state.playbackRate || 1;

    if (state.isPlaying) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }

    setCurrentTime(video.currentTime);
    setTimeout(() => {
      suppressRef.current = false;
    }, 150);
  }, []);

  useEffect(() => {
    if (!playback?.videoUrl) return;
    loadSource(playback.videoUrl);
  }, [playback?.videoUrl, loadSource]);

  useEffect(() => {
    if (!socket || isHost) return undefined;

    const onSync = (state) => applyPlaybackState(state);
    const onLoad = (state) => {
      loadSource(state.videoUrl);
      applyPlaybackState(state);
    };

    socket.on('playback:sync', onSync);
    socket.on('playback:load', onLoad);

    return () => {
      socket.off('playback:sync', onSync);
      socket.off('playback:load', onLoad);
    };
  }, [socket, isHost, applyPlaybackState, loadSource]);

  useEffect(() => {
    if (!socket || isHost || !connected) return undefined;

    const interval = setInterval(() => {
      socket.emit('playback:request-state', {}, (response) => {
        if (response?.ok) applyPlaybackState(response.playback);
      });
    }, SYNC_INTERVAL);

    return () => clearInterval(interval);
  }, [socket, isHost, connected, applyPlaybackState]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onDurationChange);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('loadedmetadata', onDurationChange);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, []);

  const broadcastSync = useCallback(
    (patch) => {
      if (!socket || !isHost || suppressRef.current) return;
      const video = videoRef.current;
      if (!video) return;

      socket.emit('playback:sync', {
        isPlaying: patch.isPlaying ?? !video.paused,
        currentTime: patch.currentTime ?? video.currentTime,
        playbackRate: video.playbackRate,
      });
    },
    [socket, isHost],
  );

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || !isHost) return;

    if (video.paused) {
      video.play().then(() => broadcastSync({ isPlaying: true }));
    } else {
      video.pause();
      broadcastSync({ isPlaying: false });
    }
  };

  const handleSeek = (value) => {
    const video = videoRef.current;
    if (!video || !isHost) return;
    video.currentTime = value;
    setCurrentTime(value);
    broadcastSync({ currentTime: value, isPlaying: !video.paused });
  };

  const hasVideo = Boolean(playback?.videoUrl);

  return (
    <div className="player-panel">
      <div className="player-shell">
        <video ref={videoRef} playsInline controls={false} />
        {!hasVideo && (
          <div className="player-empty">
            <div>
              <strong>No video loaded yet</strong>
              <p>{isHost ? 'Paste a video URL below to start the watch party.' : 'Waiting for the host to load a video.'}</p>
            </div>
          </div>
        )}
      </div>

      <div className="player-controls">
        <div className="control-group">
          <button className="btn btn-secondary" onClick={togglePlay} disabled={!isHost || !hasVideo || !ready}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <span className="time-readout">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="seek-bar control-group">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => handleSeek(Number(e.target.value))}
            disabled={!isHost || !hasVideo}
          />
        </div>

        <div className="sync-indicator">
          <span className={`sync-dot ${connected ? '' : 'offline'}`} />
          {connected ? 'Synced' : 'Reconnecting…'}
        </div>
      </div>
    </div>
  );
}
