# 🎵 Antigravity-Player

> **Modern, Ultra-Lightweight Web Audio Player for Armbian STB / Single Board Computers (SBC)**  
> Powered by **MPV JSON-IPC Engine**, **yt-dlp**, **Node.js (Express + WebSocket)**, and a **Mobile-First Dark Mode Web UI**.

---

## ⚡ Key Highlights
- **Low Memory Footprint**: Hanya menggunakan **~35-45 MB RAM** (jauh di bawah batas 150 MB).
- **Zero Video Overhead**: MPV dijalankan dengan mode headless `--no-video` (CPU/GPU STB tetap dingin).
- **Real-Time 2-Way State Sync**: Sinkronisasi instan volume, timeline seek, judul lagu, status play/pause, dan antrean playlist via WebSocket.
- **YouTube & Direct Stream Ingestion**: Paste link YouTube, YouTube Music, Playlist, ataupun Radio Web Stream secara *seamless* tanpa memutus playback yang aktif.
- **Dedicated USB DAC Routing**: Output audio ALSA langsung diarahkan ke USB Soundcard (`plughw:1,0`).
- **Self-Healing**: Dikelola dengan `systemd` auto-restart.

---

## 🏗️ Architecture

```
[ Mobile Browser UI ] <--- WebSocket / REST API ---> [ Node.js Backend ] <--- Unix Domain Socket ---> [ MPV Engine ] ---> [ USB Soundcard ]
```

---

## 🚀 Quick Start on Armbian Linux (STB / SBC)

### 1. Prasyarat Sistem
Pastikan `mpv`, `yt-dlp`, dan `nodejs` sudah terpasang:
```bash
sudo apt update
sudo apt install -y mpv nodejs npm

# Install standalone yt-dlp binary (ARM64)
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64 -O /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### 2. Clone & Install Dependencies
```bash
git clone <repo-url> /opt/antigravity-player
cd /opt/antigravity-player
npm install --omit=dev
```

### 3. Menjalankan Manual (Testing)

**Terminal 1 (Jalankan MPV Daemon):**
```bash
chmod +x scripts/start-mpv-daemon.sh
./scripts/start-mpv-daemon.sh
```

**Terminal 2 (Jalankan Web Server):**
```bash
npm start
```
Buka browser di HP/laptop pada alamat: `http://<IP-STB-ANDA>:3000`

---

## ⚙️ Production Deployment (Systemd Auto-Start)

Pasang kedua service agar aplikasi otomatis berjalan saat STB menyala:

```bash
# 1. Pasang MPV Daemon Service
sudo cp scripts/mpv-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mpv-daemon.service

# 2. Pasang Antigravity Player Web Service
sudo cp scripts/antigravity-player.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now antigravity-player.service

# 3. Cek Status Service
sudo systemctl status mpv-daemon.service
sudo systemctl status antigravity-player.service
```

---

## 🔧 Environment Variables / Konfigurasi (`config.js`)

| Variable | Default | Deskripsi |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port server Web UI & WebSocket |
| `MPV_SOCKET` | `/tmp/mpvsocket` | Path Unix Domain Socket untuk MPV IPC |
| `AUDIO_DEVICE` | `alsa/plughw:1,0` | Target perangkat output suara ALSA USB DAC |
| `YTDL_PATH` | `/usr/local/bin/yt-dlp` | Path biner executable yt-dlp |
| `POLL_INTERVAL` | `1000` | Interval sinkronisasi timeline (ms) |

---

## 📡 REST API & WebSocket Protocol Reference

### REST Endpoints
- `GET /api/state` - Mengambil state lengkap player.
- `POST /api/control` - Mengirim kontrol transport: `{"action": "play"|"pause"|"toggle"|"stop"|"next"|"prev"|"seek", "value": 120}`
- `POST /api/volume` - Mengatur volume: `{"volume": 75}`
- `POST /api/queue/add` - Menambah URL media: `{"url": "https://...", "playNow": false}`
- `POST /api/queue/remove` - Menghapus track: `{"index": 2}`
- `POST /api/queue/clear` - Mengosongkan seluruh antrean playlist.

### WebSocket Commands (`/ws`)
Kirimkan JSON message berikut melalui WebSocket:
```json
{ "action": "toggle" }
{ "action": "set_volume", "value": 80 }
{ "action": "seek", "value": 45 }
{ "action": "add_url", "url": "https://youtu.be/...", "playNow": true }
{ "action": "clear_queue" }
```

---

## 📜 Lisensi
MIT License.
