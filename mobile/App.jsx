import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import Navigation from './src/navigation';
import { SocketProvider } from './src/contexts/SocketContext';
import { useAuthStore } from './src/store/authStore';
import { colors } from './src/theme';

SplashScreen.preventAutoHideAsync();

function AppContent() {
  const isLoaded   = useAuthStore(s => s.isLoaded);
  const initialize = useAuthStore(s => s.initialize);

  useEffect(() => {
    initialize().then(() => {
      SplashScreen.hideAsync();
    });
  }, []);

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SocketProvider>
      <Navigation />
    </SocketProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={colors.background} />
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
