import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, StatusBar, Switch, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { colors, typography, spacing, radii, shadows } from '../theme';
import { getServerUrl } from '../services/api';
import Avatar from '../components/Avatar';

const STATUS_OPTIONS = ['online', 'away', 'busy', 'offline'];
const STATUS_META = {
  online:  { color: '#10B981', icon: 'radio-button-on',  label: 'Online' },
  away:    { color: '#F59E0B', icon: 'time-outline',      label: 'Away' },
  busy:    { color: '#EF4444', icon: 'remove-circle',     label: 'Do Not Disturb' },
  offline: { color: '#64748B', icon: 'radio-button-off',  label: 'Appear Offline' },
};

export default function ProfileScreen({ navigation }) {
  const insets  = useSafeAreaInsets();
  const user    = useAuthStore(s => s.user);
  const logout  = useAuthStore(s => s.logout);
  const [status, setStatus] = useState(user?.status || 'online');

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const statusMeta = STATUS_META[status] || STATUS_META.online;
  const avatarUri  = user?.avatar_url
    ? user.avatar_url.startsWith('http')
      ? user.avatar_url
      : `${getServerUrl()}${user.avatar_url}`
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Gradient header */}
      <LinearGradient
        colors={['#1E1040', '#0F172A']}
        style={styles.headerGrad}
      >
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Ionicons name="pencil" size={16} color={colors.text} />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <Avatar name={user?.display_name || '?'} size={96} />
            )}
            <View style={[styles.statusDot, { backgroundColor: statusMeta.color }]} />
          </View>
          <Text style={styles.displayName}>{user?.display_name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.bio ? (
            <Text style={styles.bio}>{user.bio}</Text>
          ) : null}
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing[6] }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status selector */}
        <Section title="Status">
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map(s => {
              const meta = STATUS_META[s];
              const active = status === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusOption, active && styles.statusOptionActive]}
                  onPress={() => setStatus(s)}
                >
                  <View style={[styles.statusDotSmall, { backgroundColor: meta.color }]} />
                  <Text style={[styles.statusLabel, active && styles.statusLabelActive]}>
                    {meta.label}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark" size={14} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* Account info */}
        <Section title="Account">
          <InfoRow icon="mail-outline"         label="Email"        value={user?.email} />
          <InfoRow icon="calendar-outline"     label="Member since" value={formatDate(user?.created_at)} />
          <InfoRow icon="time-outline"         label="Last seen"    value={formatDate(user?.last_seen)} />
        </Section>

        {/* Settings links */}
        <Section title="Settings">
          <MenuItem
            icon="settings-outline"
            label="App Settings"
            onPress={() => navigation.navigate('Settings')}
          />
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            onPress={() => Alert.alert('Coming soon', 'Notification settings will be available in a future update.')}
          />
          <MenuItem
            icon="lock-closed-outline"
            label="Privacy & Security"
            onPress={() => Alert.alert('Coming soon')}
          />
        </Section>

        {/* Sign out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={sectionStyles.wrap}>
      <Text style={sectionStyles.title}>{title}</Text>
      <View style={sectionStyles.card}>{children}</View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: { marginBottom: spacing[4] },
  title: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing[2],
    paddingHorizontal: spacing[4],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    marginHorizontal: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});

function InfoRow({ icon, label, value }) {
  return (
    <View style={rowStyles.row}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value} numberOfLines={1}>{value || '—'}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  value: {
    fontSize: typography.sm,
    color: colors.text,
    fontWeight: typography.medium,
    flex: 2,
    textAlign: 'right',
  },
});

function MenuItem({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={menuStyles.row} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={20} color={colors.textSecondary} />
      <Text style={menuStyles.label}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const menuStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    flex: 1,
    fontSize: typography.base,
    color: colors.text,
  },
});

function formatDate(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerGrad: {
    paddingBottom: spacing[6],
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    marginBottom: spacing[4],
  },
  headerTitle: {
    fontSize: typography.xl,
    fontWeight: typography.extrabold,
    color: colors.text,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    gap: spacing[1],
    borderWidth: 1,
    borderColor: colors.border,
  },
  editBtnText: {
    fontSize: typography.sm,
    color: colors.text,
    fontWeight: typography.medium,
  },
  avatarSection: {
    alignItems: 'center',
    gap: spacing[2],
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: spacing[2],
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: colors.background,
  },
  displayName: {
    fontSize: typography.xl,
    fontWeight: typography.extrabold,
    color: colors.text,
  },
  email: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  bio: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing[8],
    lineHeight: 20,
    fontStyle: 'italic',
  },
  body: {
    flex: 1,
    paddingTop: spacing[4],
  },
  statusGrid: {
    gap: 1,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusOptionActive: {
    backgroundColor: colors.primaryFade,
  },
  statusDotSmall: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    flex: 1,
    fontSize: typography.base,
    color: colors.text,
  },
  statusLabelActive: {
    color: colors.primary,
    fontWeight: typography.semibold,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorFade,
    marginHorizontal: spacing[4],
    marginTop: spacing[4],
    borderRadius: radii.xl,
    padding: spacing[4],
    gap: spacing[2],
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  logoutText: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.error,
  },
});
