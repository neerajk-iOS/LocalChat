import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { colors, radii } from '../theme';
import { getServerUrl } from '../services/api';

const PALETTE = ['#6366F1','#8B5CF6','#EC4899','#F59E0B','#10B981','#06B6D4','#EF4444','#F97316'];

function stringToColor(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ uri, name = '', size = 44, style, online }) {
  const baseColor = stringToColor(name);
  const initials  = getInitials(name);

  const resolvedUri = uri
    ? uri.startsWith('http') ? uri : `${getServerUrl()}${uri}`
    : null;

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }, style]}>
      {resolvedUri ? (
        <Image
          source={{ uri: resolvedUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: baseColor }]}>
          <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials}</Text>
        </View>
      )}
      {online !== undefined && (
        <View style={[
          styles.badge,
          {
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size * 0.14,
            backgroundColor: online ? colors.online : colors.offline,
          },
        ]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    borderWidth: 2,
    borderColor: colors.background,
  },
});
