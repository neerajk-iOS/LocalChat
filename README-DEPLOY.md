# LocalChat — Deployment Guide

LocalChat is a self-hosted LAN chat app with voice/video calls. It runs entirely on your local network — no internet required after setup.

---

## Option 1 — Docker (recommended, any OS)

> Requires: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) or Docker Engine (Linux)

```bash
# Build image and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

That's it. The app is at **http://\<your-LAN-IP\>:3000**

- All data (database, uploads, TLS certs) is stored in named Docker volumes — it persists across restarts and image rebuilds.
- To rebuild after a code change: `docker compose down && docker compose up -d --build`

### Windows Docker note
`network_mode: host` is not supported on Windows Docker Desktop (it's Linux-only). For Windows, replace it in `docker-compose.yml`:
```yaml
# Remove: network_mode: host
# Add under localchat service:
networks:
  - default
```
mDNS auto-discovery won't work but the app is fully functional via IP.

---

## Option 2 — Native (Linux / macOS)

> Requires: Node.js 18+ — [nodejs.org](https://nodejs.org)

```bash
./start.sh
```

First run installs dependencies and builds the React client automatically. Subsequent runs are instant.

---

## Option 3 — Native (Windows)

> Requires: Node.js 18+ — [nodejs.org](https://nodejs.org)

Double-click **`start.bat`** or run from Command Prompt:
```bat
start.bat
```

---

## Accessing the app

| URL | What |
|-----|------|
| `http://<LAN-IP>:3700` | Main app (any device on the network) |
| `https://<LAN-IP>:3743` | HTTPS version (required for voice/video calls) |
| `http://<LAN-IP>:3700/admin` | Admin dashboard |
| `http://<LAN-IP>:3700/trust` | Certificate install guide (for HTTPS on mobile) |

---

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 3700 | HTTP | Main app, API, WebSocket |
| 3743 | HTTPS | WebRTC voice/video calls |

Make sure both ports are open in your firewall (`sudo ufw allow 3700,3743/tcp` on Ubuntu).

---

## Keeping data when moving servers

```bash
# Export Docker volumes
docker run --rm -v localchat-db:/data -v $(pwd):/backup alpine \
  tar czf /backup/localchat-db.tar.gz -C /data .

docker run --rm -v localchat-uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/localchat-uploads.tar.gz -C /data .

# Import on the new server
docker run --rm -v localchat-db:/data -v $(pwd):/backup alpine \
  tar xzf /backup/localchat-db.tar.gz -C /data

docker run --rm -v localchat-uploads:/data -v $(pwd):/backup alpine \
  tar xzf /backup/localchat-uploads.tar.gz -C /data
```

---

## Run as a system service (Linux, non-Docker)

```bash
# Create a systemd service
sudo tee /etc/systemd/system/localchat.service > /dev/null <<EOF
[Unit]
Description=LocalChat LAN Chat Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(pwd)/start.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now localchat
sudo systemctl status localchat
```
