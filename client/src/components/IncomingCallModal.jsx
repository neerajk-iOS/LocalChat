import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useCall } from '../contexts/CallContext.jsx';

export default function IncomingCallModal() {
  const { callState, callType, callPeer, acceptCall, rejectCall } = useCall();
  const audioRef = useRef(null);

  // Play ringtone while ringing
  useEffect(() => {
    if (callState !== 'incoming') return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let stopped = false;
    let nextTime = ctx.currentTime;

    function ringBell() {
      if (stopped) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, nextTime);
      osc.frequency.setValueAtTime(660, nextTime + 0.15);
      gain.gain.setValueAtTime(0.4, nextTime);
      gain.gain.linearRampToValueAtTime(0, nextTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(nextTime);
      osc.stop(nextTime + 0.35);
      nextTime += 1.2;
      setTimeout(ringBell, 1200);
    }
    ringBell();

    return () => {
      stopped = true;
      ctx.close();
    };
  }, [callState]);

  if (callState !== 'incoming') return null;

  const isVideo = callType === 'video';

  const initials = callPeer?.display_name?.slice(0, 2).toUpperCase() || '??';

  return (
    <div className="incoming-call-backdrop">
      <div className="incoming-call-card">
        <div className="incoming-call-type-badge">
          {isVideo ? <Video size={14} /> : <Phone size={14} />}
          {isVideo ? 'Incoming video call' : 'Incoming audio call'}
        </div>

        <div className="incoming-call-avatar-wrap">
          {callPeer?.avatar_url ? (
            <img
              src={`http://${location.hostname}:3000${callPeer.avatar_url}`}
              alt={callPeer.display_name}
              className="incoming-call-avatar-img"
            />
          ) : (
            <div className="incoming-call-avatar-fallback">{initials}</div>
          )}
          <span className="incoming-call-pulse" />
        </div>

        <div className="incoming-call-name">{callPeer?.display_name}</div>

        <div className="incoming-call-actions">
          <button className="call-action-btn reject" onClick={rejectCall} title="Decline">
            <PhoneOff size={24} />
          </button>
          <button className="call-action-btn accept" onClick={acceptCall} title="Accept">
            {isVideo ? <Video size={24} /> : <Phone size={24} />}
          </button>
        </div>
      </div>
    </div>
  );
}
