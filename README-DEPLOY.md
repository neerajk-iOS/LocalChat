# LocalChat — Deployment Guide

LocalChat is a self-hosted chat app with voice/video calls, featuring a React Native mobile app for Android & iOS.

---

## Architecture Overview

```
mobile/         React Native (Expo) — Android & iOS app
server/         Node.js + Express + Socket.IO backend
client/         React SPA (optional web client)
```

---

## 🔑 Security (Required before public deployment)

### Environment Variables

Create a `.env` file in `server/` (or set in your deploy environment):

```env
# REQUIRED — Use a long random string (openssl rand -base64 48)
JWT_SECRET=your-very-long-random-secret-min-32-characters

# Optional — Comma-separated allowed origins for CORS
# Leave unset to allow all origins (dev mode)
ALLOWED_ORIGINS=https://chat.example.com

# Optional — Custom TLS certs (recommended for production)
TLS_CERT=/path/to/fullchain.pem
TLS_KEY=/path/to/privkey.pem

# Ports (defaults shown)
PORT=3700
HTTPS_PORT=3743
```

### Production Security Checklist

- [ ] Set a strong `JWT_SECRET` (never commit it)
- [ ] Use a real SSL cert (Let's Encrypt via Caddy or Certbot)
- [ ] Set `ALLOWED_ORIGINS` to your domain
- [ ] Put server behind Nginx/Caddy reverse proxy for HTTPS
- [ ] Set firewall rules to block direct port access

### Caddy reverse proxy (recommended)

```caddyfile
chat.example.com {
    reverse_proxy localhost:3700
}
```

---

## Server Deployment

### Option 1 — Docker (recommended)

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

Set environment variables in `docker-compose.yml`:

```yaml
environment:
  - JWT_SECRET=your-long-random-secret
  - ALLOWED_ORIGINS=https://chat.example.com
```

### Option 2 — Native (Linux / macOS)

```bash
./start.sh
```

### Option 3 — PM2 (process manager)

```bash
cd server && npm install
JWT_SECRET=your-secret pm2 start index.js --name localchat
pm2 save && pm2 startup
```

---

## Server API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Login, get tokens |
| POST | `/api/auth/refresh` | No | Refresh access token |
| POST | `/api/auth/logout` | No | Invalidate refresh token |
| GET  | `/api/auth/me` | JWT | Get current user |
| GET  | `/api/users` | JWT | List all users |
| PUT  | `/api/users/:id` | JWT | Update profile |
| GET  | `/api/groups` | JWT | List groups |
| POST | `/api/groups` | JWT | Create group |
| GET  | `/api/messages` | JWT | Get messages |

---

## 📱 Mobile App Setup

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- For iOS: Xcode (macOS only)
- For Android: Android Studio

### Install & Run

```bash
cd mobile
npm install --legacy-peer-deps

# Start Expo dev server
npm start

# Android
npm run android

# iOS
npm run ios
```

### Build for Production

Install EAS CLI:
```bash
npm install -g eas-cli
eas login
```

Configure your `app.json` (set your `bundleIdentifier` / `package`).

```bash
# Android APK/AAB
eas build --platform android

# iOS IPA
eas build --platform ios
```

### First Launch

1. Open the app on your device
2. Enter your server URL (e.g. `https://chat.example.com`)
3. Create an account or sign in
4. Start chatting!

---

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 3700 | HTTP     | Main app, API, WebSocket |
| 3743 | HTTPS    | WebRTC voice/video calls |

For production, expose only 443 (HTTPS) via reverse proxy.

---

## Data Backup (Docker)

```bash
# Backup
docker run --rm -v localchat-db:/data -v $(pwd):/backup alpine \
  tar czf /backup/localchat-db.tar.gz -C /data .

docker run --rm -v localchat-uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/localchat-uploads.tar.gz -C /data .

# Restore
docker run --rm -v localchat-db:/data -v $(pwd):/backup alpine \
  tar xzf /backup/localchat-db.tar.gz -C /data

docker run --rm -v localchat-uploads:/data -v $(pwd):/backup alpine \
  tar xzf /backup/localchat-uploads.tar.gz -C /data
```

---

## Run as Systemd Service (Linux)

```bash
sudo tee /etc/systemd/system/localchat.service > /dev/null <<EOF
[Unit]
Description=LocalChat Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)/server
Environment="JWT_SECRET=your-secret"
Environment="ALLOWED_ORIGINS=https://chat.example.com"
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now localchat
sudo systemctl status localchat
```
