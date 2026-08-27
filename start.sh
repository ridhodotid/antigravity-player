#!/usr/bin/env bash
#
# Antigravity-Player Single-Command Launcher
# Runs both MPV Headless Daemon and Node.js Web Server in one go
#

SOCKET_PATH="${MPV_SOCKET:-/tmp/mpvsocket}"
AUDIO_DEV="${AUDIO_DEVICE:-alsa/plughw:1,0}"

echo "=========================================================="
echo " 🚀 Launching Antigravity-Player All-In-One"
echo " 🔌 MPV Socket: ${SOCKET_PATH}"
echo " 🔊 Audio Device: ${AUDIO_DEV}"
echo "=========================================================="

# Remove old socket
rm -f "$SOCKET_PATH"

# 1. Start MPV daemon in background
mpv \
  --idle \
  --no-video \
  --audio-device="${AUDIO_DEV}" \
  --input-ipc-server="${SOCKET_PATH}" \
  --ytdl-format="bestaudio/best" \
  --msg-level=all=warn &
MPV_PID=$!

# Trap Ctrl+C (SIGINT) and SIGTERM to kill both processes cleanly
cleanup() {
  echo ""
  echo "[Antigravity] Stopping services..."
  kill $MPV_PID 2>/dev/null
  rm -f "$SOCKET_PATH"
  echo "[Antigravity] Stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 2. Wait up to 3 seconds for MPV socket to be ready
COUNTER=0
while [ ! -S "$SOCKET_PATH" ] && [ $COUNTER -lt 30 ]; do
  sleep 0.1
  COUNTER=$((COUNTER+1))
done

# 3. Start Node.js Web Server in foreground
node src/index.js
