import { useCallback, useEffect, useRef, useState } from 'react';

function getIceServers() {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl.split(',').map((url) => url.trim()),
      username: import.meta.env.VITE_TURN_USERNAME || '',
      credential: import.meta.env.VITE_TURN_CREDENTIAL || '',
    });
  }
  return { iceServers };
}

const RTC_CONFIG = getIceServers();

export function useScreenShare({ socket, isHost, screenShare }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef(new Map());
  const hostPcRef = useRef(null);
  const pendingHostIceRef = useRef(new Map());
  const pendingViewerIceRef = useRef([]);
  const requestedShareRef = useRef(null);
  const stoppingRef = useRef(false);

  const [sharing, setSharing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [needsPlayback, setNeedsPlayback] = useState(false);
  const [error, setError] = useState('');

  const closePeer = useCallback((viewerId) => {
    const pc = peersRef.current.get(viewerId);
    if (pc) pc.close();
    peersRef.current.delete(viewerId);
    pendingHostIceRef.current.delete(viewerId);
    setConnected(
      [...peersRef.current.values()].some((peer) => peer.connectionState === 'connected'),
    );
  }, []);

  const cleanupPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    pendingHostIceRef.current.clear();
    pendingViewerIceRef.current = [];
    if (hostPcRef.current) hostPcRef.current.close();
    hostPcRef.current = null;
  }, []);

  const clearMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const stopSharing = useCallback(() => {
    if (!isHost || stoppingRef.current) return;
    stoppingRef.current = true;
    clearMedia();
    cleanupPeers();
    setSharing(false);
    setConnected(false);
    setNeedsPlayback(false);
    socket?.emit('screen:stop', {}, () => {
      stoppingRef.current = false;
    });
    if (!socket) stoppingRef.current = false;
  }, [socket, isHost, clearMedia, cleanupPeers]);

  const createHostPeer = useCallback(async (viewerId) => {
    const stream = streamRef.current;
    if (!socket || !stream || !viewerId) return;
    closePeer(viewerId);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(viewerId, pc);
    pendingHostIceRef.current.set(viewerId, []);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('webrtc:ice-candidate', { to: viewerId, candidate });
    };
    pc.onconnectionstatechange = () => {
      setConnected(
        [...peersRef.current.values()].some((peer) => peer.connectionState === 'connected'),
      );
      if (['failed', 'closed'].includes(pc.connectionState)) closePeer(viewerId);
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc:offer', { to: viewerId, offer: pc.localDescription });
    } catch {
      closePeer(viewerId);
    }
  }, [socket, closePeer]);

  const startSharing = useCallback(async () => {
    if (!socket || !isHost || sharing) return;
    setError('');

    if (!window.isSecureContext) {
      setError('Screen sharing requires HTTPS. Open the secure https:// version of this site.');
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('This browser does not support screen sharing. Try the latest Chrome, Edge, or Firefox on a computer.');
      return;
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: true,
          preferCurrentTab: true,
          selfBrowserSurface: 'exclude',
          systemAudio: 'include',
        });
      } catch (captureError) {
        // Some browsers reject newer display-capture hints instead of ignoring them.
        // Retry with the baseline standard constraints so their native picker opens.
        if (['TypeError', 'OverconstrainedError'].includes(captureError?.name)) {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } else {
          throw captureError;
        }
      }
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch(() => {});
      }
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) videoTrack.onended = stopSharing;

      socket.emit('screen:start', { title: 'Live screen share' }, (response) => {
        if (!response?.ok) {
          setError(response?.error || 'Could not start screen sharing.');
          clearMedia();
          return;
        }
        setSharing(true);
      });
    } catch (captureError) {
      const errorName = captureError?.name || 'UnknownError';
      const messages = {
        NotAllowedError: 'Screen sharing was cancelled or blocked. Check the site permissions, then click Share my screen again.',
        NotFoundError: 'No shareable screen or window was found. Check your operating-system screen-recording permission.',
        NotReadableError: 'The browser could not capture the selected screen. Close other screen-recording apps and try again.',
        AbortError: 'The browser stopped screen selection before it completed. Please try again.',
        InvalidStateError: 'Screen sharing must be started from this button in the active browser tab. Focus this tab and try again.',
      };
      setError(messages[errorName] || `Screen capture failed (${errorName}). Try Chrome or Edge and check browser screen-sharing permissions.`);
    }
  }, [socket, isHost, sharing, stopSharing, clearMedia]);

  const resumePlayback = useCallback(async () => {
    try {
      await remoteVideoRef.current?.play();
      setNeedsPlayback(false);
    } catch {
      setError('Your browser still blocked playback. Allow audio for this site and try again.');
    }
  }, []);

  useEffect(() => {
    if (!socket || !isHost) return undefined;
    const onViewerReady = ({ viewerId }) => createHostPeer(viewerId);
    const onAnswer = async ({ from, answer }) => {
      const pc = peersRef.current.get(from);
      if (!pc || !answer || pc.signalingState === 'closed') return;
      try {
        await pc.setRemoteDescription(answer);
        const queued = pendingHostIceRef.current.get(from) || [];
        for (const candidate of queued) await pc.addIceCandidate(candidate);
        pendingHostIceRef.current.set(from, []);
      } catch {
        closePeer(from);
      }
    };
    const onIce = async ({ from, candidate }) => {
      const pc = peersRef.current.get(from);
      if (!pc || !candidate) return;
      if (!pc.remoteDescription) {
        const queue = pendingHostIceRef.current.get(from) || [];
        queue.push(candidate);
        pendingHostIceRef.current.set(from, queue);
        return;
      }
      await pc.addIceCandidate(candidate).catch(() => {});
    };
    socket.on('webrtc:viewer-ready', onViewerReady);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice-candidate', onIce);
    return () => {
      socket.off('webrtc:viewer-ready', onViewerReady);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice-candidate', onIce);
    };
  }, [socket, isHost, createHostPeer, closePeer]);

  useEffect(() => {
    if (!socket || isHost) return undefined;
    const onOffer = async ({ from, offer }) => {
      if (!offer) return;
      if (hostPcRef.current) hostPcRef.current.close();
      const pc = new RTCPeerConnection(RTC_CONFIG);
      hostPcRef.current = pc;
      pc.ontrack = async ({ streams }) => {
        const stream = streams[0];
        if (!stream || !remoteVideoRef.current) return;
        remoteVideoRef.current.srcObject = stream;
        try {
          await remoteVideoRef.current.play();
          setNeedsPlayback(false);
        } catch {
          setNeedsPlayback(true);
        }
      };
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('webrtc:ice-candidate', { to: from, candidate });
      };
      pc.onconnectionstatechange = () => {
        setConnected(pc.connectionState === 'connected');
        if (pc.connectionState === 'failed') {
          setError('Could not reach the host. A TURN server may be required for this network.');
          requestedShareRef.current = null;
          window.setTimeout(() => socket.emit('webrtc:viewer-ready', {}), 1500);
        }
      };
      try {
        await pc.setRemoteDescription(offer);
        for (const candidate of pendingViewerIceRef.current) await pc.addIceCandidate(candidate);
        pendingViewerIceRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', { to: from, answer: pc.localDescription });
      } catch {
        setError('The screen-share connection could not be negotiated. Please retry.');
      }
    };
    const onIce = async ({ candidate }) => {
      const pc = hostPcRef.current;
      if (!candidate) return;
      if (!pc?.remoteDescription) {
        pendingViewerIceRef.current.push(candidate);
        return;
      }
      await pc.addIceCandidate(candidate).catch(() => {});
    };
    const onStopped = () => {
      cleanupPeers();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      requestedShareRef.current = null;
      setConnected(false);
      setNeedsPlayback(false);
    };
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:ice-candidate', onIce);
    socket.on('screen:stopped', onStopped);
    return () => {
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:ice-candidate', onIce);
      socket.off('screen:stopped', onStopped);
    };
  }, [socket, isHost, cleanupPeers]);

  useEffect(() => {
    if (!socket || isHost || !screenShare?.active) return;
    const shareId = screenShare.startedAt;
    if (requestedShareRef.current === shareId) return;
    requestedShareRef.current = shareId;
    socket.emit('webrtc:viewer-ready', {});
  }, [socket, isHost, screenShare?.active, screenShare?.startedAt]);

  useEffect(() => () => {
    clearMedia();
    cleanupPeers();
  }, [clearMedia, cleanupPeers]);

  return {
    localVideoRef,
    remoteVideoRef,
    sharing,
    connected,
    needsPlayback,
    error,
    startSharing,
    stopSharing,
    resumePlayback,
    isLive: Boolean(screenShare?.active),
  };
}
