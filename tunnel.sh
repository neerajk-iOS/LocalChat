#!/bin/bash
# LocalChat — public tunnel launcher
# Starts the server and exposes it via a clean Cloudflare HTTPS URL
# Usage: ./tunnel.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"
PORT=3700

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │   LocalChat — Public Tunnel Launcher    │"
echo "  └─────────────────────────────────────────┘"
echo ""

# --- Check dependencies ---
if ! command -v cloudflared &>/dev/null; then
  echo "  ✗ cloudflared not found. Install with:"
  echo "    brew install cloudflare/cloudflare/cloudflared"
  exit 1
fi
if ! command -v node &>/dev/null; then
  echo "  ✗ node not found."
  exit 1
fi

# --- Check server deps installed ---
if [ ! -d "$SERVER_DIR/node_modules" ]; then
  echo "  → Installing server dependencies..."
  (cd "$SERVER_DIR" && npm install)
fi

# --- Start server in background ---
echo "  → Starting LocalChat server on port $PORT..."
(cd "$SERVER_DIR" && node index.js &)
SERVER_PID=$!

# Give server time to bind the port
sleep 2

# Verify server started
if ! lsof -i :$PORT -sTCP:LISTEN &>/dev/null 2>&1; then
  # Try alternate check
  if ! nc -z localhost $PORT 2>/dev/null; then
    echo "  ✗ Server failed to start on port $PORT"
    kill $SERVER_PID 2>/dev/null
    exit 1
  fi
fi

echo "  ✓ Server running on port $PORT"
echo ""
echo "  → Starting Cloudflare tunnel..."
echo "  (Your public URL will appear below in a moment)"
echo ""
echo "  ─────────────────────────────────────────────"

# Start tunnel — output goes straight to terminal so user sees the URL
# The URL looks like: https://randomly-named.trycloudflare.com
cloudflared tunnel --url http://localhost:$PORT --no-autoupdate 2>&1 &
TUNNEL_PID=$!

# Print instructions once tunnel is likely up
sleep 4
echo ""
echo "  ─────────────────────────────────────────────"
echo "  📱 Copy the https://... URL above into LocalChat"
echo "     Server Setup screen on your phone."
echo ""
echo "  Press Ctrl+C to stop everything."
echo "  ─────────────────────────────────────────────"
echo ""

# Wait for Ctrl+C and clean up both processes
trap "echo ''; echo '  Shutting down...'; kill $TUNNEL_PID $SERVER_PID 2>/dev/null; exit 0" INT TERM
wait $TUNNEL_PID
