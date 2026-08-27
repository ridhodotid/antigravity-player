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
  --input-terminal=no \
  --input-default-bindings=no \
  --audio-device="${AUDIO_DEV}" \
  --input-ipc-server="${SOCKET_PATH}" \
  --ytdl-format="bestaudio[ext=webm][abr<=128]/bestaudio[ext=m4a][abr<=128]/bestaudio/best" \
  --ytdl-raw-options="no-playlist=,extractor-retries=1,socket-timeout=8" \
  --cache=yes \
  --demuxer-max-bytes=5MiB \
  --demuxer-readahead-secs=3 \
  --stream-buffer-size=256KiB \
  --msg-level=all=warn
