import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { colors, typography, spacing, radii } from '../theme';

export default function ServerSetupScreen() {
  const [url, setUrl]     = useState('');
  const [loading, setLoading] = useState(false);
  const setServerUrl      = useAuthStore(s => s.setServerUrl);

  const handleConnect = async () => {
    let trimmed = url.trim().replace(/\/$/, '');
    if (!trimmed) {
      Alert.alert('Required', 'Please enter your server URL.');
      return;
    }

    // Auto-prepend https:// if no scheme given
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = `https://${trimmed}`;
      setUrl(trimmed);
    }

    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${trimmed}/api/auth/me`, {
        method: 'GET',
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      // 401 = server reachable, just needs auth — that's fine
      if (res.status === 401 || res.ok) {
        await setServerUrl(trimmed);
        // Navigation reacts automatically — no explicit navigate() needed
        return;
      }
      throw new Error(`Server returned ${res.status}`);
    } catch (e) {
      if (e.name === 'AbortError') {
        Alert.alert('Timeout', 'Server took too long to respond. Check the URL and try again.');
      } else {
        Alert.alert(
          'Cannot connect',
          `Could not reach the server.\n\n${trimmed}\n\nCheck the URL and your network connection.`,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#0F172A', '#1a0f3a']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        <View style={styles.logo}>
          <View style={styles.logoIcon}>
            <Ionicons name="chatbubbles" size={40} color="#fff" />
          </View>
          <Text style={styles.title}>LocalChat</Text>
          <Text style={styles.subtitle}>Connect to your server</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Server URL</Text>
          <View style={styles.inputRow}>
            <Ionicons name="server-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={setUrl}
              placeholder="chat.example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleConnect}
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleConnect}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Connect →</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>
            Enter your server address. https:// is added automatically.{'\n'}
            On local network: <Text style={styles.hintCode}>192.168.x.x:3700</Text>
            {'\n'}Public: <Text style={styles.hintCode}>chat.example.com</Text>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[8],
  },
  logo: {
    alignItems: 'center',
    gap: spacing[2],
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  title: {
    fontSize: typography['3xl'],
    fontWeight: typography.extrabold,
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: typography.base,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[6],
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[4],
  },
  label: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    height: 48,
    fontSize: typography.base,
    color: colors.text,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: '#fff',
    fontSize: typography.md,
    fontWeight: typography.bold,
  },
  hint: {
    fontSize: typography.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  hintCode: {
    color: colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
