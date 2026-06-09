# UI/UX Mobile Design Document — Flutter App
**Filename:** `03b-Mobile-Design.md`
**Product:** BeatDrop — Offline Music Player & Downloader
**Vibe/Theme:** Sleek Cyber-Audio (Fluid Mobile Gestures, Dark Mode, Compact Glassmorphism)

---

## 1. Mobile Design Strategy
* **Thumb-Zone Optimization:** All key interactive elements (Play/Pause, Next/Prev, Search trigger) are placed in the lower third of the screen.
* **Fluid Gestures:** Swipe track left to reveal queue option, drag down to minimize active player view into a mini player.
* **Compact Glassmorphism:** Subtle background blurs and transparent cards designed for mobile rendering speeds.
* **System Integration:** Integrate with iOS Control Center / Android Media Notification for background playback control.

---

## 2. Layout & Screen Flows

### 2.1 Navigation Structure (Bottom Navigation)
* **Tab 1: Library** — List/Grid view of local tracks, search, sorting filters.
* **Tab 2: Sync** — Scan QR code / Pair with desktop app to pull new downloads.
* **Tab 3: Settings** — Directory folder configuration, themes, clearing cache.

### 2.2 Main Full-Screen Player View
Triggered by tapping the mini-player at the bottom. Slides up vertically.

```
+------------------------------------------+
|  [v] Minimize             Sync Active    |
|                                          |
|                                          |
|            +------------------+          |
|            |                  |          |
|            |    Album Art     |          |
|            |    1:1 Grid      |          |
|            |                  |          |
|            +------------------+          |
|                                          |
|  Track Name Title                        |
|  Artist Name                             |
|                                          |
|  01:24 [========o==============] 04:12   |
|                                          |
|     (Shuffle) [|<] [ |> ] [>|] (Repeat)  |
|                                          |
|  [Queue Icon]           [Local Sync Icon]|
+------------------------------------------+
```

* **Interactive Elements:**
  * **Minimized Player (Persistent Bar):** Sits above the Bottom Nav bar. Shows mini cover art, title, and Play/Pause button. Tapping expands it.
  * **Background Visuals:** Subtle animated background gradients based on dominant colors of the active album art (using `palette_generator` library in Flutter).

---

## 3. Pairing and Sync UI
* **Trigger Interface:** Floating action button in Library or dedicated Tab.
* **QR Scanner View:** Camera overlay utilizing `mobile_scanner` library.
* **Syncing Progress:** Circular indicator showing percentage transfer of tracks: `Syncing tracks... 3/12 completed`.
