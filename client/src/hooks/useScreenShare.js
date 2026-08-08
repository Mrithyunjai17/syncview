import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function useScreenShare({ socket, isHost, screenShare, members }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef(new Map());
  const hostPcRef = useRef(null);

  const [sharing, setSharing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  const cleanupPeers = useCallback(() => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    if (hostPcRef.current) {
      hostPcRef.current.close();
      hostPcRef.current = null;
    }
  }, []);

  const stopLocalStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const stopSharing = useCallback(() => {
    if (!socket || !isHost) return;
    stopLocalStream();
    cleanupPeers();
    setSharing(false);
    setConnected(false);
    socket.emit('screen:stop', {}, () => {});
  }, [socket, isHost, stopLocalStream, cleanupPeers]);

  const attachLocalPreview = useCallback((stream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(() => {});
    }
  }, []);

  const createHostPeer = useCallback(
    async (viewerId, stream) => {
      if (peersRef.current.has(viewerId)) {
        peersRef.current.get(viewerId).close();
        peersRef.current.delete(viewerId);
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc:ice-candidate', { to: viewerId, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setConnected(true);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          pc.close();
          peersRef.current.delete(viewerId);
        }
      };

      peersRef.current.set(viewerId, pc);

      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);
      socket.emit('webrtc:offer', { to: viewerId, offer: pc.localDescription });
    },
    [socket],
  );

  const connectToExistingViewers = useCallback(
    (stream) => {
      if (!socket || !members) return;
      members
        .filter((member) => member.id !== socket.id)
        .forEach((member) => {
          createHostPeer(member.id, stream);
        });
    },
    [socket, members, createHostPeer],
  );

  const startSharing = useCallback(async () => {
    if (!socket || !isHost || sharing) return;
    setError('');

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
        },
        audio: true,
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'include',
      });

      streamRef.current = stream;
      attachLocalPreview(stream);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => stopSharing();
      }

      socket.emit('screen:start', { title: 'Live screen share' }, (response) => {
        if (!response?.ok) {
          setError(response?.error || 'Could not start screen share');
          stopLocalStream();
          return;
        }
        setSharing(true);
        connectToExistingViewers(stream);
      });
    } catch {
      setError('Screen share was blocked. Choose a screen, window, or browser tab when prompted.');
    }
  }, [
    socket,
    isHost,
    sharing,
    attachLocalPreview,
    stopSharing,
    stopLocalStream,
    connectToExistingViewers,
  ]);

  useEffect(() => {
    if (!socket || !isHost || !sharing || !streamRef.current) return undefined;

    const onViewerReady = ({ viewerId }) => {
      if (viewerId && streamRef.current) {
        createHostPeer(viewerId, streamRef.current);
      }
    };

    socket.on('webrtc:viewer-ready', onViewerReady);
    return () => socket.off('webrtc:viewer-ready', onViewerReady);
  }, [socket, isHost, sharing, createHostPeer]);

  useEffect(() => {
    if (!socket || !isHost || !sharing) return undefined;

    const onAnswer = async ({ from, answer }) => {
      const pc = peersRef.current.get(from);
      if (!pc || !answer) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    };

    const onIce = async ({ from, candidate }) => {
      const pc = peersRef.current.get(from);
      if (!pc || !candidate) return;
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    };

    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice-candidate', onIce);

    return () => {
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice-candidate', onIce);
    };
  }, [socket, isHost, sharing]);

  useEffect(() => {
    if (!socket || isHost) return undefined;

    const onOffer = async ({ from, offer }) => {
      if (!offer) return;

      if (hostPcRef.current) {
        hostPcRef.current.close();
        hostPcRef.current = null;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      hostPcRef.current = pc;

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(() => {});
          setConnected(true);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc:ice-candidate', { to: from, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setConnected(false);
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc:answer', { to: from, answer: pc.localDescription });
    };

    const onIce = async ({ from, candidate }) => {
      const pc = hostPcRef.current;
      if (!pc || !candidate) return;
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    };

    const onStarted = () => {
      socket.emit('webrtc:viewer-ready', {});
    };

    const onStopped = () => {
      cleanupPeers();
      stopLocalStream();
      setConnected(false);
    };

    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:ice-candidate', onIce);
    socket.on('screen:started', onStarted);
    socket.on('screen:stopped', onStopped);

    if (screenShare?.active) {
      socket.emit('webrtc:viewer-ready', {});
    }

    return () => {
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:ice-candidate', onIce);
      socket.off('screen:started', onStarted);
      socket.off('screen:stopped', onStopped);
    };
  }, [socket, isHost, screenShare?.active, cleanupPeers, stopLocalStream]);

  useEffect(() => {
    if (isHost && !screenShare?.active && sharing) {
      stopLocalStream();
      cleanupPeers();
      setSharing(false);
      setConnected(false);
    }
  }, [isHost, screenShare?.active, sharing, stopLocalStream, cleanupPeers]);

  useEffect(() => {
    return () => {
      stopLocalStream();
      cleanupPeers();
    };
  }, [stopLocalStream, cleanupPeers]);

  return {
    localVideoRef,
    remoteVideoRef,
    sharing,
    connected,
    error,
    startSharing,
    stopSharing,
    isLive: Boolean(screenShare?.active),
  };
}
