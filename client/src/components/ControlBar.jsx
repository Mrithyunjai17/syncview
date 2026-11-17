import { useState } from 'react';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import Icon from './Icon.jsx';
import { useScreenShareControl } from './useScreenShareControl.js';
import { MIC_CAPTURE_OPTIONS, MIC_PUBLISH_OPTIONS, SHARE_QUALITIES } from '../lib/media.js';

export default function ControlBar({ onToggleChat, onTogglePeople, chatActive, peopleActive, unread, peopleCount }) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const share = useScreenShareControl();
  const [micBusy, setMicBusy] = useState(false);
  const [micError, setMicError] = useState('');

  const toggleMic = async () => {
    setMicBusy(true);
    setMicError('');
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled, MIC_CAPTURE_OPTIONS, MIC_PUBLISH_OPTIONS);
    } catch (err) {
      setMicError(
        err?.name === 'NotAllowedError'
          ? 'Microphone access is blocked. Allow it in the address bar, then try again.'
          : 'Could not start your microphone.',
      );
    } finally {
      setMicBusy(false);
    }
  };

  const error = micError || (share.sharing ? '' : share.error);

  return (
    <footer className="control-bar">
      {error && <p className="control-error" role="alert">{error}</p>}

      <div className="control-group">
        <button
          className={`ctl ${isMicrophoneEnabled ? 'on' : 'off'}`}
          onClick={toggleMic}
          disabled={micBusy}
          aria-pressed={isMicrophoneEnabled}
        >
          <Icon name={isMicrophoneEnabled ? 'mic' : 'micOff'} />
          <span>{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span>
        </button>

        <div className="share-group">
          <button
            className={`ctl ${share.sharing ? 'active' : ''}`}
            onClick={share.sharing ? share.stop : share.start}
            disabled={share.busy || (!share.supported && !share.sharing)}
            title={share.supported ? undefined : 'Screen sharing needs Chrome, Edge or Firefox on a computer'}
          >
            <Icon name={share.sharing ? 'screenOff' : 'screen'} />
            <span>{share.sharing ? 'Stop share' : 'Share'}</span>
          </button>
          <select
            className="quality-select"
            value={share.quality}
            onChange={(e) => share.setQuality(e.target.value)}
            disabled={share.sharing || share.busy}
            aria-label="Share quality"
            title={share.sharing ? 'Stop sharing to change quality' : 'Share quality'}
          >
            {Object.entries(SHARE_QUALITIES).map(([key, q]) => (
              <option key={key} value={key}>{q.label} · {q.hint}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="control-group">
        <button className={`ctl ${chatActive ? 'active' : ''}`} onClick={onToggleChat} aria-pressed={chatActive}>
          <Icon name="chat" />
          <span>Chat</span>
          {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button className={`ctl ${peopleActive ? 'active' : ''}`} onClick={onTogglePeople} aria-pressed={peopleActive}>
          <Icon name="users" />
          <span>{peopleCount}</span>
        </button>
        <button className="ctl leave" onClick={() => room.disconnect()}>
          <Icon name="leave" />
          <span>Leave</span>
        </button>
      </div>
    </footer>
  );
}
