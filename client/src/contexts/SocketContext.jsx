import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ userId, children }) {
  const [socket, setSocket]           = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});   // { [roomId]: number }
  const [lastMessages, setLastMessages] = useState({});   // { [roomId]: message }
  const [notifPerm, setNotifPerm]     = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );

  // Ref so message handler always sees the latest active room without re-subscribing
  const activeRoomRef = useRef(null);

  /** Called by ChatArea when the user opens (or leaves) a room.
   *  Memoized with no deps so it is stable across renders (refs + setters are stable). */
  const markRoomRead = useCallback((roomId) => {
    activeRoomRef.current = roomId ?? null;
    setUnreadCounts(prev => {
      if (roomId && prev[roomId]) return { ...prev, [roomId]: 0 };
      return prev;
    });
  }, []);

  // ── Request notification permission once after user is identified ────────
  useEffect(() => {
    if (!userId) return;
    if ('Notification' in window && Notification.permission === 'default') {
      const t = setTimeout(() => {
        Notification.requestPermission().then(p => setNotifPerm(p));
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const s = io('/', { transports: ['websocket', 'polling'] });

    s.on('connect', () => s.emit('join', { userId }));

    s.on('users_online', (ids) => setOnlineUsers(ids));

    // ── Show a browser notification when the page is not focused ─────────
    const pushNotification = (msg) => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (document.visibilityState === 'visible') return; // only when in background

      const body = msg.type === 'text'
        ? (msg.content?.slice(0, 100) || '')
        : msg.type === 'audio' ? '🎵 Audio message'
        : msg.type === 'video' ? '🎬 Video message'
        : msg.type === 'image' ? '📷 Image'
        : `📎 ${msg.file_name || 'File'}`;

      // Use location.origin so the icon goes through the Vite proxy on dev
      // (avoids mixed-content blocks when serving HTTPS dev + HTTP backend)
      const icon = msg.sender_avatar
        ? `${location.origin}${msg.sender_avatar}`
        : undefined;

      const n = new Notification(msg.sender_name || 'New message', {
        body,
        icon,
        tag: msg.room_id,       // collapses multiple notifs from the same room
        renotify: true,
        silent: false,
      });

      n.onclick = () => {
        window.focus();
        n.close();
      };
    };

    // Handler shared by both 'message' (room sub) and 'new_message_notif' (direct push).
    // 'message'           → only fires if socket joined the room (user ever opened it)
    // 'new_message_notif' → server sends directly to user socket for rooms not yet joined
    const handleIncoming = (msg) => {
      setLastMessages(prev => ({ ...prev, [msg.room_id]: msg }));
      if (msg.sender_id !== userId && msg.room_id !== activeRoomRef.current) {
        setUnreadCounts(prev => ({
          ...prev,
          [msg.room_id]: (prev[msg.room_id] || 0) + 1,
        }));
        pushNotification(msg);
      }
    };

    s.on('message', handleIncoming);
    s.on('new_message_notif', handleIncoming);

    // Admin kicked / banned
    s.on('kicked', ({ reason }) => {
      s.disconnect();
      // Replace entire page body with a kicked message
      document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
          background:#0d0e14;font-family:system-ui,sans-serif;padding:24px">
          <div class="kicked-modal" style="background:#12131a;border:1px solid #ef444440;
            border-radius:16px;padding:36px;max-width:380px;text-align:center">
            <div style="font-size:3rem;margin-bottom:12px">🚫</div>
            <h2 style="color:#ef4444;margin-bottom:8px">You've been removed</h2>
            <p style="color:#a0a3b1;font-size:.9rem;line-height:1.5">${reason || 'You were disconnected by an administrator.'}</p>
            <button onclick="location.reload()" style="margin-top:20px;background:#6366f1;color:#fff;
              border:none;padding:10px 24px;border-radius:8px;font-size:.9rem;cursor:pointer;font-weight:600">
              Reload
            </button>
          </div>
        </div>`;
    });

    // Forward messages dispatched from App.jsx
    const onForward = (e) => {
      const { msg, roomId, senderId } = e.detail;
      s.emit('send_message', {
        type: msg.type || 'text',
        content: msg.content || null,
        file_url: msg.file_url || null,
        file_name: msg.file_name || null,
        file_size: msg.file_size || null,
        file_mime: msg.file_mime || null,
        sender_id: senderId,
        room_id: roomId,
        forwarded_from_id: msg.id,
        reply_to_id: null
      });
    };

    window.addEventListener('localchat:forward', onForward);
    setSocket(s);

    return () => {
      window.removeEventListener('localchat:forward', onForward);
      s.off('message', handleIncoming);
      s.off('new_message_notif', handleIncoming);
      s.disconnect();
    };
  }, [userId]);

  const requestNotifPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
  }, []);

  return (
    <SocketContext.Provider value={{
      socket, onlineUsers, unreadCounts, lastMessages, markRoomRead,
      notifPerm, requestNotifPermission,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
