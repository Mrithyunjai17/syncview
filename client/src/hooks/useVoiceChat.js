import { useCallback, useEffect, useRef, useState } from 'react';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    ...(import.meta.env.VITE_TURN_URL
      ? [{
          urls: import.meta.env.VITE_TURN_URL.split(',').map((url) => url.trim()),
          username: import.meta.env.VITE_TURN_USERNAME || '',
          credential: import.meta.env.VITE_TURN_CREDENTIAL || '',
        }]
      : []),
  ],
};

async function tuneVoiceSender(sender) {
  if (sender.track?.kind !== 'audio') return;
  sender.track.contentHint = 'speech';
  const parameters = sender.getParameters();
  if (!parameters.encodings?.length) parameters.encodings = [{}];
  parameters.encodings[0].maxBitrate = 64_000;
  parameters.encodings[0].priority = 'high';
  parameters.encodings[0].networkPriority = 'high';
  try {
    await sender.setParameters(parameters);
  } catch {
    delete parameters.encodings[0].priority;
    delete parameters.encodings[0].networkPriority;
    await sender.setParameters(parameters).catch(() => {});
  }
}

export function useVoiceChat({ socket, members = [] }) {
  const streamRef = useRef(null);
  const peersRef = useRef(new Map());
  const audioRef = useRef(new Map());
  const pendingIceRef = useRef(new Map());
  const joinedRef = useRef(false);
  const activityTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const speakingRef = useRef(false);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [blockedAudio, setBlockedAudio] = useState(false);
  const [connectedPeers, setConnectedPeers] = useState(0);
  const [speakingIds, setSpeakingIds] = useState(() => new Set());

  const setSpeaking = useCallback((memberId, speaking) => {
    setSpeakingIds((current) => {
      const next = new Set(current);
      if (speaking) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  }, []);

  const stopActivityMonitor = useCallback(() => {
    if (activityTimerRef.current) window.clearInterval(activityTimerRef.current);
    activityTimerRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    speakingRef.current = false;
  }, []);

  const startActivityMonitor = useCallback((stream) => {
    stopActivityMonitor();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let quietTicks = 0;
    audioContextRef.current = context;
    activityTimerRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const active = Math.sqrt(sum / samples.length) > 0.035;
      quietTicks = active ? 0 : quietTicks + 1;
      const speaking = active || (speakingRef.current && quietTicks < 4);
      if (speaking === speakingRef.current) return;
      speakingRef.current = speaking;
      setSpeaking(socket.id, speaking);
      socket.emit('voice:activity', { speaking });
    }, 120);
  }, [socket, setSpeaking, stopActivityMonitor]);

  const updateConnectedCount = useCallback(() => {
    setConnectedPeers(
      [...peersRef.current.values()].filter((pc) => pc.connectionState === 'connected').length,
    );
  }, []);

  const closePeer = useCallback((peerId) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
    const audio = audioRef.current.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    audioRef.current.delete(peerId);
    updateConnectedCount();
  }, [updateConnectedCount]);

  const closeAllPeers = useCallback(() => {
    [...peersRef.current.keys()].forEach(closePeer);
  }, [closePeer]);

  const createPeer = useCallback((peerId) => {
    if (!socket || !streamRef.current) return null;
    const existing = peersRef.current.get(peerId);
    if (existing && existing.connectionState !== 'closed') return existing;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(peerId, pc);
    if (!pendingIceRef.current.has(peerId)) pendingIceRef.current.set(peerId, []);
    streamRef.current.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, streamRef.current);
      tuneVoiceSender(sender);
    });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('voice:signal', { to: peerId, type: 'ice', data: candidate });
    };
    pc.ontrack = async ({ streams }) => {
      const stream = streams[0];
      if (!stream) return;
      let audio = audioRef.current.get(peerId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audioRef.current.set(peerId, audio);
      }
      audio.srcObject = stream;
      try {
        await audio.play();
      } catch {
        setBlockedAudio(true);
      }
    };
    pc.onconnectionstatechange = () => {
      updateConnectedCount();
      if (['failed', 'closed'].includes(pc.connectionState)) closePeer(peerId);
    };
    return pc;
  }, [socket, closePeer, updateConnectedCount]);

  const makeOffer = useCallback(async (peerId) => {
    const pc = createPeer(peerId);
    if (!pc || pc.signalingState !== 'stable') return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice:signal', { to: peerId, type: 'offer', data: pc.localDescription });
    } catch {
      closePeer(peerId);
    }
  }, [socket, createPeer, closePeer]);

  const joinVoice = useCallback(async () => {
    if (!socket || joinedRef.current) return;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16,
          latency: { ideal: 0.02 },
        },
        video: false,
      });
      streamRef.current = stream;
      joinedRef.current = true;
      setJoined(true);
      setMuted(false);
      setSpeakingIds(new Set());
      startActivityMonitor(stream);
      socket.emit('voice:state', { enabled: true, muted: false });
    } catch {
      setError('Microphone access was blocked. Allow microphone permission and try again.');
    }
  }, [socket, startActivityMonitor]);

  const leaveVoice = useCallback(() => {
    joinedRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    socket?.emit('voice:activity', { speaking: false });
    stopActivityMonitor();
    closeAllPeers();
    socket?.emit('voice:state', { enabled: false, muted: false });
    setJoined(false);
    setMuted(false);
    setBlockedAudio(false);
    setConnectedPeers(0);
    setSpeakingIds(new Set());
  }, [socket, closeAllPeers, stopActivityMonitor]);

  const toggleMute = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const nextMuted = !track.enabled;
    setMuted(nextMuted);
    if (nextMuted) {
      speakingRef.current = false;
      setSpeaking(socket.id, false);
      socket.emit('voice:activity', { speaking: false });
    }
    socket.emit('voice:state', { enabled: true, muted: nextMuted });
  }, [socket, setSpeaking]);

  const resumeAudio = useCallback(async () => {
    const results = await Promise.allSettled(
      [...audioRef.current.values()].map((audio) => audio.play()),
    );
    setBlockedAudio(results.some((result) => result.status === 'rejected'));
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const onSignal = async ({ from, type, data }) => {
      if (!joinedRef.current || !from || !data) return;
      if (type === 'offer') {
        const pc = createPeer(from);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(data);
          const queued = pendingIceRef.current.get(from) || [];
          for (const candidate of queued) await pc.addIceCandidate(candidate);
          pendingIceRef.current.set(from, []);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voice:signal', { to: from, type: 'answer', data: pc.localDescription });
        } catch {
          closePeer(from);
        }
      } else if (type === 'answer') {
        const pc = peersRef.current.get(from);
        if (!pc || pc.signalingState !== 'have-local-offer') return;
        try {
          await pc.setRemoteDescription(data);
          const queued = pendingIceRef.current.get(from) || [];
          for (const candidate of queued) await pc.addIceCandidate(candidate);
          pendingIceRef.current.set(from, []);
        } catch {
          closePeer(from);
        }
      } else if (type === 'ice') {
        const pc = peersRef.current.get(from);
        if (!pc?.remoteDescription) {
          const queue = pendingIceRef.current.get(from) || [];
          queue.push(data);
          pendingIceRef.current.set(from, queue);
        } else {
          await pc.addIceCandidate(data).catch(() => {});
        }
      }
    };
    socket.on('voice:signal', onSignal);
    const onActivity = ({ memberId, speaking }) => setSpeaking(memberId, speaking);
    socket.on('voice:activity', onActivity);
    return () => {
      socket.off('voice:signal', onSignal);
      socket.off('voice:activity', onActivity);
    };
  }, [socket, createPeer, closePeer, setSpeaking]);

  useEffect(() => {
    if (!joined || !socket) return;
    const activePeerIds = new Set(
      members.filter((member) => member.voiceEnabled && member.id !== socket.id).map((member) => member.id),
    );
    [...peersRef.current.keys()].forEach((peerId) => {
      if (!activePeerIds.has(peerId)) closePeer(peerId);
    });
    activePeerIds.forEach((peerId) => {
      if (!peersRef.current.has(peerId) && socket.id < peerId) makeOffer(peerId);
    });
  }, [joined, socket, members, makeOffer, closePeer]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    stopActivityMonitor();
    closeAllPeers();
  }, [closeAllPeers, stopActivityMonitor]);

  return {
    joined,
    muted,
    error,
    blockedAudio,
    connectedPeers,
    speakingIds,
    selfId: socket?.id,
    joinVoice,
    leaveVoice,
    toggleMute,
    resumeAudio,
  };
}
