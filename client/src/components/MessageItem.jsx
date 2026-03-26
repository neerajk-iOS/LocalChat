import { useState, useRef } from 'react';
import { Reply, Forward, Trash2, Edit2, Copy, SmilePlus, CheckCheck, FileText, Volume2, MoreHorizontal } from 'lucide-react';
import Avatar from './Avatar.jsx';
import MediaViewer from './MediaViewer.jsx';
import LinkPreview, { extractFirstUrl, renderTextWithLinks } from './LinkPreview.jsx';
import { formatTime, formatFileSize, isImageMime, isVideoMime, isAudioMime } from '../utils/format.jsx';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageItem({
  msg, currentUser, isConsecutive, onReply, onForward, onDelete, onEdit, onReact, scrollToMessage
}) {
  const [ctxMenu, setCtxMenu] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const [hovered, setHovered] = useState(false);
  const editRef = useRef();

  const isOut = msg.sender_id === currentUser?.id;
  const isDeleted = !!msg.is_deleted;

  const openCtx = (e) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 210);
    const y = Math.min(e.clientY, window.innerHeight - 340);
    setCtxMenu({ x, y });
  };
  const closeCtx = () => setCtxMenu(null);

  const startEdit = () => {
    setEditText(msg.content || '');
    setEditing(true);
    closeCtx();
    setTimeout(() => {
      editRef.current?.focus();
      const len = editRef.current?.value.length;
      editRef.current?.setSelectionRange(len, len);
    }, 30);
  };

  const submitEdit = (e) => {
    e?.preventDefault();
    if (!editText.trim()) return;
    onEdit(msg.id, editText.trim());
    setEditing(false);
  };

  const renderAttachment = () => {
    if (!msg.file_url) return null;
    const mime = msg.file_mime || '';

    if (isImageMime(mime)) {
      return (
        <div className="image-attachment"
          onClick={() => setLightbox({ src: msg.file_url, name: msg.file_name })}>
          <img src={msg.file_url} alt={msg.file_name || 'image'} loading="lazy" />
        </div>
      );
    }
    if (isVideoMime(mime)) {
      return (
        <div className="video-attachment">
          <video src={msg.file_url} controls preload="metadata" />
        </div>
      );
    }
    if (isAudioMime(mime)) {
      return (
        <div className="audio-attachment">
          <Volume2 size={16} color="var(--accent-hover)" style={{ flexShrink: 0 }} />
          <audio src={msg.file_url} controls />
        </div>
      );
    }
    return (
      <a
        className="file-attachment"
        href={`${msg.file_url}?download=1&name=${encodeURIComponent(msg.file_name || 'file')}`}
        download
        onClick={e => e.stopPropagation()}
      >
        <div className="file-icon-wrap"><FileText size={18} /></div>
        <div className="file-info">
          <div className="file-name">{msg.file_name || 'File'}</div>
          <div className="file-size">{formatFileSize(msg.file_size)}</div>
        </div>
      </a>
    );
  };

  const renderReactions = () => {
    if (!msg.reactions?.length) return null;
    return (
      <div className="reactions-row">
        {msg.reactions.map(r => {
          const mine = r.users?.some(u => u.id === currentUser?.id);
          return (
            <button
              key={r.emoji}
              className={`reaction-chip ${mine ? 'mine' : ''}`}
              onClick={() => onReact(msg.id, r.emoji)}
              title={r.users?.map(u => u.name).join(', ')}
            >
              {r.emoji} <span className="reaction-count">{r.count}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div
        className={`message-row ${isOut ? 'outgoing' : 'incoming'} ${isConsecutive ? 'consecutive' : ''}`}
        onContextMenu={openCtx}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        id={`msg-${msg.id}`}
      >
        {/* Avatar — spacer for consecutive to keep alignment without gap */}
        {!isOut && (
          isConsecutive
            ? <div className="avatar-spacer" />
            : <div className="avatar-wrap" style={{ alignSelf: 'flex-end', marginBottom: 2 }}>
                <Avatar
                  user={{ id: msg.sender_id, display_name: msg.sender_name, avatar_url: msg.sender_avatar }}
                  size="sm"
                />
              </div>
        )}

        {/* Bubble column */}
        <div className="bubble-col" style={{ alignItems: isOut ? 'flex-end' : 'flex-start' }}>
          {/* Forwarded label */}
          {msg.forwarded_from_id && (
            <div className="forwarded-label">
              <Forward size={11} /> Forwarded
            </div>
          )}

          {/* Main bubble */}
          <div className="message-bubble">
            {/* Sender name (group incoming, first of a run) */}
            {!isOut && !isConsecutive && msg.sender_name && (
              <div className="message-sender-name">{msg.sender_name}</div>
            )}

            {/* Reply quote */}
            {msg.reply_to_id && !isDeleted && (
              <div className="reply-quote" onClick={() => scrollToMessage(msg.reply_to_id)}>
                <div className="reply-quote-sender">{msg.reply_sender_name || 'Unknown'}</div>
                <div className="reply-quote-text">
                  {msg.reply_type === 'text'
                    ? (msg.reply_content || 'Message')
                    : `📎 ${msg.reply_file_name || 'Attachment'}`
                  }
                </div>
              </div>
            )}

            {/* Content */}
            {isDeleted ? (
              <span className="message-deleted">🚫 This message was deleted</span>
            ) : editing ? (
              <div className="edit-form">
                <textarea
                  ref={editRef}
                  className="edit-textarea"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  rows={2}
                />
                <div className="edit-actions">
                  <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setEditing(false)}>Cancel</button>
                  <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={submitEdit}>Save</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Enter to save · Esc to cancel</div>
              </div>
            ) : (
              <>
                {msg.content && (
                  <p className="message-text">{renderTextWithLinks(msg.content)}</p>
                )}
                {renderAttachment()}
                {msg.content && !msg.file_url && (() => {
                  const url = extractFirstUrl(msg.content);
                  return url ? <LinkPreview url={url} /> : null;
                })()}
              </>
            )}

            {/* Footer: edited + time + ticks */}
            {!editing && (
              <div className="message-footer">
                {msg.is_edited === 1 && <span className="message-edited">edited</span>}
                <span className="message-time">{formatTime(msg.created_at)}</span>
                {isOut && <span className="read-ticks"><CheckCheck size={12} /></span>}
              </div>
            )}
          </div>

          {renderReactions()}
        </div>

        {/* ── Hover action bar ── */}
        {hovered && !isDeleted && !editing && (
          <div className={`msg-actions ${isOut ? 'msg-actions-left' : 'msg-actions-right'}`}>
            <button className="msg-action-btn" title="Reply" onClick={() => { onReply(msg); setHovered(false); }}>
              <Reply size={13} />
            </button>
            <button className="msg-action-btn" title="React" onClick={(e) => { openCtx(e); }}>
              <SmilePlus size={13} />
            </button>
            <button className="msg-action-btn" title="Forward" onClick={() => { onForward(msg); setHovered(false); }}>
              <Forward size={13} />
            </button>
            <button className="msg-action-btn" title="More" onClick={openCtx}>
              <MoreHorizontal size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ── Context menu ── */}
      {ctxMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={closeCtx} />
          <div className="context-menu" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
            <div className="emoji-quick-row">
              {QUICK_EMOJIS.map(e => (
                <button key={e} className="emoji-quick-btn"
                  onClick={() => { onReact(msg.id, e); closeCtx(); }}>{e}</button>
              ))}
            </div>
            {!isDeleted && (
              <>
                <div className="context-menu-item" onClick={() => { onReply(msg); closeCtx(); }}>
                  <Reply size={14} /> Reply
                </div>
                <div className="context-menu-item" onClick={() => { onForward(msg); closeCtx(); }}>
                  <Forward size={14} /> Forward
                </div>
                {msg.content && (
                  <div className="context-menu-item"
                    onClick={() => { navigator.clipboard.writeText(msg.content); closeCtx(); }}>
                    <Copy size={14} /> Copy text
                  </div>
                )}
                {isOut && (
                  <>
                    <div className="context-menu-divider" />
                    {msg.type === 'text' && (
                      <div className="context-menu-item" onClick={startEdit}>
                        <Edit2 size={14} /> Edit
                      </div>
                    )}
                    <div className="context-menu-item danger"
                      onClick={() => { onDelete(msg.id); closeCtx(); }}>
                      <Trash2 size={14} /> Delete
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <MediaViewer src={lightbox.src} filename={lightbox.name} onClose={() => setLightbox(null)} />
      )}
    </>
  );
}
