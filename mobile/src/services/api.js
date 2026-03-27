import { storage } from './storage';

let _serverUrl = '';
let _onTokenRefreshFailed = null;

export function setServerUrl(url) {
  _serverUrl = url.replace(/\/$/, '');
}

export function getServerUrl() {
  return _serverUrl;
}

export function onTokenRefreshFailed(cb) {
  _onTokenRefreshFailed = cb;
}

async function refreshAccessToken() {
  const refreshToken = await storage.getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');

  const res = await fetch(`${_serverUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) throw new Error('Refresh failed');
  const data = await res.json();
  await storage.setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

async function request(path, options = {}, retry = true) {
  const token = await storage.getAccessToken();

  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Don't set Content-Type for FormData (let the browser set it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const res = await fetch(`${_serverUrl}${path}`, { ...options, headers });

  // Auto-refresh on 401 TOKEN_EXPIRED
  if (res.status === 401 && retry) {
    let body;
    try { body = await res.clone().json(); } catch { body = {}; }

    if (body?.code === 'TOKEN_EXPIRED') {
      try {
        await refreshAccessToken();
        return request(path, options, false);
      } catch {
        _onTokenRefreshFailed?.();
        throw new Error('Session expired. Please log in again.');
      }
    }
  }

  if (!res.ok) {
    let errBody;
    try { errBody = await res.json(); } catch { errBody = {}; }
    throw new Error(errBody?.error || `Request failed (${res.status})`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
}

export const api = {
  // Auth
  async register(formData) {
    return request('/api/auth/register', { method: 'POST', body: formData });
  },
  async login(email, password) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  async logout(refreshToken) {
    return request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },
  async me() {
    return request('/api/auth/me');
  },

  // Users
  async getUsers() {
    return request('/api/users');
  },
  async getUser(id) {
    return request(`/api/users/${id}`);
  },
  async updateUser(id, formData) {
    return request(`/api/users/${id}`, { method: 'PUT', body: formData });
  },
  async updateStatus(id, status) {
    return request(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },

  // Groups
  async getMyGroups(userId) {
    return request(`/api/groups?userId=${userId}`);
  },
  async getGroup(id) {
    return request(`/api/groups/${id}`);
  },
  async createGroup(formData) {
    return request('/api/groups', { method: 'POST', body: formData });
  },
  async updateGroup(id, formData) {
    return request(`/api/groups/${id}`, { method: 'PUT', body: formData });
  },
  async addGroupMember(groupId, userId, requesterId) {
    return request(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, requesterId }),
    });
  },
  async removeGroupMember(groupId, userId, requesterId) {
    return request(`/api/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
      body: JSON.stringify({ requesterId }),
    });
  },

  // Messages
  async getMessages(roomId, before = null, limit = 40) {
    const params = new URLSearchParams({ limit });
    if (before) params.set('before', before);
    return request(`/api/messages/${encodeURIComponent(roomId)}?${params}`);
  },

  // Files
  async uploadFile(formData) {
    return request('/api/files/upload', { method: 'POST', body: formData });
  },
  async uploadAvatar(formData) {
    return request('/api/files/avatar', { method: 'POST', body: formData });
  },

  // Links
  async previewLink(url) {
    return request(`/api/links/preview?url=${encodeURIComponent(url)}`);
  },
};
