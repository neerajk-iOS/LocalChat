import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme';

// Screens
import ServerSetupScreen   from '../screens/ServerSetupScreen';
import LoginScreen         from '../screens/LoginScreen';
import RegisterScreen      from '../screens/RegisterScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import ChatScreen          from '../screens/ChatScreen';
import ProfileScreen       from '../screens/ProfileScreen';
import EditProfileScreen   from '../screens/EditProfileScreen';
import SettingsScreen      from '../screens/SettingsScreen';
import CreateGroupScreen   from '../screens/CreateGroupScreen';
import GroupInfoScreen     from '../screens/GroupInfoScreen';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background:   colors.background,
    card:         colors.surface,
    text:         colors.text,
    border:       colors.border,
    notification: colors.primary,
  },
};

const screenOptions = {
  headerShown:  false,
  animation:    'slide_from_right',
  contentStyle: { backgroundColor: colors.background },
  gestureEnabled: true,
};

export default function Navigation() {
  const user      = useAuthStore(s => s.user);
  const serverUrl = useAuthStore(s => s.serverUrl);

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={screenOptions}>

        {/* ── No server configured ───────────────────── */}
        {!serverUrl ? (
          <Stack.Screen
            name="ServerSetup"
            component={ServerSetupScreen}
            options={{ animation: 'fade' }}
          />

        /* ── Not logged in ─────────────────────────── */
        ) : !user ? (
          <>
            <Stack.Screen name="Login"    component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>

        /* ── Logged in ─────────────────────────────── */
        ) : (
          <>
            <Stack.Screen name="Main" component={ConversationsScreen} />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="EditProfile"
              component={EditProfileScreen}
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="CreateGroup"
              component={CreateGroupScreen}
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="GroupInfo"
              component={GroupInfoScreen}
              options={{ animation: 'slide_from_right' }}
            />
          </>
        )}

      </Stack.Navigator>
    </NavigationContainer>
  );
}
