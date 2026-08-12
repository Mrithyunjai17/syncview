function initials(name = '?') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function VoiceChat({ voice, members = [] }) {
  const participants = members.filter((member) => member.voiceEnabled);

  return (
    <section className="voice-panel" aria-label="Voice chat">
      <div className="voice-summary">
        <div>
          <strong>Live voice room</strong>
          <span>{participants.length} participant{participants.length === 1 ? '' : 's'}</span>
        </div>
        <span className={`voice-room-status ${voice.joined ? 'online' : ''}`}>
          {voice.joined ? 'Connected' : 'Not joined'}
        </span>
      </div>

      <div className="voice-roster">
        {participants.length === 0 ? (
          <div className="voice-empty-state">
            <span className="empty-avatar">+</span>
            <div><strong>Voice room is empty</strong><span>Join and invite your friends to talk.</span></div>
          </div>
        ) : (
          participants.map((member) => {
            const speaking = voice.speakingIds.has(member.id) && !member.voiceMuted;
            const isYou = member.id === voice.selfId;
            return (
              <div className={`voice-member ${speaking ? 'speaking' : ''}`} key={member.id}>
                <div className="voice-avatar" aria-hidden="true">
                  {initials(member.name)}
                  <span className={`activity-ring ${speaking ? 'active' : ''}`} />
                </div>
                <div className="voice-member-info">
                  <strong>{member.name}{isYou ? ' (You)' : ''}</strong>
                  <span>{member.voiceMuted ? 'Muted' : speaking ? 'Speaking' : 'Listening'}</span>
                </div>
                <span className={`mic-state ${member.voiceMuted ? 'muted' : speaking ? 'talking' : ''}`} title={member.voiceMuted ? 'Muted' : speaking ? 'Speaking' : 'Microphone on'}>
                  {member.voiceMuted ? '🔇' : '🎙'}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="voice-actions">
        {!voice.joined ? (
          <button className="btn btn-primary" onClick={voice.joinVoice}>Join voice</button>
        ) : (
          <>
            <button className={`btn ${voice.muted ? 'btn-primary' : 'btn-secondary'}`} onClick={voice.toggleMute}>
              {voice.muted ? '🎙 Unmute' : '🔇 Mute'}
            </button>
            <button className="btn btn-ghost" onClick={voice.leaveVoice}>Leave voice</button>
          </>
        )}
        {voice.blockedAudio && <button className="btn btn-primary" onClick={voice.resumeAudio}>Enable voice audio</button>}
      </div>

      {voice.joined && <small>{voice.connectedPeers} voice connection{voice.connectedPeers === 1 ? '' : 's'} active</small>}
      {voice.error && <div className="error-banner">{voice.error}</div>}
    </section>
  );
}
