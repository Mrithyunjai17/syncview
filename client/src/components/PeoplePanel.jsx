import { useIsMuted, useIsSpeaking } from '@livekit/components-react';
import { Track } from 'livekit-client';
import Icon from './Icon.jsx';

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '?';
}

/** Stable, pleasant hue per person so avatars are easy to tell apart. */
function hue(identity) {
  let hash = 0;
  for (const char of identity) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function PersonRow({ participant }) {
  const speaking = useIsSpeaking(participant);
  const micMuted = useIsMuted({ participant, source: Track.Source.Microphone });
  const hasMic = Boolean(participant.getTrackPublication(Track.Source.Microphone));
  const sharing = Boolean(participant.getTrackPublication(Track.Source.ScreenShare));
  const name = participant.name || participant.identity;

  return (
    <li className={`person ${speaking ? 'speaking' : ''}`}>
      <span className="avatar" style={{ '--hue': hue(participant.identity) }}>{initials(name)}</span>
      <span className="person-name">
        {name}
        {participant.isLocal && <span className="muted"> (you)</span>}
        {sharing && <span className="tag">Sharing</span>}
      </span>
      <span className={`person-mic ${!hasMic || micMuted ? 'off' : ''}`} title={!hasMic || micMuted ? 'Muted' : 'Mic on'}>
        <Icon name={!hasMic || micMuted ? 'micOff' : 'mic'} size={16} />
      </span>
    </li>
  );
}

export default function PeoplePanel({ participants, voiceVolume, onVoiceVolume }) {
  return (
    <div className="people">
      <ul className="people-list">
        {participants.map((participant) => (
          <PersonRow key={participant.identity} participant={participant} />
        ))}
      </ul>
      <label className="voice-volume">
        <span>Voice volume</span>
        <input
          className="slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={voiceVolume}
          onChange={(e) => onVoiceVolume(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
