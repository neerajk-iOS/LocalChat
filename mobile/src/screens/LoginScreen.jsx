import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { colors, typography, spacing, radii } from '../theme';

export default function LoginScreen({ navigation }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const login = useAuthStore(s => s.login);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      Alert.alert('Login failed', e.message);
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
          {/* Header */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.navigate('ServerSetup')}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.logo}>
            <View style={styles.logoIcon}>
              <Ionicons name="chatbubbles" size={36} color="#fff" />
            </View>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>
          </View>

          <View style={styles.card}>
            <Field
              label="Email"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
            />
            <Field
              label="Password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry={!showPw}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
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

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Sign In</Text>
              }
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.line} />
            </View>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={styles.secondaryText}>Create new account</Text>
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
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[8],
    gap: spacing[6],
  },
  backBtn: {
    position: 'absolute',
    top: spacing[6],
    left: spacing[2],
    padding: spacing[2],
  },
  logo: {
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[10],
  },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  title: {
    fontSize: typography['2xl'],
    fontWeight: typography.extrabold,
    color: colors.text,
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: typography.sm, color: colors.textMuted },
  secondaryBtn: {
    borderRadius: radii.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    color: colors.primary,
    fontSize: typography.base,
    fontWeight: typography.semibold,
  },
});
