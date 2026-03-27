import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, typography, spacing, radii } from '../theme';
import { getServerUrl } from '../services/api';
import Avatar from './Avatar';

export default function MessageBubble({
  message,
  isOwn,
  showAvatar,
  onLongPress,
  onReply,
  onImagePress,
  currentUserId,
}) {
  const [imageError, setImageError] = useState(false);
  if (!message) return null;

  const isDeleted = message.is_deleted === 1;
  const isImage   = message.type === 'image' ||
    (message.file_mime && message.file_mime.startsWith('image/'));
  const isAudio   = message.type === 'audio' ||
    (message.file_mime && message.file_mime.startsWith('audio/'));
  const isFile    = message.type === 'file' || message.file_url;

  const timeStr = format(new Date(message.created_at), 'HH:mm');
  const fileUrl = message.file_url
    ? `${getServerUrl()}${message.file_url}`
    : null;

  const reactions = message.reactions || [];
  const grouped = {};
  reactions.forEach(r => {
    if (!grouped[r.emoji]) grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
    grouped[r.emoji].count++;
    grouped[r.emoji].users.push(r);
  });

  return (
    <View style={[styles.row, isOwn && styles.rowOwn]}>
      {!isOwn && (
        <View style={styles.avatarWrap}>
          {showAvatar ? (
            <Avatar uri={message.sender_avatar} name={message.sender_name} size={32} />
          ) : (
            <View style={{ width: 32 }} />
          )}
        </View>
      )}

      <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn]}>
        {!isOwn && showAvatar && (
          <Text style={styles.senderName}>{message.sender_name}</Text>
        )}

        {/* Reply preview */}
        {message.reply_to_id && message.reply_content && (
          <View style={[styles.replyBar, isOwn && styles.replyBarOwn]}>
            <View style={[styles.replyAccent, isOwn && styles.replyAccentOwn]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyFrom, isOwn && styles.replyFromOwn]}>
                {message.reply_sender_name || 'Unknown'}
              </Text>
              <Text style={[styles.replyText, isOwn && styles.replyTextOwn]} numberOfLines={1}>
                {message.reply_content || (message.reply_type !== 'text' ? '📎 File' : '')}
              </Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => !isDeleted && onLongPress?.(message)}
          style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleIn]}
        >
          {isDeleted ? (
            <Text style={styles.deleted}>🚫 Message deleted</Text>
          ) : (
            <>
              {/* Image */}
              {isImage && fileUrl && !imageError ? (
                <TouchableOpacity onPress={() => onImagePress?.(fileUrl)}>
                  <Image
                    source={{ uri: fileUrl }}
                    style={styles.image}
                    resizeMode="cover"
                    onError={() => setImageError(true)}
                  />
                </TouchableOpacity>
              ) : null}

              {/* Audio */}
              {isAudio && fileUrl && (
                <TouchableOpacity
                  style={styles.audioRow}
                  onPress={() => Alert.alert('Audio', 'Audio playback coming soon')}
                >
                  <Ionicons name="play-circle" size={32} color={isOwn ? '#fff' : colors.primary} />
                  <Text style={[styles.audioLabel, isOwn && styles.ownText]}>
                    {message.file_name || 'Voice message'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Generic file */}
              {isFile && !isImage && !isAudio && fileUrl && (
                <TouchableOpacity
                  style={styles.fileRow}
                  onPress={() => Linking.openURL(fileUrl)}
                >
                  <Ionicons name="document-attach" size={22} color={isOwn ? '#fff' : colors.primary} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.fileName, isOwn && styles.ownText]} numberOfLines={1}>
                      {message.file_name || 'File'}
                    </Text>
                    {message.file_size && (
                      <Text style={[styles.fileSize, isOwn && styles.ownSubText]}>
                        {formatBytes(message.file_size)}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="download-outline" size={18} color={isOwn ? '#ccc' : colors.textSecondary} />
                </TouchableOpacity>
              )}

              {/* Text content */}
              {message.content ? (
                <Text style={[styles.text, isOwn && styles.ownText]}>
                  {message.content}
                </Text>
              ) : null}
            </>
          )}

          {/* Time + edited indicator */}
          <View style={styles.metaRow}>
            {message.is_edited === 1 && (
              <Text style={[styles.edited, isOwn && styles.ownSubText]}>edited </Text>
            )}
            <Text style={[styles.time, isOwn && styles.ownSubText]}>{timeStr}</Text>
            {isOwn && (
              <Ionicons
                name="checkmark-done"
                size={13}
                color="rgba(255,255,255,0.6)"
                style={{ marginLeft: 2 }}
              />
            )}
          </View>
        </TouchableOpacity>

        {/* Reactions */}
        {Object.keys(grouped).length > 0 && (
          <View style={[styles.reactionsRow, isOwn && styles.reactionsOwn]}>
            {Object.values(grouped).map(r => (
              <View key={r.emoji} style={styles.reactionChip}>
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 1,
    paddingHorizontal: 12,
  },
  rowOwn: {
    flexDirection: 'row-reverse',
  },
  avatarWrap: {
    marginRight: 8,
    marginBottom: 2,
  },
  bubbleWrap: {
    maxWidth: '75%',
  },
  bubbleWrapOwn: {
    alignItems: 'flex-end',
  },
  senderName: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.primary,
    marginBottom: 3,
    marginLeft: 2,
  },
  replyBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radii.sm,
    marginBottom: 4,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  replyBarOwn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  replyAccent: {
    width: 3,
    backgroundColor: colors.primary,
  },
  replyAccentOwn: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  replyFrom: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.primary,
    paddingHorizontal: 8,
    paddingTop: 5,
  },
  replyFromOwn: {
    color: 'rgba(255,255,255,0.8)',
  },
  replyText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    paddingHorizontal: 8,
    paddingBottom: 5,
  },
  replyTextOwn: {
    color: 'rgba(255,255,255,0.6)',
  },
  bubble: {
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    minWidth: 60,
  },
  bubbleOwn: {
    backgroundColor: colors.bubbleOut,
    borderBottomRightRadius: 4,
  },
  bubbleIn: {
    backgroundColor: colors.bubbleIn,
    borderBottomLeftRadius: 4,
  },
  deleted: {
    fontSize: typography.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  text: {
    fontSize: typography.base,
    color: colors.bubbleInText,
    lineHeight: 21,
  },
  ownText: {
    color: colors.bubbleOutText,
  },
  image: {
    width: 220,
    height: 180,
    borderRadius: radii.md,
    marginBottom: 4,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  audioLabel: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    minWidth: 160,
  },
  fileName: {
    fontSize: typography.sm,
    color: colors.text,
    fontWeight: typography.medium,
  },
  fileSize: {
    fontSize: typography.xs,
    color: colors.textSecondary,
  },
  ownSubText: {
    color: 'rgba(255,255,255,0.55)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 3,
    gap: 2,
  },
  time: {
    fontSize: 10,
    color: colors.textMuted,
  },
  edited: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionsOwn: {
    justifyContent: 'flex-end',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: 11,
    color: colors.textSecondary,
    marginLeft: 3,
    fontWeight: typography.semibold,
  },
});
