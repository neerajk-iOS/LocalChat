import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, Video, Square, Send, X, RefreshCw } from 'lucide-react';

/**
 * Unified recording modal for audio and video.
 * Props:
 *   type      – 'audio' | 'video'
 *   roomId    – current chat room (dm_<id> or grp_<id>)
 *   senderId  – current user ID
 *   onClose   – called when user cancels or finishes
 *   onSend    – called with { file, fileName, mimeType, duration } after recording stops
 */
export default function RecordingModal({ type, roomId, senderId, onClose, onSend }) {
  const [phase, setPhase]       = useState('preview');  // preview | recording | review
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blobUrl, setBlobUrl]   = useState(null);
  const [blob, setBlob]         = useState(null);
  const [bars, setBars]         = useState(Array(24).fill(4));
  const [error, setError]       = useState(null);

  const videoRef      = useRef(null);
  const reviewRef     = useRef(null);
  const streamRef     = useRef(null);
  const recorderRef   = useRef(null);
  const chunksRef     = useRef([]);
  const timerRef      = useRef(null);
  const animRef       = useRef(null);
  const analyserRef   = useRef(null);
  const audioCtxRef   = useRef(null);
  const startTimeRef  = useRef(0);

  // ── Acquire camera/mic preview ─────────────────────────
  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: type === 'video'
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            : false,
        });
        streamRef.current = stream;
        if (type === 'video' && videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        setError(e.name === 'NotAllowedError' ? 'Permission denied for camera/microphone.' : e.message);
      }
    })();

    return () => {
      stream?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(animRef.current);
      clearInterval(timerRef.current);
      audioCtxRef.current?.close();
    };
  }, [type]);

  // ── Audio visualiser ──────────────────────────────────
  const startVisualizer = useCallback((stream) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    src.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setBars(Array.from({ length: 24 }, (_, i) => {
        const v = data[Math.floor(i * data.length / 24)] || 0;
        return Math.max(4, Math.round((v / 255) * 56));
      }));
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  // ── Start recording ───────────────────────────────────
  const startRecording = () => {
    chunksRef.current = [];
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = type === 'video'
      ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm')
      : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm');

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      cancelAnimationFrame(animRef.current);
      clearInterval(timerRef.current);
      audioCtxRef.current?.close();
      audioCtxRef.current = null;

      const recorded = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(recorded);
      setBlob(recorded);
      setBlobUrl(url);
      setPhase('review');

      if (type === 'video' && videoRef.current) videoRef.current.srcObject = null;
    };

    recorder.start(100);
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    setPhase('recording');

    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    if (type === 'audio') startVisualizer(stream);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  // ── Re-record ─────────────────────────────────────────
  const retake = async () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setBlob(null);
    setBars(Array(24).fill(4));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      streamRef.current = stream;
      if (type === 'video' && videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setPhase('preview');
    } catch (e) { setError(e.message); }
  };

  // ── Send ──────────────────────────────────────────────
  const handleSend = () => {
    if (!blob) return;
    const ext = type === 'video' ? 'webm' : 'webm';
    const mimeType = blob.type;
    const fileName = `${type === 'video' ? 'video' : 'audio'}-${Date.now()}.${ext}`;
    const file = new File([blob], fileName, { type: mimeType });
    onSend({ file, fileName, mimeType, duration: Math.round(elapsedMs / 1000) });
    URL.revokeObjectURL(blobUrl);
    onClose();
  };

  const fmtMs = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  };

  return (
    <div className="recording-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="recording-card">
        {/* Header */}
        <div className="recording-header">
          {type === 'video' ? <Video size={18} /> : <Mic size={18} />}
          <span>{type === 'video' ? 'Video Recording' : 'Audio Recording'}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {error && <div className="recording-error">{error}</div>}

        {/* Body */}
        {type === 'video' ? (
          <div className="recording-video-wrap">
            {phase !== 'review' ? (
              <video ref={videoRef} className="recording-video" autoPlay playsInline muted />
            ) : (
              <video ref={reviewRef} className="recording-video" src={blobUrl} controls />
            )}
          </div>
        ) : (
          <div className="recording-audio-vis">
            {bars.map((h, i) => (
              <div
                key={i}
                className="vis-bar"
                style={{ height: h, animationDelay: `${i * 40}ms` }}
              />
            ))}
          </div>
        )}

        {/* Timer */}
        {phase !== 'preview' && (
          <div className="recording-timer">
            {phase === 'recording' && <span className="rec-dot" />}
            {fmtMs(elapsedMs)}
          </div>
        )}

        {/* Actions */}
        <div className="recording-actions">
          {phase === 'preview' && (
            <button className="rec-btn rec-btn-start" onClick={startRecording}>
              {type === 'video' ? <Video size={20} /> : <Mic size={20} />}
              Start Recording
            </button>
          )}

          {phase === 'recording' && (
            <button className="rec-btn rec-btn-stop" onClick={stopRecording}>
              <Square size={20} />
              Stop
            </button>
          )}

          {phase === 'review' && (
            <>
              <button className="rec-btn rec-btn-retake" onClick={retake}>
                <RefreshCw size={18} />
                Retake
              </button>
              <button className="rec-btn rec-btn-send" onClick={handleSend}>
                <Send size={18} />
                Send
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
