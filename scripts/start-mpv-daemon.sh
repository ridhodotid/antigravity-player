#!/usr/bin/env bash
#
# Antigravity-Player: MPV Headless Daemon Launcher
# Target: Armbian Linux (Single Board Computer / STB)
#

SOCKET_PATH="/tmp/mpvsocket"
AUDIO_DEV="alsa/plughw:1,0"

echo "========================================================"
echo " 🎧 Starting MPV Headless Audio Daemon"
echo " 🔌 IPC Socket: ${SOCKET_PATH}"
echo " 🔊 Audio Device: ${AUDIO_DEV}"
echo "========================================================"

# Remove stale socket if exists
if [ -S "$SOCKET_PATH" ]; then
  rm -f "$SOCKET_PATH"
fi

exec mpv \
  --idle \
  --no-video \
  --audio-device="${AUDIO_DEV}" \
  --input-ipc-server="${SOCKET_PATH}" \
  --ytdl-format="bestaudio/best" \
  --msg-level=all=warn
