# Compilation & Distribution Checklist
**Filename:** `07-Deployment-Checklist.md`
**Product:** BeatDrop — Offline Music Player & Downloader

---

## 1. Tauri Sidecar Packaging (Critical)
Tauri requires separate `yt-dlp` executables for target operating systems.

- [ ] Download Windows binary `yt-dlp.exe`.
- [ ] Rename to match Tauri target triple: `yt-dlp-x86_64-pc-windows-msvc.exe` (or similar depending on platform CPU).
- [ ] Place in `src-tauri/bin/` folder.
- [ ] Add the sidecar configuration array in `tauri.conf.json`:
  ```json
  "bundle": {
    "externalBin": [
      "bin/yt-dlp"
    ]
  }
  ```

---

## 2. Tauri Windows Build Setup
- [ ] Set application identifiers and bundle name in `tauri.conf.json`.
- [ ] Run `npm run tauri build`.
- [ ] Verify output directory: `src-tauri/target/release/bundle/msi/` or `/nsis/`.
- [ ] **Code Signing [ASSUMED]:** If deploying publicly, configure EV Code Signing Certificate environment variables (`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) to bypass Windows SmartScreen warnings.

---

## 3. Flutter Android Build Checklist
- [ ] Update `pubspec.yaml` versioning.
- [ ] Setup Android permissions in `AndroidManifest.xml` (requires `READ_EXTERNAL_STORAGE`, `INTERNET` for sync, `FOREGROUND_SERVICE` for background music).
- [ ] Configure release signing keys (`key.properties` and keystore file).
- [ ] Run `flutter build appbundle` (for Google Play Store upload) or `flutter build apk --split-per-abi` (for direct offline installation).

---

## 4. Flutter iOS Build Checklist
- [ ] Open project in Xcode.
- [ ] Configure background capabilities (Audio, AirPlay, and Picture in Picture).
- [ ] Setup permissions in `Info.plist` (Local Network usage description for P2P sync).
- [ ] Register App ID on Apple Developer Portal, setup Provisioning Profiles.
- [ ] Run `flutter build ipa`.
