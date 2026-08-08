import { useEffect, useRef, useState } from 'react';

export default function ChatPanel({ socket, messages = [] }) {
  const [text, setText] = useState('');
  const [liveMessages, setLiveMessages] = useState(messages);
  const listRef = useRef(null);

  useEffect(() => {
    setLiveMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (!socket) return undefined;

    const onMessage = (message) => {
      setLiveMessages((prev) => [...prev, message]);
    };

    socket.on('chat:message', onMessage);
    return () => socket.off('chat:message', onMessage);
  }, [socket]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveMessages]);

  const sendMessage = (event) => {
    event.preventDefault();
    if (!socket || !text.trim()) return;

    socket.emit('chat:send', { text }, (response) => {
      if (response?.ok) setText('');
    });
  };

  return (
    <>
      <div className="chat-list" ref={listRef}>
        {liveMessages.map((message) => (
          <div
            key={message.id}
            className={`chat-message ${message.user === 'System' ? 'system' : ''}`}
          >
            {message.user !== 'System' && <div className="author">{message.user}</div>}
            <div>{message.text}</div>
            <div className="time">{new Date(message.at).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>

      <form className="chat-input-row" onSubmit={sendMessage}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something…"
          maxLength={500}
        />
        <button className="btn btn-primary" type="submit">
          Send
        </button>
      </form>
    </>
  );
}

export function MembersPanel({ members = [], isHost, socket, hostId }) {
  const transferHost = (targetId) => {
    if (!socket || !isHost) return;
    socket.emit('host:transfer', { targetId });
  };

  return (
    <div className="member-list">
      {members.map((member) => (
        <div key={member.id} className="member-item">
          <div>
            <div className="name">{member.name}</div>
            {member.id === hostId && <span className="pill pill-host">Host</span>}
          </div>
          {isHost && member.id !== hostId && (
            <button className="btn btn-ghost" onClick={() => transferHost(member.id)}>
              Make host
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
