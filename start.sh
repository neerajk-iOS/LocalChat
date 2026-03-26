#!/usr/bin/env bash
# LocalChat — native startup for Linux / macOS
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Check Node.js ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌  Node.js not found. Install Node.js 20+ from https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌  Node.js $NODE_MAJOR detected. LocalChat requires Node.js 18 or newer."
  exit 1
fi

# ── Install / update dependencies ─────────────────────────────────────────────
echo "📦  Installing server dependencies…"
cd server && npm install --omit=dev --silent && cd ..

# ── Build the React client if dist is missing or outdated ─────────────────────
if [ ! -d "client/dist" ] || [ "client/src" -nt "client/dist" ]; then
  echo "🔨  Building React client…"
  cd client && npm install --silent && npm run build && cd ..
else
  echo "✅  Client build is up to date"
fi

# ── Launch ────────────────────────────────────────────────────────────────────
echo ""
echo "🚀  Starting LocalChat…"
echo ""
exec node server/index.js
