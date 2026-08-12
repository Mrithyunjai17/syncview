export default function VoiceChat({ voice, members = [] }) {
  const participants = members.filter((member) => member.voiceEnabled);

  return (
    <section className="voice-panel" aria-label="Voice chat">
      <div className="voice-summary">
        <div>
          <strong>Live voice chat</strong>
          <span>{participants.length} in voice</span>
        </div>
        <span className={`sync-dot ${voice.joined ? '' : 'offline'}`} />
      </div>

      <div className="voice-people">
        {participants.length === 0 ? (
          <span className="voice-empty">No one has joined voice yet.</span>
        ) : (
          participants.map((member) => (
            <span className="voice-person" key={member.id}>{member.name}</span>
          ))
        )}
      </div>

      <div className="voice-actions">
        {!voice.joined ? (
          <button className="btn btn-primary" onClick={voice.joinVoice}>Join voice</button>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={voice.toggleMute}>
              {voice.muted ? 'Unmute mic' : 'Mute mic'}
            </button>
            <button className="btn btn-ghost" onClick={voice.leaveVoice}>Leave voice</button>
          </>
        )}
        {voice.blockedAudio && (
          <button className="btn btn-primary" onClick={voice.resumeAudio}>Enable voice audio</button>
        )}
      </div>

      {voice.joined && (
        <small>{voice.connectedPeers} peer{voice.connectedPeers === 1 ? '' : 's'} connected</small>
      )}
      {voice.error && <div className="error-banner">{voice.error}</div>}
    </section>
  );
}
