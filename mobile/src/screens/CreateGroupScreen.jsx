import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import Avatar from '../components/Avatar';
import { colors, typography, spacing, radii } from '../theme';

export default function CreateGroupScreen({ navigation }) {
  const insets  = useSafeAreaInsets();
  const user    = useAuthStore(s => s.user);

  const [name,      setName]      = useState('');
  const [desc,      setDesc]      = useState('');
  const [avatar,    setAvatar]    = useState(null);
  const [users,     setUsers]     = useState([]);
  const [selected,  setSelected]  = useState(new Set());
  const [search,    setSearch]    = useState('');
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    api.getUsers()
      .then(all => setUsers(all.filter(u => u.id !== user.id)))
      .catch(console.error);
  }, []);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      exif: false,
    });
    if (!result.canceled && result.assets?.length) setAvatar(result.assets[0]);
  };

  const toggleUser = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a group name.');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('name',        name.trim());
      formData.append('description', desc.trim());
      formData.append('created_by',  user.id);
      formData.append('member_ids',  JSON.stringify([...selected]));
      if (avatar) {
        formData.append('avatar', {
          uri:  avatar.uri,
          type: avatar.mimeType || 'image/jpeg',
          name: 'group-avatar.jpg',
        });
      }

      const group = await api.createGroup(formData);
      navigation.replace('Chat', {
        conversation: {
          id:          `group:${group.id}`,
          type:        'group',
          name:        group.name,
          avatar:      group.avatar_url,
          groupId:     group.id,
          memberCount: group.members?.length || 1,
        },
      });
    } catch (e) {
      Alert.alert('Failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = users.filter(u =>
    u.display_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Group</Text>
        <TouchableOpacity
          style={[styles.createBtn, (!name.trim() || saving) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!name.trim() || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.createBtnText}>Create</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Group info */}
        <View style={styles.infoRow}>
          <TouchableOpacity onPress={pickAvatar} style={styles.avatarBtn}>
            {avatar ? (
              <Image source={{ uri: avatar.uri }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="camera" size={22} color={colors.textMuted} />
              </View>
            )}
          </TouchableOpacity>
          <View style={{ flex: 1, gap: 8 }}>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Group name"
              placeholderTextColor={colors.textMuted}
              maxLength={60}
            />
            <TextInput
              style={styles.descInput}
              value={desc}
              onChangeText={setDesc}
              placeholder="Description (optional)"
              placeholderTextColor={colors.textMuted}
              maxLength={200}
            />
          </View>
        </View>

        {/* Selected members summary */}
        {selected.size > 0 && (
          <View style={styles.selectedBar}>
            <Text style={styles.selectedText}>
              {selected.size} member{selected.size !== 1 ? 's' : ''} selected
            </Text>
          </View>
        )}

        {/* User search */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Add members…"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <TouchableOpacity
                style={styles.userRow}
                onPress={() => toggleUser(item.id)}
              >
                <Avatar uri={item.avatar_url} name={item.display_name} size={44} />
                <Text style={styles.userName}>{item.display_name}</Text>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 68 }} />
          )}
          showsVerticalScrollIndicator={false}
        />
      </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { padding: spacing[1] },
  headerTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.text,
  },
  createBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    minWidth: 70,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: {
    color: '#fff',
    fontWeight: typography.bold,
    fontSize: typography.sm,
  },
  infoRow: {
    flexDirection: 'row',
    padding: spacing[4],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'flex-start',
  },
  avatarBtn: {},
  avatarImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: {
    fontSize: typography.base,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    height: 44,
  },
  descInput: {
    fontSize: typography.sm,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    height: 40,
  },
  selectedBar: {
    backgroundColor: colors.primaryFade,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectedText: {
    fontSize: typography.sm,
    color: colors.primary,
    fontWeight: typography.semibold,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[2],
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.text,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  userName: {
    flex: 1,
    fontSize: typography.base,
    color: colors.text,
    fontWeight: typography.medium,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
