import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, StatusBar, SectionList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { api } from '../services/api';
import { colors, typography, spacing, radii } from '../theme';
import ConversationItem from '../components/ConversationItem';
import Avatar from '../components/Avatar';

function getDmRoomId(uid1, uid2) {
  return uid1 < uid2 ? `dm_${uid1}_${uid2}` : `dm_${uid2}_${uid1}`;
}

export default function ConversationsScreen({ navigation }) {
  const insets    = useSafeAreaInsets();
  const user      = useAuthStore(s => s.user);
  const { conversations, setConversations, onlineUsers } = useChatStore();
  const [allUsers,    setAllUsers]    = useState([]);
  const [search,      setSearch]      = useState('');
  const [refreshing,  setRefreshing]  = useState(false);
  const [tab,         setTab]         = useState('chats'); // 'chats' | 'people'

  const loadData = useCallback(async () => {
    try {
      const [users, groups] = await Promise.all([
        api.getUsers(),
        api.getMyGroups(user.id),
      ]);

      setAllUsers(users.filter(u => u.id !== user.id));

      // Build conversations list
      const dmConvos = users
        .filter(u => u.id !== user.id)
        .map(u => {
          const roomId = getDmRoomId(user.id, u.id);
          const existing = conversations.find(c => c.id === roomId);
          return {
            id:        roomId,
            type:      'dm',
            name:      u.display_name,
            avatar:    u.avatar_url,
            userId:    u.id,
            lastMessage: existing?.lastMessage || null,
            unread:      existing?.unread || 0,
            updatedAt:   existing?.updatedAt || 0,
          };
        });

      const groupConvos = groups.map(g => {
        const roomId  = `group:${g.id}`;
        const existing = conversations.find(c => c.id === roomId);
        return {
          id:        roomId,
          type:      'group',
          name:      g.name,
          avatar:    g.avatar_url,
          groupId:   g.id,
          lastMessage: existing?.lastMessage || null,
          unread:      existing?.unread || 0,
          updatedAt:   existing?.updatedAt || 0,
          memberCount: g.member_count,
        };
      });

      const all = [...dmConvos, ...groupConvos].sort(
        (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
      );
      setConversations(all);
    } catch (e) {
      console.error(e);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openChat = (convo) => {
    navigation.navigate('Chat', { conversation: convo });
  };

  const filteredConvos = conversations.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredUsers = allUsers.filter(u =>
    u.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>LocalChat</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('CreateGroup')}
          >
            <Ionicons name="people-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
          >
            <Avatar uri={user?.avatar_url} name={user?.display_name} size={34} online />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={tab === 'chats' ? 'Search conversations…' : 'Find people…'}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {['chats', 'people'].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'chats' ? 'Chats' : 'People'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'chats' ? (
        <FlatList
          data={filteredConvos}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ConversationItem
              conversation={item}
              isOnline={onlineUsers.includes(item.userId)}
              onPress={() => openChat(item)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptyText}>Switch to "People" to start chatting</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.userItem}
              onPress={() =>
                openChat({
                  id:   getDmRoomId(user.id, item.id),
                  type: 'dm',
                  name: item.display_name,
                  avatar: item.avatar_url,
                  userId: item.id,
                })
              }
            >
              <Avatar
                uri={item.avatar_url}
                name={item.display_name}
                size={48}
                online={onlineUsers.includes(item.id)}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.display_name}</Text>
                <Text style={styles.userStatus}>
                  {onlineUsers.includes(item.id)
                    ? '🟢 Online'
                    : item.bio || 'Offline'}
                </Text>
              </View>
              <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No users found</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (tab === 'chats') setTab('people');
          else setTab('people');
        }}
      >
        <Ionicons name="create-outline" size={24} color="#fff" />
      </TouchableOpacity>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  title: {
    fontSize: typography.xl,
    fontWeight: typography.extrabold,
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing[3],
    height: 40,
    gap: spacing[2],
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.text,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    marginBottom: spacing[2],
    gap: spacing[2],
  },
  tab: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1],
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primaryFade,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: typography.medium,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: typography.semibold,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 72,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: 12,
  },
  userName: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.text,
  },
  userStatus: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: spacing[3],
  },
  emptyTitle: {
    fontSize: typography.md,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
  },
  emptyText: {
    fontSize: typography.sm,
    color: colors.textMuted,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
