import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './SocketContext.jsx';

const CallContext = createContext(null);

// For LAN-only use, direct connections usually work without STUN.
// STUN is included as fallback for edge cases.
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

export function CallProvider({ currentUser, children }) {
  const { socket } = useSocket();

  // 'idle' | 'calling' | 'incoming' | 'active'
  const [callState,    setCallState]    = useState('idle');
  const [callType,     setCallType]     = useState('audio'); // 'audio' | 'video'
  const [callPeer,     setCallPeer]     = useState(null);    // { id, display_name, avatar_url }
  const [localStream,  setLocalStream]  = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted,      setIsMuted]      = useState(false);
  const [isCamOff,     setIsCamOff]     = useState(false);
  const [duration,     setDuration]     = useState(0);
  const [callError,    setCallError]    = useState(null);

  const pcRef            = useRef(null);
  const localStreamRef   = useRef(null);
  const durationRef      = useRef(null);
  const pendingIceRef    = useRef([]);   // ICE candidates queued before remote desc is set
  const incomingOfferRef = useRef(null);
  const callStateRef     = useRef('idle');

  // Keep ref in sync so socket handlers always see the latest state
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // ── Helpers ──────────────────────────────────────────────

  const startTimer = () => {
    setDuration(0);
    durationRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  };

  const stopTimer = () => {
    clearInterval(durationRef.current);
    setDuration(0);
  };

  const stopLocalTracks = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
  };

  const closePeer = () => {
    pcRef.current?.close();
    pcRef.current = null;
    pendingIceRef.current = [];
  };

  // resetState does NOT clear callError so the error stays visible after reset
  const resetState = () => {
    stopTimer();
    stopLocalTracks();
    closePeer();
    setCallState('idle');
    setCallPeer(null);
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCamOff(false);
    incomingOfferRef.current = null;
  };

  const showError = (msg) => {
    setCallError(msg);
    // Auto-clear after 6 s
    setTimeout(() => setCallError(null), 6000);
  };

  // ── Create RTCPeerConnection ──────────────────────────────

  const createPC = useCallback((peerId) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && socket) {
        socket.emit('call_ice_candidate', { to: peerId, candidate: candidate.toJSON() });
      }
    };

    // Build a stable remote stream and add tracks as they arrive.
    // e.streams[0] may be undefined if the remote peer used addTrack without a stream.
    const remoteMediaStream = new MediaStream();
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0]);
      } else {
        // Fallback: manually add the track to our own stream object
        remoteMediaStream.addTrack(e.track);
        setRemoteStream(new MediaStream(remoteMediaStream.getTracks()));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        endCall(false);
      }
    };

    return pc;
  }, [socket]);

  // ── Get local media ───────────────────────────────────────

  const getMedia = async (type) => {
    // navigator.mediaDevices is undefined in non-secure contexts (HTTP on LAN).
    // WebRTC requires HTTPS or localhost.
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error(
        'Camera/microphone unavailable. WebRTC requires HTTPS or localhost. ' +
        'Try accessing via http://localhost:3000 or set up HTTPS.'
      ), { name: 'InsecureContext' });
    }
    const constraints = {
      audio: { echoCancellation: true, noiseSuppression: true },
      video: type === 'video'
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        : false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  // ── Drain queued ICE candidates ───────────────────────────

  const drainIce = async (pc) => {
    for (const c of pendingIceRef.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingIceRef.current = [];
  };

  // ── Socket event handlers ─────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onIncomingCall = ({ from, offer, callType: type }) => {
      if (callStateRef.current !== 'idle') {
        // Already in a call — send busy signal
        socket.emit('call_busy', { to: from.id });
        return;
      }
      incomingOfferRef.current = offer;
      setCallPeer(from);
      setCallType(type);
      setCallState('incoming');
    };

    const onCallAnswered = async ({ answer }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await drainIce(pc);
        setCallState('active');
        startTimer();
      } catch (err) { endCall(false); }
    };

    const onIceCandidate = async ({ candidate }) => {
      const pc = pcRef.current;
      if (!pc || !candidate) return;
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      } else {
        pendingIceRef.current.push(candidate);
      }
    };

    const onCallEnded   = () => resetState();
    const onCallRejected = () => { resetState(); showError('Call was declined'); };
    const onCallBusy    = () => { resetState(); showError('User is busy'); };

    socket.on('incoming_call',  onIncomingCall);
    socket.on('call_answered',  onCallAnswered);
    socket.on('ice_candidate',  onIceCandidate);
    socket.on('call_ended',     onCallEnded);
    socket.on('call_rejected',  onCallRejected);
    socket.on('call_busy',      onCallBusy);

    return () => {
      socket.off('incoming_call',  onIncomingCall);
      socket.off('call_answered',  onCallAnswered);
      socket.off('ice_candidate',  onIceCandidate);
      socket.off('call_ended',     onCallEnded);
      socket.off('call_rejected',  onCallRejected);
      socket.off('call_busy',      onCallBusy);
    };
  }, [socket]);

  // ── Public actions ────────────────────────────────────────

  const initiateCall = async (peer, type) => {
    if (callState !== 'idle') return;
    setCallError(null);
    setCallPeer(peer);
    setCallType(type);
    setCallState('calling');

    try {
      const stream = await getMedia(type);
      const pc = createPC(peer.id);
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call_offer', {
        to: peer.id,
        offer: pc.localDescription,
        callType: type,
        from: { id: currentUser.id, display_name: currentUser.display_name, avatar_url: currentUser.avatar_url }
      });
    } catch (err) {
      resetState();
      showError(
        err.name === 'NotAllowedError'   ? 'Microphone/camera permission denied' :
        err.name === 'InsecureContext'   ? err.message :
        `Could not start call: ${err.message}`
      );
    }
  };

  const acceptCall = async () => {
    try {
      const stream = await getMedia(callType);
      const pc = createPC(callPeer.id);
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOfferRef.current));
      await drainIce(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call_answer', { to: callPeer.id, answer: pc.localDescription });

      setCallState('active');
      startTimer();
    } catch (err) {
      socket.emit('call_reject', { to: callPeer?.id });
      resetState();
      showError(
        err.name === 'NotAllowedError' ? 'Microphone/camera permission denied' :
        err.name === 'InsecureContext'  ? err.message :
        `Could not accept call: ${err.message}`
      );
    }
  };

  const rejectCall = () => {
    socket?.emit('call_reject', { to: callPeer?.id });
    resetState();
  };

  const endCall = useCallback((notify = true) => {
    if (notify && callPeer && socket) {
      socket.emit('call_end', { to: callPeer.id });
    }
    resetState();
  }, [callPeer, socket]);

  const toggleMute = () => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    tracks.forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  };

  const toggleCamera = () => {
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    tracks.forEach(t => { t.enabled = !t.enabled; });
    setIsCamOff(c => !c);
  };

  return (
    <CallContext.Provider value={{
      callState, callType, callPeer, localStream, remoteStream,
      isMuted, isCamOff, duration, callError,
      initiateCall, acceptCall, rejectCall, endCall,
      toggleMute, toggleCamera,
    }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() { return useContext(CallContext); }
