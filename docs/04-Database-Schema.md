# Database Schema & Data Model
**Filename:** `04-Database-Schema.md`
**Product:** BeatDrop — Offline Music Player & Downloader
**Storage Engine:** SQLite (Local-first, relational)

---

## 1. Schema Definitions

BeatDrop uses a local SQLite database file:
* **Windows App:** `library.db` stored in Tauri's resolved `$APP_DATA_DIR` directory.
* **Mobile App:** `mobile_library.db` stored in Flutter's resolved `getApplicationDocumentsDirectory()`.

### SQL Table Schema (Compatible across SQLite platforms)

```sql
-- Track metadata
CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY NOT NULL,          -- YouTube Video ID or unique hash
    title TEXT NOT NULL,
    artist TEXT DEFAULT 'Unknown Artist',
    album TEXT DEFAULT 'Unknown Album',
    duration INTEGER NOT NULL,             -- Length of song in seconds
    file_path TEXT NOT NULL,               -- Relative path under user music folder
    cover_path TEXT,                       -- Relative path to downloaded thumbnail
    youtube_url TEXT,                      -- Source URL
    date_added INTEGER NOT NULL            -- Timestamp (Seconds since epoch)
);

-- Playlist definition
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY NOT NULL,          -- UUID
    name TEXT NOT NULL,
    date_created INTEGER NOT NULL          -- Timestamp
);

-- Many-to-many relationship mapping tracks to playlists
CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    position INTEGER NOT NULL,             -- Manual ordering of songs in playlist
    PRIMARY KEY (playlist_id, track_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tracks_date ON tracks(date_added);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_pos ON playlist_tracks(playlist_id, position);
```

---

## 2. Seed Data

To populate the local library during development, run the following SQL script:

```sql
INSERT OR IGNORE INTO tracks (id, title, artist, album, duration, file_path, cover_path, youtube_url, date_added) VALUES
('dQw4w9WgXcQ', 'Never Gonna Give You Up', 'Rick Astley', 'Whenever You Need Somebody', 212, 'tracks/dQw4w9WgXcQ.mp3', 'covers/dQw4w9WgXcQ.jpg', 'https://youtube.com/watch?v=dQw4w9WgXcQ', 1700000000),
('YQHsXMglC9I', 'Stayin Alive', 'Bee Gees', 'Saturday Night Fever', 285, 'tracks/YQHsXMglC9I.mp3', 'covers/YQHsXMglC9I.jpg', 'https://youtube.com/watch?v=YQHsXMglC9I', 1700000100),
('L_LUpnjgPso', 'Cyber Synthwave Run', 'Lofi Coder', 'GitHub Beats', 180, 'tracks/L_LUpnjgPso.mp3', 'covers/L_LUpnjgPso.jpg', 'https://youtube.com/watch?v=L_LUpnjgPso', 1700000200);

INSERT OR IGNORE INTO playlists (id, name, date_created) VALUES
('playlist-uuid-1', 'Synthwave Coding Session', 1700000000);

INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES
('playlist-uuid-1', 'L_LUpnjgPso', 0),
('playlist-uuid-1', 'dQw4w9WgXcQ', 1);
```

---

## 3. SQLite Migration Strategy (Sync Protocol)
* **Metadata Sync Payload:** When Flutter connects, it sends a payload of its local `id`s. Tauri compares and sends a JSON payload containing all rows from `tracks`, `playlists`, and `playlist_tracks` that Flutter is missing.
* **Sync Script on Flutter:**
  ```dart
  // Flutter inserts the synced metadata in a single transaction
  await db.transaction((txn) async {
    for (var track in syncedTracks) {
      await txn.insert('tracks', track, conflictAlgorithm: ConflictAlgorithm.replace);
    }
  });
  ```
