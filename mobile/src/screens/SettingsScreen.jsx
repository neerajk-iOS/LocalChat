import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { colors, typography, spacing, radii } from '../theme';

export default function SettingsScreen({ navigation }) {
  const insets     = useSafeAreaInsets();
  const serverUrl  = useAuthStore(s => s.serverUrl);
  const setServer  = useAuthStore(s => s.setServerUrl);
  const user       = useAuthStore(s => s.user);

  const [urlInput, setUrlInput] = useState(serverUrl);
  const [saving,   setSaving]   = useState(false);

  const handleSaveUrl = async () => {
    const trimmed = urlInput.trim().replace(/\/$/, '');
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${trimmed}/api/auth/me`);
      if (res.status === 401 || res.ok) {
        await setServer(trimmed);
        Alert.alert('Saved', 'Server URL updated. You may need to re-login.');
      } else {
        throw new Error('Server did not respond correctly');
      }
    } catch {
      Alert.alert('Cannot reach server', 'Check the URL and your connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Server connection */}
        <Section title="Server Connection">
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Server URL</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={urlInput}
                onChangeText={setUrlInput}
                placeholder="https://chat.example.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
              />
            </View>
            <Text style={styles.fieldHint}>
              The base URL of your LocalChat server. Changes take effect on next app launch.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSaveUrl}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>Update Server URL</Text>
            }
          </TouchableOpacity>
        </Section>

        {/* Account info */}
        <Section title="Account">
          <InfoRow label="Name"     value={user?.display_name} />
          <InfoRow label="Email"    value={user?.email} />
          <InfoRow label="User ID"  value={user?.id} mono />
        </Section>

        {/* About */}
        <Section title="About">
          <InfoRow label="App Version" value="2.0.0" />
          <InfoRow label="Platform"    value="LocalChat Mobile" />
        </Section>

        <Text style={styles.footer}>
          LocalChat — Secure self-hosted messaging
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={sStyles.wrap}>
      <Text style={sStyles.title}>{title}</Text>
      <View style={sStyles.card}>{children}</View>
    </View>
  );
}

const sStyles = StyleSheet.create({
  wrap: { marginBottom: spacing[6] },
  title: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing[2],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});

function InfoRow({ label, value, mono }) {
  return (
    <View style={iStyles.row}>
      <Text style={iStyles.label}>{label}</Text>
      <Text style={[iStyles.value, mono && iStyles.mono]} numberOfLines={1} selectable>
        {value || '—'}
      </Text>
    </View>
  );
}

const iStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  value: {
    fontSize: typography.sm,
    color: colors.text,
    fontWeight: typography.medium,
    maxWidth: '60%',
    textAlign: 'right',
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: typography.xs,
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
  backBtn: { padding: spacing[2] },
  title: {
    fontSize: typography.lg,
    fontWeight: typography.bold,
    color: colors.text,
  },
  scroll: {
    padding: spacing[4],
    gap: spacing[2],
  },
  fieldWrap: {
    padding: spacing[4],
    gap: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fieldLabel: {
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
  },
  inputRow: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    height: 48,
    justifyContent: 'center',
  },
  input: {
    fontSize: typography.sm,
    color: colors.text,
  },
  fieldHint: {
    fontSize: typography.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    margin: spacing[4],
    borderRadius: radii.md,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: '#fff',
    fontWeight: typography.bold,
    fontSize: typography.sm,
  },
  footer: {
    textAlign: 'center',
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: spacing[4],
  },
});
