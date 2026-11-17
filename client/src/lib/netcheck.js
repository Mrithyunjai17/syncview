/**
 * Quick check of whether this browser can open WebRTC network paths at all.
 * Used when a room connection stalls, so we can tell the person *why*.
 *
 * - host:  local network candidates (the browser could open a socket)
 * - srflx: public address via STUN (direct UDP to the internet works)
 */
export async function probeNetwork(timeoutMs = 6000) {
  if (typeof RTCPeerConnection === 'undefined') return { supported: false, host: 0, srflx: 0 };
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
  });
  const counts = { supported: true, host: 0, srflx: 0 };
  try {
    pc.createDataChannel('probe');
    pc.onicecandidate = (event) => {
      const type = event.candidate?.candidate?.split(' ')[7];
      if (type === 'host') counts.host += 1;
      if (type === 'srflx') counts.srflx += 1;
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      };
    });
  } catch {
    // Treat any failure as "could not gather".
  } finally {
    pc.close();
  }
  return counts;
}

/** Plain-language explanation for a stalled connection, based on the probe. */
export function explainStall(result) {
  const isFirefox = /firefox/i.test(navigator.userAgent);
  if (!result.supported) {
    return {
      title: 'This browser can’t make calls',
      body: 'Live video and voice aren’t available in this browser. Open the link in Chrome, Edge, Firefox or Safari.',
    };
  }
  if (result.host === 0) {
    return {
      title: `${isFirefox ? 'Firefox is' : 'Your browser is'} blocked from making media connections`,
      body:
        'Something on this computer stops the browser from opening the network connections that live video and voice need. '
        + 'This is usually antivirus or firewall software (for example Kaspersky, Norton or ESET) or a strict VPN. '
        + `Allow ${isFirefox ? 'Firefox' : 'this browser'} in that software, or open the link in ${isFirefox ? 'Chrome or Edge' : 'another browser'}.`,
    };
  }
  return {
    title: 'Your network is slowing the connection',
    body:
      'Your network blocks direct connections, so the app is routing through a relay. '
      + 'That can take a few extra seconds. If it doesn’t connect, try another network or turn off your VPN.',
  };
}
