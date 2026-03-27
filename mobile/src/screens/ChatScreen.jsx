import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActionSheetIOS, Alert,
  ActivityIndicator, StatusBar, Modal, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useSocket } from '../contexts/SocketContext';
import { api } from '../services/api';
import { colors, typography, spacing, radii } from '../theme';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import Avatar from '../components/Avatar';

export default function ChatScreen({ route, navigation }) {
  const { conversation } = route.params;
  const insets    = useSafeAreaInsets();
  const user      = useAuthStore(s => s.user);
  const { messages, setMessages, prependMessages, onlineUsers, typingUsers, clearUnread } = useChatStore();
  const socket    = useSocket();

  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [hasMore,      setHasMore]      = useState(true);
  const [replyTo,      setReplyTo]      = useState(null);
  const [lightboxUri,  setLightboxUri]  = useState(null);

  const flatRef   = useRef(null);
  const typingRef = useRef(null);
  const roomId    = conversation.id;
  const msgs      = messages[roomId] || [];
  const typing    = typingUsers[roomId] || {};
  const typingPeople = Object.keys(typing).filter(id => id !== user.id);

  const isOnline = conversation.type === 'dm'
    ? onlineUsers.includes(conversation.userId)
    : null;

  useEffect(() => {
    socket.joinRoom(roomId);
    clearUnread(roomId);
    loadMessages();

    return () => {
      socket.sendTyping(roomId, user.id, false);
    };
  }, [roomId]);

  async function loadMessages(before = null) {
    if (!before) setLoading(true);
    try {
      const data = await api.getMessages(roomId, before, 40);
      if (before) {
        prependMessages(roomId, data);
        if (data.length < 40) setHasMore(false);
      } else {
        setMessages(roomId, data);
        setHasMore(data.length === 40);
      }
    } catch (e) {
      console.error('loadMessages', e);
    } finally {
      setLoading(false);
    }
  }

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore || msgs.length === 0) return;
    setLoadingMore(true);
    await loadMessages(msgs[0]?.created_at);
    setLoadingMore(false);
  };

  const handleSend = useCallback((payload) => {
    socket.sendMessage({
      ...payload,
      sender_id: user.id,
      room_id:   roomId,
      reply_to_id: replyTo?.id || null,
    });
    setReplyTo(null);
  }, [user.id, roomId, replyTo, socket]);

  const handleTyping = (text) => {
    clearTimeout(typingRef.current);
    socket.sendTyping(roomId, user.id, text.length > 0);
    typingRef.current = setTimeout(
      () => socket.sendTyping(roomId, user.id, false),
      3000
    );
  };

  const handleLongPress = (msg) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isOwn = msg.sender_id === user.id;

    const options = ['Cancel', 'Reply'];
    if (isOwn) options.push('Edit', 'Delete');

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 0, destructiveButtonIndex: isOwn ? options.length - 1 : undefined },
        (idx) => {
          if (idx === 0) return;
          if (options[idx] === 'Reply')  setReplyTo(msg);
          if (options[idx] === 'Delete') confirmDelete(msg);
          if (options[idx] === 'Edit')   promptEdit(msg);
        }
      );
    } else {
      const actions = [
        { text: 'Reply',  onPress: () => setReplyTo(msg) },
        ...(isOwn ? [
          { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(msg) },
        ] : []),
        { text: 'Cancel', style: 'cancel' },
      ];
      Alert.alert('Message', undefined, actions);
    }
  };

  const confirmDelete = (msg) => {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => socket.deleteMessage(msg.id, user.id),
      },
    ]);
  };

  const promptEdit = (msg) => {
    Alert.prompt(
      'Edit message',
      undefined,
      (newContent) => {
        if (newContent?.trim()) {
          socket.editMessage(msg.id, newContent.trim(), user.id);
        }
      },
      'plain-text',
      msg.content,
    );
  };

  const subtitle = conversation.type === 'dm'
    ? (isOnline ? 'Online' : 'Offline')
    : `${conversation.memberCount || ''} members`;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerInfo}
          onPress={() =>
            conversation.type === 'group'
              ? navigation.navigate('GroupInfo', { groupId: conversation.groupId, conversation })
              : navigation.navigate('UserProfile', { userId: conversation.userId })
          }
        >
          <Avatar
            uri={conversation.avatar}
            name={conversation.name}
            size={38}
            online={isOnline}
          />
          <View>
            <Text style={styles.headerName} numberOfLines={1}>{conversation.name}</Text>
            <Text style={styles.headerSub}>
              {typingPeople.length > 0
                ? `${typingPeople.length > 1 ? 'Several people' : 'Someone'} is typing…`
                : subtitle}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {conversation.type === 'dm' && (
            <>
              <TouchableOpacity style={styles.headerIcon}>
                <Ionicons name="call-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIcon}>
                <Ionicons name="videocam-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={msgs}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => {
              const prev = msgs[index - 1];
              const showAvatar = !prev || prev.sender_id !== item.sender_id;
              return (
                <MessageBubble
                  message={item}
                  isOwn={item.sender_id === user.id}
                  showAvatar={showAvatar}
                  onLongPress={handleLongPress}
                  onReply={setReplyTo}
                  onImagePress={setLightboxUri}
                  currentUserId={user.id}
                />
              );
            }}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.2}
            ListHeaderComponent={
              loadingMore ? (
                <ActivityIndicator color={colors.primary} style={{ padding: spacing[3] }} />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Avatar uri={conversation.avatar} name={conversation.name} size={64} />
                <Text style={styles.emptyChatName}>{conversation.name}</Text>
                <Text style={styles.emptyChatHint}>
                  {conversation.type === 'dm'
                    ? 'This is the beginning of your conversation.'
                    : 'Welcome to the group! Say hi 👋'}
                </Text>
              </View>
            }
            contentContainerStyle={{ paddingVertical: spacing[3] }}
            showsVerticalScrollIndicator={false}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            inverted={false}
          />
        )}

        <MessageInput
          onSend={handleSend}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onTyping={handleTyping}
        />
      </KeyboardAvoidingView>

      {/* Image lightbox */}
      <Modal visible={!!lightboxUri} transparent animationType="fade">
        <View style={styles.lightbox}>
          <TouchableOpacity
            style={styles.lightboxClose}
            onPress={() => setLightboxUri(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {lightboxUri && (
            <Image
              source={{ uri: lightboxUri }}
              style={styles.lightboxImg}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingBottom: spacing[2],
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing[1],
  },
  backBtn: {
    padding: spacing[2],
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  headerName: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: colors.text,
    maxWidth: 180,
  },
  headerSub: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChat: {
    alignItems: 'center',
    paddingTop: 80,
    gap: spacing[3],
  },
  emptyChatName: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.text,
  },
  emptyChatHint: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing[8],
  },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  lightboxImg: {
    width: '100%',
    height: '80%',
  },
});
