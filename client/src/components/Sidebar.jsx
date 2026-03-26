import { useState, useEffect } from 'react';
import { Search, Plus, Moon, Sun, Settings, Hash, MessageSquare, X } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { formatTime, getDmRoomId } from '../utils/format.jsx';
import { useSocket } from '../contexts/SocketContext.jsx';

export default function Sidebar({
  currentUser, users, groups, activeRoom, isOpen, onClose,
  onSelectDm, onSelectGroup, onNewGroup, onProfile, theme, onToggleTheme
}) {
  const { onlineUsers, unreadCounts, lastMessages: socketLastMessages,
          notifPerm, requestNotifPermission } = useSocket();
  const [tab, setTab] = useState('dms');
  const [search, setSearch] = useState('');
  // Seeded last-messages from HTTP; socket context keeps them live
  const [seededMessages, setSeededMessages] = useState({});

  // Fetch the most recent message for every room once on mount / when list changes
  useEffect(() => {
    const fetchPreviews = async () => {
      const otherUsers = users.filter(u => u.id !== currentUser?.id);
      const previews = {};
      await Promise.all([
        ...otherUsers.map(async u => {
          const roomId = getDmRoomId(currentUser.id, u.id);
          try {
            const msgs = await (await fetch(`/api/messages/${encodeURIComponent(roomId)}?limit=1`)).json();
            if (msgs.length) previews[roomId] = msgs[msgs.length - 1];
          } catch { /* skip */ }
        }),
        ...groups.map(async g => {
          const roomId = `group:${g.id}`;
          try {
            const msgs = await (await fetch(`/api/messages/${encodeURIComponent(roomId)}?limit=1`)).json();
            if (msgs.length) previews[roomId] = msgs[msgs.length - 1];
          } catch { /* skip */ }
        })
      ]);
      setSeededMessages(previews);
    };
    if (currentUser && (users.length || groups.length)) fetchPreviews();
  }, [users, groups, currentUser]);

  // Merge: socket live updates win over seeded values
  const getLastMsg = (roomId) => socketLastMessages[roomId] ?? seededMessages[roomId] ?? null;

  const getPreview = (roomId) => {
    const msg = getLastMsg(roomId);
    if (!msg) return '';
    if (msg.is_deleted) return '🚫 Deleted message';
    if (msg.type === 'image') return '📷 Image';
    if (msg.type === 'video') return '🎬 Video';
    if (msg.type === 'audio') return '🎵 Audio';
    if (msg.type !== 'text') return `📎 ${msg.file_name || 'File'}`;
    return msg.content || '';
  };

  const getLastTime = (roomId) => {
    const msg = getLastMsg(roomId);
    return msg ? formatTime(msg.created_at) : '';
  };

  const otherUsers  = users.filter(u => u.id !== currentUser?.id);
  const filterDMs   = otherUsers.filter(u => u.display_name.toLowerCase().includes(search.toLowerCase()));
  const filterGroups = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));

  // Total unread counts per tab for the tab badges
  const dmUnreadTotal = otherUsers.reduce((sum, u) => {
    return sum + (unreadCounts[getDmRoomId(currentUser.id, u.id)] || 0);
  }, 0);
  const groupUnreadTotal = groups.reduce((sum, g) => {
    return sum + (unreadCounts[`group:${g.id}`] || 0);
  }, 0);

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>

      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">Local<span>Chat</span></div>
        <button className="theme-toggle-btn" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="mobile-menu-btn" onClick={onClose} title="Close" style={{ marginLeft: 2 }}>
          <X size={18} />
        </button>
      </div>

      {/* My profile strip */}
      <div className="profile-strip" onClick={onProfile}>
        <Avatar user={currentUser} size="sm" showStatus isOnline />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">
            {currentUser?.display_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--status-online)' }}>● Online</div>
        </div>
        <Settings size={15} color="var(--text-muted)" />
      </div>

      {/* Notification permission nudge */}
      {notifPerm === 'default' && (
        <div className="notif-nudge">
          <span>🔔 Enable notifications?</span>
          <button className="notif-nudge-btn" onClick={requestNotifPermission}>Allow</button>
        </div>
      )}

      {/* Search */}
      <div className="sidebar-search">
        <div className="search-input-wrap">
          <Search size={13} color="var(--text-muted)" />
          <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="sidebar-tabs">
        <button className={`sidebar-tab ${tab === 'dms' ? 'active' : ''}`} onClick={() => setTab('dms')}>
          <MessageSquare size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
          Direct
          {dmUnreadTotal > 0 && (
            <span className="tab-badge">{dmUnreadTotal > 99 ? '99+' : dmUnreadTotal}</span>
          )}
        </button>
        <button className={`sidebar-tab ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>
          <Hash size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
          Groups
          {groupUnreadTotal > 0 && (
            <span className="tab-badge">{groupUnreadTotal > 99 ? '99+' : groupUnreadTotal}</span>
          )}
        </button>
      </div>

      {/* Contact / Group list */}
      <div className="sidebar-list">
        {tab === 'dms' && (
          <>
            <div className="sidebar-section-label">People — {onlineUsers.filter(id => id !== currentUser?.id).length} online</div>
            {filterDMs.length === 0 && (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {search ? 'No users match your search' : 'No other users yet'}
                </div>
              </div>
            )}
            {filterDMs.map(u => {
              const roomId  = getDmRoomId(currentUser.id, u.id);
              const isActive = activeRoom?.id === roomId;
              const isOnline = onlineUsers.includes(u.id);
              const unread   = unreadCounts[roomId] || 0;
              return (
                <div
                  key={u.id}
                  className={`contact-item ${isActive ? 'active' : ''} ${unread > 0 && !isActive ? 'has-unread' : ''}`}
                  onClick={() => onSelectDm(u)}
                >
                  <Avatar user={u} size="md" showStatus isOnline={isOnline} />
                  <div className="contact-item-info">
                    <div className="contact-item-name" style={{ fontWeight: unread > 0 && !isActive ? 700 : 500 }}>
                      {u.display_name}
                    </div>
                    <div className="contact-item-preview" style={{ color: unread > 0 && !isActive ? 'var(--text-secondary)' : undefined }}>
                      {getPreview(roomId) || (isOnline ? 'Online' : 'Offline')}
                    </div>
                  </div>
                  <div className="contact-item-meta">
                    <span className="contact-time">{getLastTime(roomId)}</span>
                    {unread > 0 && !isActive && (
                      <span className="unread-badge">{unread > 99 ? '99+' : unread}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === 'groups' && (
          <>
            <div className="sidebar-section-label">Groups — {groups.length}</div>
            {filterGroups.length === 0 && (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {search ? 'No groups match' : 'No groups yet'}
                </div>
                {!search && (
                  <button className="btn btn-primary" style={{ marginTop: 10, padding: '7px 16px', fontSize: 12 }} onClick={onNewGroup}>
                    <Plus size={13} /> Create Group
                  </button>
                )}
              </div>
            )}
            {filterGroups.map(g => {
              const roomId   = `group:${g.id}`;
              const isActive = activeRoom?.id === roomId;
              const unread   = unreadCounts[roomId] || 0;
              return (
                <div
                  key={g.id}
                  className={`contact-item ${isActive ? 'active' : ''} ${unread > 0 && !isActive ? 'has-unread' : ''}`}
                  onClick={() => onSelectGroup(g)}
                >
                  <Avatar user={{ id: g.id, display_name: g.name, avatar_url: g.avatar_url }} size="md" />
                  <div className="contact-item-info">
                    <div className="contact-item-name" style={{ fontWeight: unread > 0 && !isActive ? 700 : 500 }}>
                      {g.name}
                    </div>
                    <div className="contact-item-preview" style={{ color: unread > 0 && !isActive ? 'var(--text-secondary)' : undefined }}>
                      {getPreview(roomId) || `${g.member_count || 0} members`}
                    </div>
                  </div>
                  <div className="contact-item-meta">
                    <span className="contact-time">{getLastTime(roomId)}</span>
                    {unread > 0 && !isActive && (
                      <span className="unread-badge">{unread > 99 ? '99+' : unread}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <button className="new-group-btn" title="New Group" onClick={onNewGroup}>
          <Plus size={16} />
        </button>
        <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>
          {onlineUsers.length} online
        </span>
      </div>
    </aside>
  );
}
