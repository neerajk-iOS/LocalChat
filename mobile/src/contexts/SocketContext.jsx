import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { storage } from '../services/storage';
import { getServerUrl } from '../services/api';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const user = useAuthStore(s => s.user);

  const {
    appendMessage, updateMessage, markDeleted, updateReactions,
    setOnlineUsers, setTyping, upsertConversation, incrementUnread,
  } = useChatStore();

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    connectSocket();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  async function connectSocket() {
    const serverUrl = getServerUrl();
    const token     = await storage.getAccessToken();
    if (!serverUrl || !token) return;

    const socket = io(serverUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join', { userId: user.id });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('connect_error', (err) => {
      console.warn('[Socket] connect error:', err.message);
      setConnected(false);
    });

    socket.on('users_online', (ids) => setOnlineUsers(ids));

    socket.on('message', (msg) => {
      appendMessage(msg.room_id, msg);
      upsertConversation({
        id: msg.room_id,
        lastMessage: msg,
        updatedAt: msg.created_at,
      });
    });

    socket.on('new_message_notif', (notif) => {
      upsertConversation({
        id: notif.room_id,
        lastMessage: notif,
        updatedAt: notif.created_at,
      });
      incrementUnread(notif.room_id);
    });

    socket.on('message_edited', ({ message_id, content, edited_at, room_id }) => {
      // We need to know the room_id for the message — look it up in store
      const msgs = useChatStore.getState().messages;
      for (const [rid, messages] of Object.entries(msgs)) {
        if (messages.some(m => m.id === message_id)) {
          updateMessage(rid, message_id, { content, is_edited: 1, edited_at });
          break;
        }
      }
    });

    socket.on('message_deleted', ({ message_id }) => {
      const msgs = useChatStore.getState().messages;
      for (const [rid, messages] of Object.entries(msgs)) {
        if (messages.some(m => m.id === message_id)) {
          markDeleted(rid, message_id);
          break;
        }
      }
    });

    socket.on('reaction_update', ({ message_id, reactions }) => {
      const msgs = useChatStore.getState().messages;
      for (const [rid, messages] of Object.entries(msgs)) {
        if (messages.some(m => m.id === message_id)) {
          updateReactions(rid, message_id, reactions);
          break;
        }
      }
    });

    socket.on('typing_status', ({ user_id, is_typing, room_id }) => {
      setTyping(room_id, user_id, is_typing);
    });

    socket.on('read_receipt', ({ user_id, message_ids }) => {
      // Update read receipts in messages
    });
  }

  const emit = (event, data, ack) => {
    if (socketRef.current?.connected) {
      if (ack) socketRef.current.emit(event, data, ack);
      else socketRef.current.emit(event, data);
    }
  };

  const joinRoom = (roomId) => emit('join_room', { roomId });

  const sendMessage = (payload, ack) => emit('send_message', payload, ack);

  const sendTyping = (roomId, userId, isTyping) =>
    emit('typing', { room_id: roomId, user_id: userId, is_typing: isTyping });

  const sendRead = (roomId, userId, messageIds) =>
    emit('read', { room_id: roomId, user_id: userId, message_ids: messageIds });

  const editMessage = (messageId, content, userId, ack) =>
    emit('edit_message', { message_id: messageId, content, user_id: userId }, ack);

  const deleteMessage = (messageId, userId, ack) =>
    emit('delete_message', { message_id: messageId, user_id: userId }, ack);

  const sendReaction = (messageId, userId, emoji, ack) =>
    emit('reaction', { message_id: messageId, user_id: userId, emoji }, ack);

  // WebRTC signaling
  const callOffer  = (to, offer, callType, from) => emit('call_offer',  { to, offer, callType, from });
  const callAnswer = (to, answer)                 => emit('call_answer', { to, answer });
  const callIce    = (to, candidate)              => emit('call_ice_candidate', { to, candidate });
  const callEnd    = (to)                         => emit('call_end',    { to });
  const callReject = (to)                         => emit('call_reject', { to });

  const on  = (event, cb) => socketRef.current?.on(event, cb);
  const off = (event, cb) => socketRef.current?.off(event, cb);

  return (
    <SocketContext.Provider value={{
      connected,
      joinRoom,
      sendMessage,
      sendTyping,
      sendRead,
      editMessage,
      deleteMessage,
      sendReaction,
      callOffer, callAnswer, callIce, callEnd, callReject,
      on, off,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
