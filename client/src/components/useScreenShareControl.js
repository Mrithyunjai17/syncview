import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import {
  DEFAULT_QUALITY,
  SHARE_QUALITIES,
  describeShareError,
  screenCaptureOptions,
  screenPublishOptions,
} from '../lib/media.js';

const ShareContext = createContext(null);

function readQuality() {
  try {
    const stored = localStorage.getItem('syncview:quality');
    return SHARE_QUALITIES[stored] ? stored : DEFAULT_QUALITY;
  } catch {
    return DEFAULT_QUALITY;
  }
}

/** One place that owns screen-share state, used by the stage and the control bar. */
export function ShareProvider({ children }) {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quality, setQualityState] = useState(readQuality);

  const supported = Boolean(navigator.mediaDevices?.getDisplayMedia) && window.isSecureContext;

  const setQuality = useCallback((next) => {
    if (!SHARE_QUALITIES[next]) return;
    setQualityState(next);
    try {
      localStorage.setItem('syncview:quality', next);
    } catch {
      // ignore
    }
  }, []);

  const start = useCallback(async () => {
    if (busy) return;
    setError('');
    if (!window.isSecureContext) {
      setError('Screen sharing needs HTTPS. Open the https:// address of this site.');
      return;
    }
    setBusy(true);
    try {
      await localParticipant.setScreenShareEnabled(
        true,
        screenCaptureOptions(quality),
        screenPublishOptions(quality),
      );
    } catch (err) {
      // Closing the picker is a normal choice, not an error worth shouting about.
      if (err?.name !== 'NotAllowedError') setError(describeShareError(err));
    } finally {
      setBusy(false);
    }
  }, [busy, localParticipant, quality]);

  const stop = useCallback(async () => {
    setError('');
    await localParticipant.setScreenShareEnabled(false).catch(() => {});
  }, [localParticipant]);

  const value = useMemo(() => ({
    sharing: isScreenShareEnabled,
    busy,
    error,
    supported,
    quality,
    setQuality,
    start,
    stop,
  }), [isScreenShareEnabled, busy, error, supported, quality, setQuality, start, stop]);

  return createElement(ShareContext.Provider, { value }, children);
}

export function useScreenShareControl() {
  const value = useContext(ShareContext);
  if (!value) throw new Error('useScreenShareControl must be used inside <ShareProvider>');
  return value;
}
