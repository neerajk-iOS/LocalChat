import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
  conversations: [],   // [{ id, type:'dm'|'group', name, avatar, lastMessage, unread, updatedAt, ...meta }]
  messages:      {},   // { [roomId]: Message[] }
  onlineUsers:   [],   // userId[]
  typingUsers:   {},   // { [roomId]: { [userId]: true } }

  // ── Conversations ──────────────────────────────────────
  setConversations: (convos) => set({ conversations: convos }),

  upsertConversation: (convo) => {
    set(state => {
      const idx = state.conversations.findIndex(c => c.id === convo.id);
      if (idx === -1) return { conversations: [convo, ...state.conversations] };
      const updated = [...state.conversations];
      updated[idx] = { ...updated[idx], ...convo };
      // Sort by updatedAt descending
      updated.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return { conversations: updated };
    });
  },

  incrementUnread: (roomId) => {
    set(state => {
      const idx = state.conversations.findIndex(c => c.id === roomId);
      if (idx === -1) return {};
      const updated = [...state.conversations];
      updated[idx] = { ...updated[idx], unread: (updated[idx].unread || 0) + 1 };
      return { conversations: updated };
    });
  },

  clearUnread: (roomId) => {
    set(state => {
      const idx = state.conversations.findIndex(c => c.id === roomId);
      if (idx === -1) return {};
      const updated = [...state.conversations];
      updated[idx] = { ...updated[idx], unread: 0 };
      return { conversations: updated };
    });
  },

  // ── Messages ──────────────────────────────────────────
  setMessages: (roomId, messages) => {
    set(state => ({ messages: { ...state.messages, [roomId]: messages } }));
  },

  prependMessages: (roomId, older) => {
    set(state => ({
      messages: {
        ...state.messages,
        [roomId]: [...older, ...(state.messages[roomId] || [])],
      },
    }));
  },

  appendMessage: (roomId, msg) => {
    set(state => {
      const existing = state.messages[roomId] || [];
      // Deduplicate
      if (existing.some(m => m.id === msg.id)) return {};
      return { messages: { ...state.messages, [roomId]: [...existing, msg] } };
    });
  },

  updateMessage: (roomId, messageId, patch) => {
    set(state => {
      const msgs = state.messages[roomId];
      if (!msgs) return {};
      return {
        messages: {
          ...state.messages,
          [roomId]: msgs.map(m => m.id === messageId ? { ...m, ...patch } : m),
        },
      };
    });
  },

  markDeleted: (roomId, messageId) => {
    set(state => {
      const msgs = state.messages[roomId];
      if (!msgs) return {};
      return {
        messages: {
          ...state.messages,
          [roomId]: msgs.map(m =>
            m.id === messageId ? { ...m, is_deleted: 1, content: null, file_url: null } : m
          ),
        },
      };
    });
  },

  updateReactions: (roomId, messageId, reactions) => {
    set(state => {
      const msgs = state.messages[roomId];
      if (!msgs) return {};
      return {
        messages: {
          ...state.messages,
          [roomId]: msgs.map(m => m.id === messageId ? { ...m, reactions } : m),
        },
      };
    });
  },

  // ── Presence ──────────────────────────────────────────
  setOnlineUsers: (ids) => set({ onlineUsers: ids }),

  // ── Typing ────────────────────────────────────────────
  setTyping: (roomId, userId, isTyping) => {
    set(state => {
      const roomTyping = { ...(state.typingUsers[roomId] || {}) };
      if (isTyping) roomTyping[userId] = true;
      else delete roomTyping[userId];
      return { typingUsers: { ...state.typingUsers, [roomId]: roomTyping } };
    });
  },
}));
