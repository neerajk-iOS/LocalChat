import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../store/authStore';
import { api, getServerUrl } from '../services/api';
import Avatar from '../components/Avatar';
import { colors, typography, spacing, radii } from '../theme';

export default function EditProfileScreen({ navigation }) {
  const insets    = useSafeAreaInsets();
  const user      = useAuthStore(s => s.user);
  const updateUser = useAuthStore(s => s.updateUser);

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio,         setBio]         = useState(user?.bio || '');
  const [avatar,      setAvatar]      = useState(null); // new avatar asset
  const [saving,      setSaving]      = useState(false);

  const currentAvatarUri = user?.avatar_url
    ? user.avatar_url.startsWith('http') ? user.avatar_url : `${getServerUrl()}${user.avatar_url}`
    : null;

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Allow photo library access to change your avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      exif: false,
    });
    if (!result.canceled && result.assets?.length) setAvatar(result.assets[0]);
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Required', 'Display name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('display_name', displayName.trim());
      formData.append('bio', bio.trim());
      if (avatar) {
        formData.append('avatar', {
          uri:  avatar.uri,
          type: avatar.mimeType || 'image/jpeg',
          name: 'avatar.jpg',
        });
      }

      const updated = await api.updateUser(user.id, formData);
      await updateUser(updated);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const previewUri = avatar?.uri || currentAvatarUri;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={pickAvatar} style={styles.avatarBtn}>
              {previewUri ? (
                <Image source={{ uri: previewUri }} style={styles.avatarImg} />
              ) : (
                <Avatar name={displayName || '?'} size={100} />
              )}
              <View style={styles.cameraOverlay}>
                <Ionicons name="camera" size={20} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap to change photo</Text>
          </View>

          {/* Fields */}
          <View style={styles.fields}>
            <FieldGroup label="Display Name">
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                maxLength={50}
                returnKeyType="next"
              />
            </FieldGroup>

            <FieldGroup label="Bio">
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell people about yourself…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={200}
                returnKeyType="done"
              />
              <Text style={styles.charCount}>{bio.length}/200</Text>
            </FieldGroup>

            {/* Read-only email */}
            <FieldGroup label="Email">
              <View style={[styles.input, styles.readOnly]}>
                <Text style={styles.readOnlyText}>{user?.email}</Text>
              </View>
              <Text style={styles.readOnlyHint}>Email cannot be changed</Text>
            </FieldGroup>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function FieldGroup({ label, children }) {
  return (
    <View style={fgStyles.wrap}>
      <Text style={fgStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

const fgStyles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});

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
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    minWidth: 70,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: '#fff',
    fontWeight: typography.bold,
    fontSize: typography.sm,
  },
  scroll: {
    padding: spacing[6],
    gap: spacing[6],
  },
  avatarSection: {
    alignItems: 'center',
    gap: spacing[2],
  },
  avatarBtn: { position: 'relative' },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.background,
  },
  avatarHint: {
    fontSize: typography.sm,
    color: colors.textMuted,
  },
  fields: { gap: spacing[5] },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: typography.base,
    color: colors.text,
    minHeight: 50,
  },
  inputMulti: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: typography.xs,
    color: colors.textMuted,
    textAlign: 'right',
  },
  readOnly: {
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
  },
  readOnlyText: {
    fontSize: typography.base,
    color: colors.textMuted,
  },
  readOnlyHint: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
});
