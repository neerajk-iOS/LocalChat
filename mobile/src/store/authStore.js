import { create } from 'zustand';
import { storage } from '../services/storage';
import { api, setServerUrl, onTokenRefreshFailed } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user:      null,
  serverUrl: '',
  isLoaded:  false,

  setServerUrl: async (url) => {
    setServerUrl(url);
    await storage.setServerUrl(url);
    set({ serverUrl: url });
  },

  initialize: async () => {
    try {
      const [savedUrl, savedUser, accessToken] = await Promise.all([
        storage.getServerUrl(),
        storage.getUser(),
        storage.getAccessToken(),
      ]);

      const url = savedUrl || '';
      if (url) setServerUrl(url);

      // Register refresh failure handler
      onTokenRefreshFailed(() => get().logout());

      if (url && accessToken && savedUser) {
        // Verify token is still valid
        try {
          const freshUser = await api.me();
          await storage.setUser(freshUser);
          set({ user: freshUser, serverUrl: url, isLoaded: true });
        } catch {
          await storage.clearAll();
          set({ user: null, serverUrl: url, isLoaded: true });
        }
      } else {
        set({ user: savedUser || null, serverUrl: url, isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  login: async (email, password) => {
    const data = await api.login(email, password);
    await storage.setTokens(data.accessToken, data.refreshToken);
    await storage.setUser(data.user);
    set({ user: data.user });
    return data.user;
  },

  register: async (formData) => {
    const data = await api.register(formData);
    await storage.setTokens(data.accessToken, data.refreshToken);
    await storage.setUser(data.user);
    set({ user: data.user });
    return data.user;
  },

  updateUser: async (updatedUser) => {
    await storage.setUser(updatedUser);
    set({ user: updatedUser });
  },

  logout: async () => {
    try {
      const refreshToken = await storage.getRefreshToken();
      await api.logout(refreshToken);
    } catch { /* ignore */ }
    await storage.clearAll();
    set({ user: null });
  },
}));
