# Testing Strategy
**Filename:** `08-Testing-Strategy.md`
**Product:** BeatDrop — Offline Music Player & Downloader

---

## 1. Testing Philosophy
For local-first desktop and mobile tools developed by a solo builder, automated testing should be focused on **Critical Paths** that are difficult to verify manually. Unit tests are minimal; Integration and manual end-to-end (E2E) testing are prioritized.

---

## 2. Desktop Manual Test Cases

### 2.1 YouTube Download Loop
1. Navigate to Downloader view.
2. Paste a valid URL: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
3. Click "Download".
4. **Assertions:**
   * Progress bar displays.
   * "Converting..." state triggers.
   * File appears in `library` grid with title "Never Gonna Give You Up" and matching artist "Rick Astley".
   * Playable immediately.

### 2.2 Audio Player Interface
1. Tap on a song card.
2. **Assertions:**
   * Bottom bar displays song info and track image.
   * Play/Pause button toggles audio state correctly.
   * Seek bar moves matching playback time.
   * Scrubbing the slider jumps playback position without crashing/lag.

---

## 3. Mobile Sync Manual Testing
1. Connect Windows PC and Phone to the same WiFi network.
2. Click "Enable Sync" on Windows app.
3. Open Scanner on mobile app and scan QR code.
4. **Assertions:**
   * Mobile console shows "Handshake successful".
   * Manifest comparison prints count of missing tracks.
   * Track downloads sequentially.
   * Mobile database lists the synced tracks.

---

## 4. Automated E2E Testing (Tauri + WebDriverIO / Playwright)
Playwright can test the Vite web frontend within Tauri. We configure testing profiles pointing to target Tauri ports.

### E2E Playlist Creation Script (Spec Blueprint)
```javascript
test('should create a playlist and add a song', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.click('text=New Playlist');
  await page.fill('input[type="text"]', 'Coding Session');
  await page.click('button:has-text("Create")');
  
  // Assert playlist exists in sidebar
  await expect(page.locator('sidebar')).toContainText('Coding Session');
});
```
