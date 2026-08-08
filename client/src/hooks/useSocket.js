import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getServerUrl } from '../utils.js';

export function useSocket(roomId, userName) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    if (!roomId || !userName) return undefined;

    const client = io(getServerUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
    });
    setSocket(client);

    client.on('connect', () => {
      setConnected(true);
      client.emit('room:join', { roomId, name: userName }, (response) => {
        if (!response?.ok) {
          setJoinError(response?.error || 'Could not join room');
          return;
        }
        setRoom(response.room);
        setIsHost(response.youAreHost);
        setJoinError('');
      });
    });

    client.on('disconnect', () => setConnected(false));
    client.on('room:update', (updatedRoom) => {
      setRoom(updatedRoom);
      setIsHost(updatedRoom.hostId === client.id);
    });

    return () => {
      client.disconnect();
      setSocket(null);
    };
  }, [roomId, userName]);

  return {
    socket,
    connected,
    room,
    isHost,
    joinError,
    setRoom,
  };
}
