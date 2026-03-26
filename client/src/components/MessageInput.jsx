import { useState, useRef, useEffect } from 'react';
import { Paperclip, Send, Smile, X, Mic, Video } from 'lucide-react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import RecordingModal from './RecordingModal.jsx';

export default function MessageInput({ onSend, onTyping, replyTo, onCancelReply, disabled }) {
  const [recordType, setRecordType] = useState(null); // null | 'audio' | 'video'
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textRef = useRef();
  const fileRef = useRef();
  const pickerRef = useRef();

  // Auto-resize textarea
  useEffect(() => {
    const ta = textRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [text]);

  // Close emoji picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowEmoji(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleChange = (e) => {
    setText(e.target.value);
    onTyping?.(true);
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend({ type: 'text', content: trimmed });
    setText('');
    onTyping?.(false);
    textRef.current?.focus();
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
      const data = await res.json();
      onSend({
        type: file.type.startsWith('image/') ? 'image'
          : file.type.startsWith('video/') ? 'video'
          : file.type.startsWith('audio/') ? 'audio' : 'file',
        file_url: data.url,
        file_name: data.filename,
        file_size: data.size,
        file_mime: data.mime
      });
    } catch (err) { console.error('Upload failed', err); }
    finally { setUploading(false); }
  };

  const handleRecordingSend = async ({ file, fileName, mimeType }) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file, fileName);
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
      const json = await res.json();
      const msgType = mimeType.startsWith('video/') ? 'video' : 'audio';
      onSend({
        type: msgType,
        file_url: json.url,
        file_name: json.filename,
        file_size: json.size,
        file_mime: json.mime,
      });
    } catch (err) { console.error('Recording upload failed', err); }
    finally { setUploading(false); }
  };

  const handleEmojiPick = (emoji) => {
    const ta = textRef.current;
    const start = ta.selectionStart;
    const newText = text.slice(0, start) + emoji.native + text.slice(start);
    setText(newText);
    setShowEmoji(false);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + emoji.native.length, start + emoji.native.length); }, 0);
  };

  return (
    <>
    {recordType && (
      <RecordingModal
        type={recordType}
        onClose={() => setRecordType(null)}
        onSend={handleRecordingSend}
      />
    )}
    <div className="input-area">
      {/* Reply strip */}
      {replyTo && (
        <div className="reply-preview-strip">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="reply-preview-name">Replying to {replyTo.sender_name || 'message'}</div>
            <div className="reply-preview-text">{replyTo.content || replyTo.file_name || 'Attachment'}</div>
          </div>
          <button className="icon-btn" onClick={onCancelReply}><X size={14} /></button>
        </div>
      )}

      <div className="input-box">
        {/* Emoji picker */}
        <div style={{ position: 'relative' }} ref={pickerRef}>
          <button className="input-action-btn" onClick={() => setShowEmoji(s => !s)} type="button">
            <Smile size={18} />
          </button>
          {showEmoji && (
            <div className="emoji-picker-overlay">
              <Picker data={data} onEmojiSelect={handleEmojiPick} theme="dark" previewPosition="none" />
            </div>
          )}
        </div>

        <textarea
          ref={textRef}
          className="input-textarea"
          placeholder={disabled ? 'Select a conversation…' : 'Message…'}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
        />

        <div className="input-actions">
          <button className="input-action-btn" title="Record audio"
            onClick={() => !disabled && setRecordType('audio')} disabled={disabled} type="button">
            <Mic size={18} />
          </button>
          <button className="input-action-btn" title="Record video"
            onClick={() => !disabled && setRecordType('video')} disabled={disabled} type="button">
            <Video size={18} />
          </button>
          <button className="input-action-btn" onClick={() => fileRef.current.click()} disabled={disabled || uploading} type="button">
            {uploading ? <span style={{ fontSize: 11, color: 'var(--accent-hover)' }}>↑</span> : <Paperclip size={18} />}
          </button>
          <button className="send-btn" onClick={submit} disabled={!text.trim() || disabled} type="button">
            <Send size={16} />
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleFile} />
    </div>
    </>
  );
}
