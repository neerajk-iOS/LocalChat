import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Users, Search, X, ArrowLeft, Menu, Phone, Video } from 'lucide-react';
import { useCall } from '../contexts/CallContext.jsx';
import MessageItem from './MessageItem.jsx';
import MessageInput from './MessageInput.jsx';
import Avatar from './Avatar.jsx';
import { formatDate, formatTime, getDmRoomId } from '../utils/format.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';

export default function ChatArea({ currentUser, activeRoom, onForward, onGroupManage, onMenuOpen, onBack, isMobile, groupRefreshSignal }) {
  const { socket, onlineUsers, markRoomRead } = useSocket();
  const { initiateCall } = useCall();
  const [liveGroup, setLiveGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [typing, setTyping] = useState([]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not searched yet
  const [searchLoading, setSearchLoading] = useState(false);
  const listRef = useRef();
  const typingTimer = useRef();
  const searchTimer = useRef();
  const isAtBottom = useRef(true);

  const roomId = activeRoom?.id;

  const loadMessages = useCallback(async (before = null) => {
    if (!roomId) return [];
    const url = `/api/messages/${encodeURIComponent(roomId)}?limit=50${before ? `&before=${before}` : ''}`;
    const res = await fetch(url);
    return res.json();
  }, [roomId]);

  // Fetch live group details (member count, etc.) when room or refresh signal changes
  useEffect(() => {
    if (activeRoom?.type === 'group') {
      fetch(`/api/groups/${activeRoom.group.id}`)
        .then(r => r.json())
        .then(g => setLiveGroup(g))
        .catch(() => {});
    } else {
      setLiveGroup(null);
    }
  }, [activeRoom?.id, groupRefreshSignal]);

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      markRoomRead(null); // clear active room so notifications count as unread
      return;
    }
    setMessages([]); setHasMore(true); setReplyTo(null);
    setSearching(false); setSearchQuery(''); setSearchResults(null);

    // Mark this room as read immediately
    markRoomRead(roomId);

    loadMessages().then(data => {
      setMessages(data);
      setHasMore(data.length === 50);
      setTimeout(() => scrollToBottom('auto'), 50);
    });

    socket?.emit('join_room', { roomId });

    const onMessage = (msg) => {
      if (msg.room_id !== roomId) return;
      setMessages(prev => [...prev, { ...msg, reactions: msg.reactions || [] }]);
      if (isAtBottom.current) setTimeout(() => scrollToBottom('smooth'), 30);
    };
    const onEdited = ({ message_id, content, edited_at }) =>
      setMessages(prev => prev.map(m => m.id === message_id ? { ...m, content, is_edited: 1, edited_at } : m));
    const onDeleted = ({ message_id }) =>
      setMessages(prev => prev.map(m => m.id === message_id ? { ...m, is_deleted: 1 } : m));
    const onReaction = ({ message_id, reactions }) =>
      setMessages(prev => prev.map(m => m.id === message_id ? { ...m, reactions } : m));
    const onTyping = ({ user_id, is_typing }) =>
      setTyping(prev => is_typing
        ? prev.includes(user_id) ? prev : [...prev, user_id]
        : prev.filter(id => id !== user_id));

    socket?.on('message', onMessage);
    socket?.on('message_edited', onEdited);
    socket?.on('message_deleted', onDeleted);
    socket?.on('reaction_update', onReaction);
    socket?.on('typing_status', onTyping);

    return () => {
      socket?.off('message', onMessage);
      socket?.off('message_edited', onEdited);
      socket?.off('message_deleted', onDeleted);
      socket?.off('reaction_update', onReaction);
      socket?.off('typing_status', onTyping);
    };
  }, [roomId, socket, markRoomRead]);

  const scrollToBottom = (behavior = 'smooth') =>
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior });

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setShowScrollBtn(!isAtBottom.current);
    if (el.scrollTop < 80 && hasMore && !loadingMore) loadMoreMessages();
  };

  const loadMoreMessages = async () => {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    const oldest = messages[0]?.created_at;
    const el = listRef.current;
    const prevScrollHeight = el?.scrollHeight || 0;
    const data = await loadMessages(oldest);
    setMessages(prev => [...data, ...prev]);
    setHasMore(data.length === 50);
    setLoadingMore(false);
    // Maintain scroll position after prepend
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevScrollHeight;
    });
  };

  const handleSend = (payload) => {
    if (!socket || !currentUser || !roomId) return;
    socket.emit('send_message', {
      ...payload,
      sender_id: currentUser.id,
      room_id: roomId,
      reply_to_id: replyTo?.id || null
    });
    setReplyTo(null);
  };

  const handleTyping = (isTyping) => {
    if (!socket || !roomId) return;
    socket.emit('typing', { room_id: roomId, user_id: currentUser?.id, is_typing: isTyping });
    clearTimeout(typingTimer.current);
    if (isTyping) {
      typingTimer.current = setTimeout(() => {
        socket.emit('typing', { room_id: roomId, user_id: currentUser?.id, is_typing: false });
      }, 2500);
    }
  };

  const handleDelete = (msgId) => socket?.emit('delete_message', { message_id: msgId, user_id: currentUser?.id });
  const handleEdit = (msgId, content) => socket?.emit('edit_message', { message_id: msgId, content, user_id: currentUser?.id });
  const handleReact = (msgId, emoji) => socket?.emit('reaction', { message_id: msgId, user_id: currentUser?.id, emoji });

  // Jump to a message and flash-highlight it
  const jumpToMessage = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-highlight');
      setTimeout(() => el.classList.remove('msg-highlight'), 2000);
    }
    setSearching(false);
    setSearchQuery('');
    setSearchResults(null);
  };

  // Debounced search
  const handleSearchInput = (q) => {
    setSearchQuery(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/messages/search/${encodeURIComponent(roomId)}?q=${encodeURIComponent(q.trim())}`);
        setSearchResults(await res.json());
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  const closeSearch = () => {
    setSearching(false);
    setSearchQuery('');
    setSearchResults(null);
    clearTimeout(searchTimer.current);
  };

  // Group messages by date, detect consecutive same-sender runs
  const grouped = [];
  let lastDateKey = null;
  let lastSender = null;

  messages.forEach((msg) => {
    const dateKey = new Date(msg.created_at).toDateString();
    if (dateKey !== lastDateKey) {
      grouped.push({ type: 'date', label: formatDate(msg.created_at) });
      lastDateKey = dateKey;
      lastSender = null;
    }
    const isConsecutive = lastSender === msg.sender_id && !msg.reply_to_id && !msg.forwarded_from_id;
    grouped.push({ type: 'message', msg, isConsecutive });
    lastSender = msg.sender_id;
  });

  if (!activeRoom) {
    return (
      <div className="chat-area">
        {/* Show hamburger on mobile when no room selected */}
        {isMobile && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
            <button className="mobile-menu-btn" style={{ display: 'flex' }} onClick={onMenuOpen}>
              <Menu size={20} />
            </button>
          </div>
        )}
        <div className="chat-empty">
          <div style={{ fontSize: 52, marginBottom: 12 }}>💬</div>
          <h2>Welcome to LocalChat</h2>
          <p>Select a contact or group to start chatting</p>
          <p style={{ fontSize: 12, marginTop: 6, color: 'var(--text-muted)' }}>
            No internet required — everything stays on your LAN
          </p>
        </div>
      </div>
    );
  }

  const isOnline = activeRoom.type === 'dm' && onlineUsers.includes(activeRoom.contact?.id);
  const typingNames = typing.filter(id => id !== currentUser?.id);
  const chatName = activeRoom.type === 'dm' ? activeRoom.contact?.display_name : activeRoom.group?.name;
  const chatAvatar = activeRoom.type === 'dm'
    ? activeRoom.contact
    : { id: activeRoom.group?.id, display_name: activeRoom.group?.name, avatar_url: activeRoom.group?.avatar_url };

  return (
    <div className="chat-area">
      {/* ── Header ── */}
      <div className="chat-header">
        {/* Back button — mobile only */}
        <button className="mobile-back-btn" onClick={onBack} title="Back">
          <ArrowLeft size={20} />
        </button>
        <Avatar user={chatAvatar} size="md" showStatus={activeRoom.type === 'dm'} isOnline={isOnline} />
        <div className="chat-header-info">
          <div className="chat-header-name">{chatName}</div>
          <div className="chat-header-status">
            {activeRoom.type === 'dm'
              ? <><span className="online-dot" style={{ background: isOnline ? 'var(--status-online)' : 'var(--status-offline)' }} />{isOnline ? 'Online' : 'Offline'}</>
              : <><Users size={11} />&nbsp;{(liveGroup?.members?.length ?? activeRoom.group?.member_count ?? 0)} members</>
            }
          </div>
        </div>
        <div className="chat-header-actions">
          <button className={`icon-btn ${searching ? 'active' : ''}`} title="Search"
            onClick={() => searching ? closeSearch() : setSearching(true)}>
            <Search size={17} />
          </button>
          {activeRoom.type === 'dm' && (
            <>
              <button
                className="icon-btn call-header-btn"
                title="Audio call"
                onClick={() => initiateCall(activeRoom.contact, 'audio')}
              >
                <Phone size={17} />
              </button>
              <button
                className="icon-btn call-header-btn"
                title="Video call"
                onClick={() => initiateCall(activeRoom.contact, 'video')}
              >
                <Video size={17} />
              </button>
            </>
          )}
          {activeRoom.type === 'group' && (
            <button className="icon-btn" title="Manage group" onClick={() => onGroupManage?.(activeRoom.group)}>
              <Users size={17} />
            </button>
          )}
        </div>
      </div>

      {/* ── Search bar ── */}
      {searching && (
        <div className="search-bar-area">
          <div className="search-bar-inner">
            <div className="search-input-wrap">
              <Search size={13} color="var(--text-muted)" />
              <input
                placeholder="Search messages in this conversation…"
                value={searchQuery}
                onChange={e => handleSearchInput(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button style={{ color: 'var(--text-muted)', lineHeight: 0 }}
                  onClick={() => { setSearchQuery(''); setSearchResults(null); }}>
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Results dropdown — positioned relative to search-bar-inner */}
            {searchQuery && (
              <div className="search-results-panel">
                {searchLoading && (
                  <div className="search-results-empty">Searching…</div>
                )}
                {!searchLoading && searchResults !== null && searchResults.length === 0 && (
                  <div className="search-results-empty">No messages match "{searchQuery}"</div>
                )}
                {!searchLoading && searchResults?.length > 0 && (
                  <>
                    <div className="search-results-header">
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                    </div>
                    {searchResults.map(r => (
                      <div key={r.id} className="search-result-item" onClick={() => jumpToMessage(r.id)}>
                        <div className="search-result-meta">
                          <span className="search-result-sender">{r.sender_name}</span>
                          <span className="search-result-time">{formatTime(r.created_at)}</span>
                        </div>
                        <div className="search-result-text">{r.content}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <button className="icon-btn" onClick={closeSearch} title="Close search">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Message list ── */}
      <div className="messages-list" ref={listRef} onScroll={handleScroll}>
        {loadingMore && (
          <div className="load-more-spinner">Loading older messages…</div>
        )}

        {messages.length === 0 && !loadingMore && (
          <div className="empty-state" style={{ marginTop: 'auto' }}>
            <div className="empty-state-icon">👋</div>
            <div className="empty-state-title">Start the conversation</div>
            <div className="empty-state-desc">Say hello to {chatName}!</div>
          </div>
        )}

        {grouped.map((item, i) =>
          item.type === 'date'
            ? <div key={`date-${i}`} className="date-separator">{item.label}</div>
            : <MessageItem
                key={item.msg.id}
                msg={item.msg}
                currentUser={currentUser}
                isConsecutive={item.isConsecutive}
                onReply={setReplyTo}
                onForward={onForward}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onReact={handleReact}
                scrollToMessage={jumpToMessage}
              />
        )}
      </div>

      {/* ── Typing indicator — outside scroll, always visible ── */}
      <div className="typing-indicator" style={{ opacity: typingNames.length ? 1 : 0 }}>
        <div className="typing-dots"><span /><span /><span /></div>
        <span>{typingNames.length === 1 ? 'Someone is' : 'Several people are'} typing…</span>
      </div>

      {/* ── Scroll-to-bottom button ── */}
      {showScrollBtn && (
        <button className="scroll-down-btn" onClick={() => scrollToBottom()}>
          <ChevronDown size={18} />
        </button>
      )}

      {/* ── Message input ── */}
      <MessageInput
        onSend={handleSend}
        onTyping={handleTyping}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}
