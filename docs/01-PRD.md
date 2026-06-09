# Product Requirements Document (PRD) — Offline Music Player & Downloader
**Filename:** `01-PRD.md`
**Product:** BeatDrop — Offline Music Player & Downloader
**Target Stack:** Windows App (Tauri + Tailwind CSS + Rust), Mobile App (Flutter)

---

## 1. Executive Summary
* **Product Vision:** BeatDrop is a premium, local-first offline music player designed for solo users who want complete control over their music library without subscriptions. It lets users seamlessly download high-quality audio from YouTube links and listen offline.
* **Problem Statement:** Modern streaming services require monthly subscriptions, consume high bandwidth, and can remove tracks due to licensing issues. Existing offline players lack built-in download workflows, forcing users to use shady conversion websites.
* **Proposed Solution:** A sleek, unified player for Windows and Mobile. Paste a YouTube link to download a track directly to the local machine, automatically extracting audio and saving it to a beautiful local library that works entirely offline.
* **Success Metrics:**
  * **Phase 1 (Windows MVP):** Less than 30 seconds average download time from pasting a link to playing the song; 100% offline playback reliability.
  * **Phase 2 (Mobile MVP):** Successful sync/transfer of downloaded files from Windows to Mobile over local network or direct import; background audio playback stability.

---

## 2. Background & Context
* **Competitive Landscape:**
  | Competitor | Strength | Weakness | BeatDrop Angle |
  | --- | --- | --- | --- |
  | **Spotify/Apple Music** | Huge library, sync | Monthly fees, DRM-locked, online-reliant | Free, permanent local ownership of files |
  | **Foobar2000 / VLC** | Highly customizable, light | Outdated UI, manual download/tagging workflow | Modern cyber-audio UI, instant link-to-library download |
  | **YouTube Downloader Sites** | Free downloads | Ad-ridden, malware risk, separate player needed | Integrated, safe, one-click experience |

* **Differentiation:** Zero ads, instant offline availability, and a curated "Cyber Neon" visual style optimized for local listening.

---

## 3. Target Users
* **Persona 1: Alex (The Audiophile / Student)**
  * *Pain:* Annoyed by rising subscription fees and tracks disappearing from playlists.
  * *Goal:* Build a permanent high-quality music archive on their laptop.
  * *Tech Comfort:* High. Uses keyboard shortcuts and custom setups.
* **Persona 2: Taylor (The Commuter / Mobile Listener)**
  * *Pain:* High mobile data costs and spotty subway connections.
  * *Goal:* Keep their custom music library on their phone with zero buffering.
  * *Tech Comfort:* Medium. Expects simple controls and easy setup.

* **Jobs-To-Be-Done (JTBD):**
  1. *When I find a song on YouTube, I want to download it directly to my player, so that I can listen to it offline without advertisements.*
  2. *When I play my offline music, I want a gorgeous, lag-free UI that feels premium and responsive.*

---

## 4. Feature Specifications — PHASE 1 (Local Windows App)

### Feature 1.1: Audio Downloader Engine (YouTube Parser)
* **Description:** Input box to paste any YouTube URL. Rust backend processes link, fetches audio streams via a packaged helper (`yt-dlp` or similar Rust binding), downloads the highest-quality audio (M4A/MP3), and adds it to the library.
* **Data Needed:**
  * Input: YouTube URL (`string`).
  * Processed Output: Audio file path (`string`), track title (`string`), duration (`number` in seconds), thumbnail image (`string`).
* **UI Description:** Input field at top navigation with a "Download" button, progress bar (percentage + status like "Fetching", "Downloading", "Converting"), and toast notifications on success/failure.
* **Edge Cases:**
  * Invalid URLs: Show warning toast immediately.
  * Age-restricted/Geo-blocked videos: Gracefully catch backend exit codes and explain the reason to the user.
  * Network disconnection: Pause download and show "Network interrupted" status.
* **Acceptance Criteria:**
  * **Given** a valid YouTube URL is pasted and "Download" is clicked, **when** the download succeeds, **then** the file must appear in the local library folder and play instantly.

### Feature 1.2: Local Audio Library Manager
* **Description:** Scanning and indexing downloaded files from the dedicated system directory.
* **Data Needed:**
  * Tracks Table/JSON: ID, Title, Artist, Duration, FilePath, CoverArtPath, DateAdded.
  * Playlists: ID, Name, TrackIDs (Array).
* **UI Description:** Grid view of songs with cover art (or generated gradient avatar), search bar (filters by title/artist), playlist sidebar.
* **Acceptance Criteria:**
  * **Given** local music files exist, **when** the player launches, **then** it lists all songs instantly with responsive filtering.

### Feature 1.3: Premium Playback Controls
* **Description:** Local-first audio engine executing standard player commands.
* **UI Description:** Bottom player bar with play/pause button, skip next/prev, volume slider, current time, total time, progress bar slider (scrubbing), shuffle, and repeat toggles.
* **Acceptance Criteria:**
  * **Given** a song is selected, **when** clicked, **then** audio begins playing with matching bottom controls updating in real-time.

---

## 5. Feature Specifications — PHASE 2 (Mobile MVP & Sync)

### Feature 2.1: Flutter Mobile Audio Player
* **Description:** Offline-ready mobile audio client reading from the device storage.
* **UI Description:** Sleek pocket layout mirroring the desktop Cyber-Audio styling. Includes quick-access bottom navigation, swipe gestures to queue songs, and persistent background playback services.

### Feature 2.2: Local Network Sync
* **Description:** A local peer-to-peer sync engine allowing the Windows app to host a temporary sync server so the Mobile App (on the same Wi-Fi network) can discover and sync the music files.
* **Data Needed:**
  * Sync Manifest: JSON containing library tracks hash list.
* **UI Description:** "Sync with Mobile" option generating a QR code or showing a local IP address on Windows; "Scan Code" or "Auto-Discover" on Mobile.
* **Acceptance Criteria:**
  * **Given** both apps are open on the same local network, **when** Sync is triggered, **then** missing tracks transfer from Windows to Mobile.

---

## 6. Feature Specifications — PHASE 3 (Post-MVP Roadmap)
* **Lyrics Syncing:** Auto-search lyrics databases based on song tags and display scrolling synchronized text during playback.
* **Equalizer & Sound Effects:** Reverb, bass boost, and custom bands.
* **Auto Tag Editor:** Automatic metadata generation using acoustic fingerprinting (like AcoustID).

---

## 7. Non-Functional Requirements
* **Performance:** Player boot time under 500ms. Link conversion/download initialization under 2 seconds.
* **Offline-First:** All play operations must function with zero network access.
* **Storage Limit:** Safe checks to prevent disk exhaustion during massive downloads.

---

## 8. Out of Scope
* Multi-user cloud account synchronization.
* Direct video playback (strictly extracts audio).
* Torrent downloads or downloading from unsupported sources in MVP.

---

## 9. Open Questions & Risks
* *Risk:* YouTube constantly updates their layout, breaking `yt-dlp`.
  * *Mitigation:* Bundle auto-updates for `yt-dlp` binary or run updater checks on launch.
* *Question:* Should we use SQLite locally, or is JSON state management enough?
  * *Assumption [ASSUMED]:* SQLite via Tauri's SQL plugin is preferred for the library database to ensure fast lookups when scaling to 1000+ tracks.

---

## 10. Glossary
* **Tauri:** Security-focused framework for building desktop apps using Rust cores and Web frontends.
* **yt-dlp:** Command-line tool used for downloading video and audio from YouTube and other video hosting platforms.
* **Metadata (ID3 tags):** Embedded information in audio files (artist name, track title, artwork).
