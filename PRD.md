# Product Requirement Document (PRD)
## Project: Antigravity-Player (Modern Web Audio Player)

---

### Document Information
- **Codename:** Antigravity-Player
- **Target OS / Environment:** Armbian Linux (Single Board Computer / STB - ARM64 / aarch64)
- **Audio Output:** USB Audio Soundcard (`plughw:1,0` / ALSA)
- **Core Engine:** `mpv` (Headless JSON IPC daemon) + `yt-dlp` (Standalone binary `yt-dlp_linux_aarch64`)
- **Primary User Interface:** Mobile-first Web UI via Web Browser (Responsive for Smartphones & Desktop)
- **Status:** Draft / Active Specification

---

## 1. Problem Statement & Executive Summary
- **Problem:** Mopidy sering mengalami *breakage* akibat perubahan berkala pada API YouTube, sementara Web UI bawaan MPV (*simple-mpv-webui*) memiliki antarmuka yang kurang intuitif, responsif, dan kaku untuk perangkat mobile.
- **Solution:** **Antigravity-Player** menghadirkan pemutar audio berbasis Web UI lokal yang modern, responsif, hemat resource, dan stabil dengan memanfaatkan keandalan JSON-IPC `mpv` dan fleksibilitas *binary extractor* `yt-dlp`.

---

## 2. Core Architecture & Tech Stack

### High-Level Architecture Diagram
```
+----------------------------------------------------------------+
|                 Mobile Browser UI (Client)                     |
|           (TailwindCSS + Modern Reactive Web UI)               |
+-------------------------------+--------------------------------+
                                |
                   WebSocket / REST API (HTTP)
                                |
+-------------------------------v--------------------------------+
|                    App Backend Server                          |
|         (Node.js Fastify/Express ATAU Python FastAPI)          |
|    - WebSocket Broadcaster & State Manager                     |
|    - IPC Client & Command Dispatcher                           |
|    - URL Parsing & Metadata Resolver (yt-dlp)                  |
+-------------------------------+--------------------------------+
                                |
                  Unix Domain Socket IPC (/tmp/mpvsocket)
                                |
+-------------------------------v--------------------------------+
|                     MPV Engine (Daemon)                        |
|  - Headless (--idle --no-video --audio-device=alsa/plughw:1,0)  |
|  - Direct Audio Decoding & Playlist Management                |
+-------------------------------+--------------------------------+
                                |
                     ALSA Audio Output Stream
                                |
+-------------------------------v--------------------------------+
|                 USB Audio Soundcard (DAC)                      |
|                      (plughw:1,0)                              |
+----------------------------------------------------------------+
```

### Component Details
| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Audio Backend** | `mpv` | Headless daemon (`--idle --no-video --audio-device=alsa/plughw:1,0 --input-ipc-server=/tmp/mpvsocket`) |
| **Media Extractor**| `yt-dlp` | Standalone binary (`yt-dlp_linux_aarch64` / latest release) |
| **Backend Service**| Node.js / Python | Fastify / Express (Node.js) atau FastAPI (Python) dengan Unix IPC client & WebSocket hub |
| **Frontend UI** | HTML5 / React / Vue | Mobile-first SPA / PWA dengan TailwindCSS (Dark Mode Spotify-like) |
| **Communication** | IPC + WebSocket | Unix Domain Socket ke MPV, Real-time WebSocket ke Client |

---

## 3. Key Functional Requirements

### Feature 1: Playback Controller
- **Transport Controls:**
  - Play, Pause, Resume, Stop.
  - Next track, Previous track.
  - Loop / Shuffle mode (opsional).
- **Volume Control:**
  - Slider volume 0% – 100% tersinkronisasi 2 arah (*two-way sync*) langsung dengan properti `volume` pada mpv.
- **Seek Bar / Timeline:**
  - Progress bar *real-time* (Current Position / `time-pos` vs Total Duration / `duration`).
  - Pembaruan status setiap 1 detik.
  - Kemampuan drag / click seek (`seek <seconds> absolute`).

### Feature 2: Queue & Media Ingestion
- **URL Ingestion:**
  - Input form untuk memasukkan link (YouTube Video, YouTube Music, Playlist, Direct Audio Stream / Radio HTTP Stream).
  - Ekstraksi metadata awal (Judul, Durasi, Thumbnail, Uploader).
- **Queue Management (Daftar Antrean):**
  - Melihat daftar antrean lagu (*Tracklist*).
  - Hapus item dari antrean (`playlist-remove <index>`).
  - Reorder / ubah urutan antrean (`playlist-move <from> <to>`).
  - Clear queue / hapus semua antrean.
- **Automatic Non-blocking Parsing:**
  - Menambahkan lagu menggunakan perintah IPC `loadfile <url> append` / `append-play` tanpa menginterupsi pemutaran yang sedang berjalan.

### Feature 3: Real-Time State Sync (WebSocket)
- Dashboard UI mencerminkan status terkini dari mpv secara *real-time* ke semua klien web yang terhubung tanpa reload:
  - Judul lagu (`media-title`)
  - Artis / Channel name
  - Thumbnail / Cover Art URL
  - Playback State (`pause`: true/false, `idle-active`, `eof-reached`)
  - Current Time & Duration
  - Volume level
  - Tracklist queue terkini

---

## 4. Non-Functional Requirements

- **Low Memory Footprint:**
  - Total konsumsi RAM untuk Backend + Frontend Server < 150 MB (mengingat keterbatasan RAM pada STB/SBC 1GB-2GB).
- **Zero Video Overhead:**
  - Flag `--no-video` wajib aktif di mpv untuk mencegah konsumsi GPU/VPU dan CPU STB.
- **Low Latency IPC:**
  - Komunikasi Unix Socket IPC < 10ms.
- **Persistence & Self-Healing:**
  - Dikelola melalui service `systemd` dengan restart otomatis (`Restart=always`, `RestartSec=3`).
- **High Compatibility:**
  - Berjalan lancar pada browser mobile (Chrome, Safari, Firefox di Android & iOS).

---

## 5. Technical Specifications & IPC Payload Reference

### 1. MPV Daemon Execution Command
```bash
mpv --idle \
    --no-video \
    --audio-device=alsa/plughw:1,0 \
    --input-ipc-server=/tmp/mpvsocket \
    --ytdl-format="bestaudio/best" \
    --ytdl-path=/usr/local/bin/yt-dlp
```

### 2. JSON-IPC Protocol Commands

| Action | JSON-IPC Payload |
| :--- | :--- |
| **Add to Queue & Play if Idle** | `{"command": ["loadfile", "<URL>", "append-play"]}` |
| **Add to Queue Only** | `{"command": ["loadfile", "<URL>", "append"]}` |
| **Toggle Play / Pause** | `{"command": ["cycle", "pause"]}` |
| **Set Play / Pause Explicit** | `{"command": ["set_property", "pause", true]}` |
| **Next Track** | `{"command": ["playlist-next", "weak"]}` |
| **Previous Track** | `{"command": ["playlist-prev", "weak"]}` |
| **Stop Playback** | `{"command": ["stop"]}` |
| **Seek Position (Absolute)** | `{"command": ["seek", 120, "absolute"]}` |
| **Set Volume (0-100)** | `{"command": ["set_property", "volume", 75]}` |
| **Get Media Title** | `{"command": ["get_property", "media-title"]}` |
| **Get Playlist / Queue** | `{"command": ["get_property", "playlist"]}` |
| **Remove from Playlist** | `{"command": ["playlist-remove", 2]}` |
| **Move Track in Playlist** | `{"command": ["playlist-move", 2, 0]}` |
| **Observe Property (Push Event)**| `{"command": ["observe_property", 1, "time-pos"]}` |

---

## 6. UI/UX Design Guidelines

### Layout & Theme
- **Theme:** Dark Mode by default (`#121212`, `#1e1e1e`, aksen hijau/biru neon khas modern audio player).
- **Inspirasi:** Spotify Mobile / Apple Music Web Remote.

### Visual Components:
1. **Top Bar / Header:**
   - App Logo & Status Indikator (🟢 Connected ke MPV IPC / 🔴 Disconnected).
2. **Hero Section (Now Playing):**
   - High-resolution Thumbnail / Cover Art (Square 1:1 rounded).
   - Judul Lagu (Marquee scrolling jika teks panjang).
   - Nama Artis / Channel YouTube.
3. **Player Control Bar:**
   - Slider Timeline (Current Time & Remaining Time).
   - Tombol Prev, Play/Pause (ukuran besar), Next.
   - Volume Bar dengan icon Mute/Speaker.
4. **Tabs / Bottom Sheets:**
   - **Tab 1 - Queue:** Menampilkan daftar lagu berikutnya dengan tombol hapus & drag handle.
   - **Tab 2 - Add Track:** Input field paste URL YouTube/Direct Link + tombol "Add to Queue" & "Play Now".

---

## 7. Roadmap & Implementation Milestones

```
Phase 1: Core IPC Bridge
└── Setup mpv socket daemon & script backend untuk membaca/mengirim JSON-IPC ke /tmp/mpvsocket.

Phase 2: Basic Control Web UI
└── Implementasi REST/WebSocket endpoint dasar untuk Play/Pause, Volume, dan URL Input.

Phase 3: Real-time State & Queue Management
└── Sinkronisasi 2-arah (WebSocket) untuk metadata, durasi real-time, thumbnail, dan playlist management.

Phase 4: UI Polishing & Systemd Deployment
└── Mobile-first TailwindCSS styling, optimasi memori (<150MB), dan pembuatan systemd service auto-start.
```

---

## 8. Systemd Service Deployment Template

### Service 1: `mpv-daemon.service`
`/etc/systemd/system/mpv-daemon.service`
```ini
[Unit]
Description=MPV Headless Audio Daemon
After=sound.target network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/mpv --idle --no-video --audio-device=alsa/plughw:1,0 --input-ipc-server=/tmp/mpvsocket --ytdl-format=bestaudio/best
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### Service 2: `antigravity-player.service`
`/etc/systemd/system/antigravity-player.service`
```ini
[Unit]
Description=Antigravity Player Web Backend
After=mpv-daemon.service network.target
Requires=mpv-daemon.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/antigravity-player
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production PORT=3000 MPV_SOCKET=/tmp/mpvsocket

[Install]
WantedBy=multi-user.target
```
