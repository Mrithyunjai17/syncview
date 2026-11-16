function getIceServers() {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl.split(',').map((url) => url.trim()).filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME || '',
      credential: import.meta.env.VITE_TURN_CREDENTIAL || '',
    });
  }
  return iceServers;
}

/** Shared ICE configuration for screen-share and voice peer connections. */
export const RTC_CONFIG = { iceServers: getIceServers() };
