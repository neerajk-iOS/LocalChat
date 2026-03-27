import * as SecureStore from 'expo-secure-store';

const KEYS = {
  ACCESS_TOKEN:  'lc_access_token',
  REFRESH_TOKEN: 'lc_refresh_token',
  SERVER_URL:    'lc_server_url',
  USER:          'lc_user',
};

export const storage = {
  async setTokens(accessToken, refreshToken) {
    await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN,  accessToken);
    await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refreshToken);
  },

  async getAccessToken() {
    return SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
  },

  async getRefreshToken() {
    return SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
  },

  async clearTokens() {
    await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
  },

  async setServerUrl(url) {
    await SecureStore.setItemAsync(KEYS.SERVER_URL, url);
  },

  async getServerUrl() {
    return SecureStore.getItemAsync(KEYS.SERVER_URL);
  },

  async setUser(user) {
    await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(user));
  },

  async getUser() {
    const raw = await SecureStore.getItemAsync(KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  },

  async clearUser() {
    await SecureStore.deleteItemAsync(KEYS.USER);
  },

  async clearAll() {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
      SecureStore.deleteItemAsync(KEYS.USER),
    ]);
  },
};
