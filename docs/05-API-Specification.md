# API & Tauri Command Specification
**Filename:** `05-API-Specification.md`
**Product:** BeatDrop — Offline Music Player & Downloader

---

## 1. Tauri Backend IPC Commands (Rust -> Frontend)

Tauri functions are declared in Rust and invoked via the `@tauri-apps/api/core` JS module.

### 1.1 `download_track`
* **Method:** Rust Async Command
* **Signature:** `pub async fn download_track(url: String) -> Result<Track, String>`
* **Description:** Initiates yt-dlp sidecar download. Saves thumbnail to `covers/` and audio to `tracks/`. Inserts record into SQLite. Returns final `Track` item metadata.
* **Progress Stream (Tauri Webview Event):**
  * Event Name: `download-status`
  * Payload structure:
    ```typescript
    interface DownloadStatus {
      url: string;
      progress: number; // Percentage float 0-100
      speed: string;    // e.g. "4.2MiB/s"
      status: "fetching" | "downloading" | "converting" | "finished" | "failed";
      error?: string;
    }
    ```

### 1.2 `get_all_tracks`
* **Method:** Rust Command
* **Signature:** `pub fn get_all_tracks() -> Result<Vec<Track>, String>`
* **Returns:** List of all tracks ordered by `date_added DESC`.

### 1.3 `scan_local_directory`
* **Method:** Rust Command
* **Signature:** `pub fn scan_local_directory() -> Result<Vec<Track>, String>`
* **Description:** Re-scans the user directory for manual audio files added, extracts their metadata, and updates SQLite.

---

## 2. Local P2P Sync Server API (Phase 2)

When "Sync Server" is turned on in the Windows App, the Tauri backend runs an ephemeral Axum or actix-web HTTP service.

### 2.1 Get Library Sync Manifest
* **Route:** `GET /sync/manifest`
* **Headers:** `Content-Type: application/json`
* **Response (200 OK):**
  ```json
  {
    "tracks": [
      { "id": "dQw4w9WgXcQ", "hash": "sha256-hash-value" },
      { "id": "YQHsXMglC9I", "hash": "sha256-hash-value" }
    ],
    "playlists": [
      { "id": "playlist-1", "name": "Synthwave Sessions" }
    ],
    "playlist_tracks": [
      { "playlist_id": "playlist-1", "track_id": "dQw4w9WgXcQ", "position": 0 }
    ]
  }
  ```

### 2.2 Stream Track Audio File
* **Route:** `GET /sync/track/:id`
* **Parameters:** `id` -> Youtube video ID/Track ID.
* **Response:** `audio/mpeg` or `audio/mp4` binary stream.
* **Error:** `404 Not Found` if track ID doesn't exist on host.

### 2.3 Stream Track Cover Image
* **Route:** `GET /sync/cover/:id`
* **Response:** `image/jpeg` binary.
