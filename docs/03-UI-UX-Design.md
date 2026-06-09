# UI/UX Design Document — Windows App
**Filename:** `03-UI-UX-Design.md`
**Product:** BeatDrop — Offline Music Player & Downloader
**Vibe/Theme:** Sleek Cyber-Audio (Dark-Mode First, Glassmorphism, Neon Violet Accents)

---

## 1. Design Philosophy
* **Dark-Mode Only:** Audio players are best enjoyed in dark environments. A premium dark base prevents eye strain and makes album art/vibrant violet gradients pop.
* **Glassmorphism:** Use semi-transparent panels with backdrop-blur to create layers of depth.
* **Responsive Visualizers:** Subtle visual feedback (like glowing accents that pulse or smooth progress animations) to make the player feel alive.
* **Typography First:** Use high-legibility sans-serif fonts (e.g., Inter, Outfit, or Geist) for clean layout hierarchy.

---

## 2. Tailwind Configuration (Tailwind CSS v4)

Our color tokens are based on the Cyber Neon Violet palette. Here is the configuration blueprint:

```json
{
  "theme": {
    "extend": {
      "colors": {
        "cyber-bg": "#09090B",
        "cyber-card": "rgba(30, 27, 75, 0.4)",
        "cyber-accent": "#8B5CF6",
        "cyber-cyan": "#06B6D4",
        "cyber-text-primary": "#FAFAFA",
        "cyber-text-secondary": "#A1A1AA"
      },
      "backdropBlur": {
        "cyber-glass": "20px"
      },
      "boxShadow": {
        "neon-glow": "0 0 15px rgba(139, 92, 246, 0.5)",
        "cyan-glow": "0 0 15px rgba(6, 182, 212, 0.5)"
      }
    }
  }
}
```

---

## 3. Design Tokens & Typography Scale
* **Display Font:** `Outfit`, sans-serif (used for main headers and artist titles).
* **Body Font:** `Inter`, sans-serif (used for metadata, buttons, search, and body text).
* **Hierarchy:**
  * Track Title (Large View): `text-2xl font-bold tracking-tight text-cyber-text-primary`
  * Sidebar Headers: `text-xs font-semibold uppercase tracking-wider text-cyber-text-secondary`
  * Grid Labels: `text-sm font-medium text-cyber-text-primary`
  * Metadata/Subtext: `text-xs text-cyber-text-secondary`

---

## 4. Layout System & App Shell

The Windows application follows a standard three-panel responsive layout:

```
+--------------------------------------------------------------+
| BeatDrop  [ Search Tracks ]                        _  O  X   |  <-- Custom Window Titlebar (Tauri)
+-------------------+------------------------------------------+
|                   |                                          |
|  [Library]        |  Download Hub                            |
|  [Downloads]      |  [ Paste YouTube link here        ] [DL] |
|                   |  Progress: [======= 68% =======]         |
|  Playlists        |                                          |
|  [+] Cyber Beats  |  All Tracks                              |
|  [+] Chill Mix    |  +-------------------+----------------+  |
|                   |  | Track Title       | Artist         |  |
|                   |  +-------------------+----------------+  |
|                   |  | Midnight Run      | Neon Drive     |  |
|                   |  +-------------------+----------------+  |
|                   |                                          |
+-------------------+------------------------------------------+
|  [Cover] Track Title - Artist  ||  |>  [======o======] 01:24 |  <-- Bottom Player Bar
+--------------------------------------------------------------+
```

### Components
1. **Sidebar:** Contains logo, links to Library, Download Hub, Settings, and user-created Playlists. Transparent background with a subtle border-r.
2. **Main Screen Area:** Scrollable pane rendering selected view (Library grid, YouTube Downloader input, Playlist songs).
3. **Bottom Player Bar:** Fixed, full-width panel with backdrop-blur, play controls, song metadata, active track artwork, and persistent seek/volume bars.

---

## 5. Main Screens

### 5.1 Downloader Hub (`/downloader`)
* **Core Action:** Paste link to download songs.
* **Layout:** Centered card with large text field, download button, and queue lists.
* **State Progress UI:**
  * **Idle:** Empty text box with placeholder: `https://www.youtube.com/watch?v=...`
  * **Downloading:** Linear progress bar pulsing with Cyan/Violet gradient. Text displaying: `Downloading: 14.5MB / 21.0MB (3.2 MB/s)`
  * **Converting:** Spinning loader with text: `Extracting Audio & Tagging...`
  * **Success:** Green outline, checkmark icon, auto-fade after 3 seconds.

### 5.2 Library Grid (`/library`)
* **Core Action:** Search, browse, and play songs.
* **Layout:** Flex grid containing cards. Each card displays:
  * Artwork (1:1 aspect ratio) with hover zoom effect.
  * Hover overlay revealing a "Play Now" button.
  * Title & Artist text beneath.

### 5.3 Playback Controls (Bottom Bar)
* **Progress Bar (Seeker):** Hovering over seek bar reveals a glow effect; clicking or dragging jumps to that section of the audio track.
* **Active Status:** Track artwork rotates slowly (optional visualizer) or has custom glowing shadow.
