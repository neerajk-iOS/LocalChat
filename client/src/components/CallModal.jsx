import { useEffect, useRef, useCallback } from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useCall } from '../contexts/CallContext.jsx';

function fmtDuration(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function CallAvatar({ user, size = 96 }) {
  const initials = user?.display_name?.slice(0, 2).toUpperCase() || '??';
  if (user?.avatar_url) {
    // Use location.origin so it works through the Vite HTTPS proxy too
    const src = user.avatar_url.startsWith('http')
      ? user.avatar_url
      : `${location.origin}${user.avatar_url}`;
    return (
      <img src={src} alt={user.display_name} className="call-avatar-img"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="call-avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.35 }}>
      {initials}
    </div>
  );
}

export default function CallModal() {
  const {
    callState, callType, callPeer,
    localStream, remoteStream,
    isMuted, isCamOff, duration,
    endCall, toggleMute, toggleCamera,
  } = useCall();

  // Use callback refs so srcObject is set the instant the element mounts,
  // regardless of whether localStream / remoteStream was already set.
  const localStreamRef  = useRef(localStream);
  const remoteStreamRef = useRef(remoteStream);
  localStreamRef.current  = localStream;
  remoteStreamRef.current = remoteStream;

  // Callback ref for local video (PIP)
  const setLocalVideoEl = useCallback((el) => {
    if (el && localStreamRef.current) el.srcObject = localStreamRef.current;
  }, []);

  // Callback ref for remote video (main)
  const setRemoteVideoEl = useCallback((el) => {
    if (el && remoteStreamRef.current) el.srcObject = remoteStreamRef.current;
  }, []);

  // Callback ref for remote audio (audio-only calls)
  const setRemoteAudioEl = useCallback((el) => {
    if (el && remoteStreamRef.current) el.srcObject = remoteStreamRef.current;
  }, []);

  // These effects handle the case where the stream changes AFTER the element mounts.
  // Both localStream and remoteStream can arrive before OR after the video elements
  // exist (depending on caller vs. receiver path), so we cover both directions.
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const combinedLocalVideoRef = useCallback((el) => {
    localVideoRef.current = el;
    setLocalVideoEl(el);
  }, [setLocalVideoEl]);

  const combinedRemoteVideoRef = useCallback((el) => {
    remoteVideoRef.current = el;
    setRemoteVideoEl(el);
  }, [setRemoteVideoEl]);

  const combinedRemoteAudioRef = useCallback((el) => {
    remoteAudioRef.current = el;
    setRemoteAudioEl(el);
  }, [setRemoteAudioEl]);

  // Sync streams to elements when stream state changes after element is already mounted
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    // For audio calls: pipe remote stream into the hidden <audio> element
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (callState !== 'calling' && callState !== 'active') return null;

  const isVideo   = callType === 'video';
  const isCalling = callState === 'calling';

  return (
    <div className={`call-overlay ${isVideo ? 'call-video' : 'call-audio'}`}>

      {/* ── Hidden audio element — plays remote audio for AUDIO calls ── */}
      {/* Even video calls benefit from a backup audio element           */}
      <audio ref={combinedRemoteAudioRef} autoPlay style={{ display: 'none' }} />

      {/* ── Video layout (video calls only) ─────────────────────────── */}
      {isVideo && (
        <>
          <video ref={combinedRemoteVideoRef} className="call-remote-video"
            autoPlay playsInline />
          <video ref={combinedLocalVideoRef}  className="call-local-pip"
            autoPlay playsInline muted />
        </>
      )}

      {/* ── Center panel: avatar + name + status (audio calls & ringing) */}
      <div className="call-center">
        {(!isVideo || isCalling) && (
          <>
            <div className="call-rings">
              <div className="call-ring ring-1" />
              <div className="call-ring ring-2" />
              <div className="call-ring ring-3" />
              <CallAvatar user={callPeer} size={96} />
            </div>
            <div className="call-peer-name">{callPeer?.display_name}</div>
            <div className="call-status-label">
              {isCalling
                ? (isVideo ? 'Video calling…' : 'Calling…')
                : fmtDuration(duration)}
            </div>
          </>
        )}

        {/* Active audio: show duration under avatar */}
        {!isVideo && callState === 'active' && (
          <div className="call-duration-badge">{fmtDuration(duration)}</div>
        )}
      </div>

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div className="call-controls">
        <button className={`call-btn ${isMuted ? 'call-btn-active' : ''}`}
          onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        {isVideo && (
          <button className={`call-btn ${isCamOff ? 'call-btn-active' : ''}`}
            onClick={toggleCamera} title={isCamOff ? 'Camera On' : 'Camera Off'}>
            {isCamOff ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
        )}

        <button className="call-btn call-btn-end" onClick={() => endCall(true)} title="End call">
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );
}
