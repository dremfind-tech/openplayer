# Project Plan & Build Order
**Filename:** `06-Project-Plan.md`
**Product:** BeatDrop — Offline Music Player & Downloader

---

## 1. Build Philosophy
Build using a **Vertical Slices** approach. Get download functionality working to disk first, then create the UI layer to play it, and finally wire up the playlists and mobile extensions.

---

## 2. Phase 1: Windows Desktop MVP (Tauri + React + Tailwind)

### Step 1: Project Scaffolding
* **Action:** Initialize Tauri v2 app with Vite, React, and TypeScript. Add Tailwind CSS and Lucide React.
* **Verification:** Run `npm run tauri dev` or `cargo tauri dev`. Confirm blank window with custom title bar opens.

### Step 2: Rust Downloader Core
* **Action:** Configure Tauri command execution hooks. Download and package `yt-dlp` executable sidecar for Windows. Create `download_track` command in Rust that spawns the sidecar, extracts audio streams, and saves them to the application data directory.
* **Verification:** Trigger download command from terminal or simple button. Check if MP3/M4A file exists in `AppData/Roaming/BeatDrop/tracks/`.

### Step 3: SQLite Database Integration
* **Action:** Integrate SQLite in the Tauri Rust backend (using `tauri-plugin-sql` or custom `rusqlite` commands). Write migrations creating `tracks`, `playlists`, and `playlist_tracks` tables.
* **Verification:** Verify that database tables are successfully created on startup and metadata is written after a successful download.

### Step 4: Library UI & Browser Player Integration
* **Action:** Create UI with Tailwind CSS. Implement index search bar, grid list of tracks, and custom bottom player bar. Bind player controls to a browser `<audio>` element reading tracks using Tauri custom protocols.
* **Verification:** Tapping a track card initiates playback. Seek slider moves dynamically, volume controller works.

---

## 3. Phase 2: Mobile Port & Network Sync (Flutter)

### Step 1: Flutter App Setup & Native Player
* **Action:** Create Flutter project. Set up SQLite/Drift database. Implement local player view using `just_audio` and `audio_service` to hook into mobile lockscreen controls.
* **Verification:** App compiles on iOS/Android emulator and plays local audio files.

### Step 2: Ephemeral Sync Server (Rust)
* **Action:** In Tauri app, launch HTTP listener using `axum` or `actix-web` when sync mode is turned on. Render QR code containing the server address.
* **Verification:** Scan code or fetch `http://<local-ip>:<port>/sync/manifest` from mobile web browser.

### Step 3: Sync Handler (Flutter)
* **Action:** Implement synchronization client in Flutter using Dart's HTTP client. Read sync manifest from desktop server, download missing files, insert entries to mobile DB.
* **Verification:** Launch sync from Flutter; confirm tracks transferred and added to mobile Library screen.
