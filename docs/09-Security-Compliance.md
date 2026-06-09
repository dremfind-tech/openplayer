# Security & Permissions Specs
**Filename:** `09-Security-Compliance.md`
**Product:** BeatDrop — Offline Music Player & Downloader

---

## 1. Shell Command Sanitization (yt-dlp Execution)

Because Tauri runs native commands using Rust's `std::process::Command`, executing sidecars with arbitrary user input can lead to **Remote Code Execution (RCE)** or shell injection.

- **Direct Argument Injection Prevention:**
  We must configure the yt-dlp sidecar arguments strictly in Rust. Do **NOT** pass URLs containing whitespace or special shell characters without validation.
- **URL Validation Pattern (Rust):**
  Validate the Youtube URL format using a strict regular expression before passing it as a command argument:
  ```rust
  use regex::Regex;

  pub fn validate_youtube_url(url: &str) -> bool {
      let re = Regex::new(r"^(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[a-zA-Z0-9_-]{11}(&.*)?$").unwrap();
      re.is_match(url)
  }
  ```

---

## 2. Tauri Filesystem (fs) & Network Scope

To follow Tauri's security model, restrict access scopes in `tauri.conf.json`:

```json
{
  "permissions": [
    "fs:allow-read",
    "fs:allow-write",
    "path:default-ports",
    {
      "identifier": "fs:allow-music-folder-scope",
      "allow": [
        { "path": "$MUSIC" },
        { "path": "$APP_DATA_DIR" }
      ]
    }
  ]
}
```

* **Custom Protocol:** Register a custom asset protocol (e.g., `beatdrop-asset://`) in Tauri to load local audio/thumbnail files in React without using insecure `file://` tags.

---

## 3. Mobile Device Permissions (Flutter)

### Android Permissions (`AndroidManifest.xml`)
* `android.permission.INTERNET`: Required to download metadata/sync.
* `android.permission.FOREGROUND_SERVICE`: Essential for keeping background audio playback active when the screen locks.
* `android.permission.READ_EXTERNAL_STORAGE`: Access to local offline music files on older Android APIs.

### iOS Permissions (`Info.plist`)
* `NSLocalNetworkUsageDescription`: Required for P2P Wi-Fi Sync discoverability.
* `UIBackgroundModes`: `audio` capability key configured so playback does not pause when minimized.
