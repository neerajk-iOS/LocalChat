import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatDistanceToNowStrict } from 'date-fns';
import { colors, typography, spacing, radii } from '../theme';
import Avatar from './Avatar';

export default function ConversationItem({ conversation, onPress, isOnline }) {
  const { name, avatar, lastMessage, unread, type } = conversation;

  const lastText = lastMessage
    ? lastMessage.is_deleted
      ? '🚫 Deleted message'
      : lastMessage.type === 'image'
      ? '📷 Image'
      : lastMessage.type === 'file'
      ? `📎 ${lastMessage.file_name || 'File'}`
      : lastMessage.type === 'audio'
      ? '🎵 Voice message'
      : lastMessage.content || ''
    : '';

  const timeStr = lastMessage?.created_at
    ? formatDistanceToNowStrict(new Date(lastMessage.created_at), { addSuffix: false })
        .replace(' seconds', 's')
        .replace(' second', 's')
        .replace(' minutes', 'm')
        .replace(' minute', 'm')
        .replace(' hours', 'h')
        .replace(' hour', 'h')
        .replace(' days', 'd')
        .replace(' day', 'd')
    : '';

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Avatar
        uri={avatar}
        name={name}
        size={52}
        online={type === 'dm' ? isOnline : undefined}
      />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.time}>{timeStr}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text
            style={[styles.lastMsg, unread > 0 && styles.lastMsgUnread]}
            numberOfLines={1}
          >
            {lastText || (type === 'group' ? 'Group conversation' : 'Start a conversation')}
          </Text>
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: 12,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMsg: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  lastMsgUnread: {
    color: colors.text,
    fontWeight: typography.medium,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: typography.bold,
    color: '#fff',
  },
});
