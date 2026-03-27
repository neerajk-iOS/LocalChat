import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../store/authStore';
import Avatar from '../components/Avatar';
import { colors, typography, spacing, radii } from '../theme';

export default function RegisterScreen({ navigation }) {
  const [form, setForm] = useState({
    display_name: '',
    email: '',
    password: '',
    confirm: '',
    bio: '',
  });
  const [avatar,  setAvatar]  = useState(null);
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const register = useAuthStore(s => s.register);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Allow access to your photos to set a profile picture.');
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

  const handleRegister = async () => {
    const { display_name, email, password, confirm, bio } = form;
    if (!display_name.trim()) return Alert.alert('Required', 'Enter your display name.');
    if (!email.trim())        return Alert.alert('Required', 'Enter your email.');
    if (password.length < 8)  return Alert.alert('Weak password', 'Password must be at least 8 characters.');
    if (password !== confirm)  return Alert.alert('Mismatch', 'Passwords do not match.');

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('display_name', display_name.trim());
      formData.append('email', email.trim().toLowerCase());
      formData.append('password', password);
      if (bio.trim()) formData.append('bio', bio.trim());
      if (avatar) {
        formData.append('avatar', {
          uri:  avatar.uri,
          type: avatar.mimeType || 'image/jpeg',
          name: 'avatar.jpg',
        });
      }
      await register(formData);
    } catch (e) {
      Alert.alert('Registration failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#0F172A', '#1a0f3a']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join your LocalChat workspace</Text>
          </View>

          {/* Avatar picker */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={pickAvatar} style={styles.avatarBtn}>
              {avatar ? (
                <Image source={{ uri: avatar.uri }} style={styles.avatarImg} />
              ) : (
                <Avatar name={form.display_name || '?'} size={88} />
              )}
              <View style={styles.avatarOverlay}>
                <Ionicons name="camera" size={18} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Add profile photo</Text>
          </View>

          <View style={styles.card}>
            <Field
              label="Display Name"
              icon="person-outline"
              value={form.display_name}
              onChangeText={v => set('display_name', v)}
              placeholder="Your name"
              returnKeyType="next"
            />
            <Field
              label="Email"
              icon="mail-outline"
              value={form.email}
              onChangeText={v => set('email', v)}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
            />
            <Field
              label="Password"
              icon="lock-closed-outline"
              value={form.password}
              onChangeText={v => set('password', v)}
              placeholder="Min 8 characters"
              secureTextEntry={!showPw}
              returnKeyType="next"
              rightIcon={
                <TouchableOpacity onPress={() => setShowPw(v => !v)}>
                  <Ionicons
                    name={showPw ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              }
            />
            <Field
              label="Confirm Password"
              icon="lock-closed-outline"
              value={form.confirm}
              onChangeText={v => set('confirm', v)}
              placeholder="Repeat password"
              secureTextEntry={!showPw}
              returnKeyType="next"
            />
            <Field
              label="Bio (optional)"
              icon="document-text-outline"
              value={form.bio}
              onChangeText={v => set('bio', v)}
              placeholder="A short bio about yourself"
              returnKeyType="done"
              onSubmitEditing={handleRegister}
            />

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Create Account</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.loginText}>Already have an account? <Text style={styles.loginHighlight}>Sign in</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function Field({ label, icon, rightIcon, ...props }) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={fieldStyles.row}>
        <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={fieldStyles.input}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          {...props}
        />
        {rightIcon}
      </View>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    height: 50,
  },
  input: {
    flex: 1,
    fontSize: typography.base,
    color: colors.text,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[8],
    gap: spacing[5],
  },
  backBtn: {
    alignSelf: 'flex-start',
    padding: spacing[2],
  },
  header: { alignItems: 'center', gap: spacing[1] },
  title: {
    fontSize: typography['2xl'],
    fontWeight: typography.extrabold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.base,
    color: colors.textSecondary,
  },
  avatarSection: { alignItems: 'center', gap: spacing[2] },
  avatarBtn: { position: 'relative' },
  avatarImg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  avatarHint: {
    fontSize: typography.sm,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[6],
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[4],
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[1],
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: '#fff',
    fontSize: typography.md,
    fontWeight: typography.bold,
  },
  loginLink: { alignItems: 'center' },
  loginText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  loginHighlight: {
    color: colors.primary,
    fontWeight: typography.semibold,
  },
});
