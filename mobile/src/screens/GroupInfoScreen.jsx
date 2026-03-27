import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { api, getServerUrl } from '../services/api';
import Avatar from '../components/Avatar';
import { colors, typography, spacing, radii } from '../theme';
import { useChatStore } from '../store/chatStore';

export default function GroupInfoScreen({ route, navigation }) {
  const { groupId, conversation } = route.params;
  const insets   = useSafeAreaInsets();
  const user     = useAuthStore(s => s.user);
  const onlineUsers = useChatStore(s => s.onlineUsers);

  const [group,   setGroup]   = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchGroup = async () => {
    try {
      const data = await api.getGroup(groupId);
      setGroup(data);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGroup(); }, [groupId]);

  const myRole = group?.members?.find(m => m.id === user.id)?.role;
  const isAdmin = myRole === 'admin';

  const avatarUri = group?.avatar_url
    ? group.avatar_url.startsWith('http') ? group.avatar_url : `${getServerUrl()}${group.avatar_url}`
    : null;

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Info</Text>
        {isAdmin && (
          <TouchableOpacity style={styles.editBtn}>
            <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Group header */}
        <View style={styles.groupHeader}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.groupAvatar} />
          ) : (
            <Avatar name={group?.name || ''} size={88} />
          )}
          <Text style={styles.groupName}>{group?.name}</Text>
          {group?.description ? (
            <Text style={styles.groupDesc}>{group.description}</Text>
          ) : null}
          <Text style={styles.memberCount}>
            {group?.members?.length || 0} members
          </Text>
        </View>

        {/* Members */}
        <Text style={styles.sectionTitle}>Members</Text>
        <View style={styles.membersList}>
          {group?.members?.map((member, i) => (
            <View key={member.id}>
              <View style={styles.memberRow}>
                <Avatar
                  uri={member.avatar_url}
                  name={member.display_name}
                  size={44}
                  online={onlineUsers.includes(member.id)}
                />
                <View style={{ flex: 1 }}>
                  <View style={styles.memberNameRow}>
                    <Text style={styles.memberName}>{member.display_name}</Text>
                    {member.id === user.id && (
                      <Text style={styles.youBadge}>You</Text>
                    )}
                  </View>
                  <Text style={styles.memberRole}>
                    {member.role === 'admin' ? '👑 Admin' : 'Member'}
                  </Text>
                </View>
                {onlineUsers.includes(member.id) && (
                  <View style={styles.onlineDot} />
                )}
              </View>
              {i < group.members.length - 1 && (
                <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 64 }} />
              )}
            </View>
          ))}
        </View>

        {/* Leave group */}
        <TouchableOpacity
          style={styles.leaveBtn}
          onPress={() => Alert.alert(
            'Leave Group',
            'Are you sure you want to leave this group?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Leave',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await api.removeGroupMember(groupId, user.id, user.id);
                    navigation.popToTop();
                  } catch (e) {
                    Alert.alert('Error', e.message);
                  }
                },
              },
            ]
          )}
        >
          <Ionicons name="exit-outline" size={20} color={colors.error} />
          <Text style={styles.leaveBtnText}>Leave Group</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn:   { padding: spacing[2] },
  headerTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.text,
  },
  editBtn: { padding: spacing[2] },
  scroll: {
    padding: spacing[4],
    gap: spacing[4],
  },
  groupHeader: {
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
  },
  groupAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  groupName: {
    fontSize: typography.xl,
    fontWeight: typography.extrabold,
    color: colors.text,
    textAlign: 'center',
  },
  groupDesc: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing[4],
    lineHeight: 20,
  },
  memberCount: {
    fontSize: typography.sm,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing[2],
  },
  membersList: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  memberName: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.text,
  },
  youBadge: {
    fontSize: typography.xs,
    color: colors.primary,
    backgroundColor: colors.primaryFade,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.full,
    fontWeight: typography.semibold,
  },
  memberRole: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.online,
  },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorFade,
    borderRadius: radii.xl,
    padding: spacing[4],
    gap: spacing[2],
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    marginTop: spacing[4],
  },
  leaveBtnText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.error,
  },
});
