import { AudioPresets, VideoPreset } from 'livekit-client';

/**
 * Screen-share quality options. The host uploads one stream to LiveKit, which
 * forwards it to every viewer, so these numbers do not grow with room size.
 */
export const SHARE_QUALITIES = {
  saver: {
    label: '720p',
    hint: 'Data saver',
    preset: new VideoPreset(1280, 720, 2_000_000, 30, 'high'),
  },
  hd: {
    label: '1080p',
    hint: 'Recommended',
    preset: new VideoPreset(1920, 1080, 4_500_000, 30, 'high'),
  },
  max: {
    label: '1080p+',
    hint: 'Best quality, needs fast upload',
    preset: new VideoPreset(1920, 1080, 8_000_000, 30, 'high'),
  },
};

export const DEFAULT_QUALITY = 'hd';

/** Capture settings for sharing a movie/show: smooth motion and tab audio. */
export function screenCaptureOptions(qualityKey) {
  const { preset } = SHARE_QUALITIES[qualityKey] || SHARE_QUALITIES[DEFAULT_QUALITY];
  return {
    audio: {
      // Movie audio must not be "cleaned up" like a voice: keep it untouched.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    resolution: preset.resolution,
    contentHint: 'motion',
    preferCurrentTab: false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    systemAudio: 'include',
    // Keep the shared tab audible for the host too.
    suppressLocalAudioPlayback: false,
  };
}

export function screenPublishOptions(qualityKey) {
  const { preset } = SHARE_QUALITIES[qualityKey] || SHARE_QUALITIES[DEFAULT_QUALITY];
  return {
    // VP9 gives the best quality per bit for screen content; LiveKit falls back
    // to VP8 automatically for any viewer whose browser can't decode it.
    videoCodec: 'vp9',
    backupCodec: true,
    screenShareEncoding: preset.encoding,
    degradationPreference: 'maintain-framerate',
    // Movie audio: high-quality stereo, no silence suppression.
    audioPreset: AudioPresets.musicHighQualityStereo,
    dtx: false,
    red: false,
    forceStereo: true,
  };
}

export const MIC_CAPTURE_OPTIONS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export const MIC_PUBLISH_OPTIONS = {
  audioPreset: AudioPresets.speech,
  dtx: true,
  // Redundant audio keeps voice intelligible on lossy networks.
  red: true,
};

export const ROOM_OPTIONS = {
  // Only download what is on screen, at the size it is shown.
  adaptiveStream: true,
  // Stop encoding layers nobody is watching.
  dynacast: true,
  disconnectOnPageLeave: true,
};

/** Friendly message for screen-capture failures. */
export function describeShareError(error) {
  const messages = {
    NotAllowedError: 'Screen sharing was cancelled or blocked by the browser.',
    NotFoundError: 'No screen or window was available to share. Check your OS screen-recording permission.',
    NotReadableError: 'The browser could not capture that screen. Close other recording apps and try again.',
    AbortError: 'Screen selection was interrupted. Try again.',
    NotSupportedError: 'This browser cannot share its screen. Use Chrome, Edge or Firefox on a computer.',
  };
  return messages[error?.name] || `Could not start sharing (${error?.name || error?.message || 'unknown error'}).`;
}
