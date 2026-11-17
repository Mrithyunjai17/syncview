import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export default function ChatPanel({ chat }) {
  const { chatMessages, send, isSending } = chat;
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chatMessages.length]);

  const submit = async (event) => {
    event.preventDefault();
    const message = text.trim();
    if (!message || isSending) return;
    setText('');
    try {
      await send(message);
    } catch {
      setText(message);
    }
  };

  return (
    <div className="chat">
      <ol className="chat-list" ref={listRef} aria-live="polite">
        {chatMessages.length === 0 && (
          <li className="chat-empty muted">Messages are only seen by people in the room right now.</li>
        )}
        {chatMessages.map((msg) => (
          <li key={msg.id ?? msg.timestamp} className={`chat-msg ${msg.from?.isLocal ? 'mine' : ''}`}>
            <div className="chat-meta">
              <strong>{msg.from?.isLocal ? 'You' : msg.from?.name || msg.from?.identity || 'Someone'}</strong>
              <time>{timeFormat.format(msg.timestamp)}</time>
            </div>
            <p>{msg.message}</p>
          </li>
        ))}
      </ol>
      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message"
          maxLength={500}
          aria-label="Message"
        />
        <button className="icon-btn send" disabled={!text.trim() || isSending} aria-label="Send">
          <Icon name="send" size={18} />
        </button>
      </form>
    </div>
  );
}
