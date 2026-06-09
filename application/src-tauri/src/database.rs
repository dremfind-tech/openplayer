use rusqlite::{Connection, Result};
use std::path::Path;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: i32,
    pub file_path: String,
    pub cover_path: Option<String>,
    pub youtube_url: Option<String>,
    pub date_added: i64,
    pub is_video: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub date_created: i64,
}

pub fn init_db(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    
    // Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;", [])?;

    // Create tracks table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tracks (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT NOT NULL,
            artist TEXT DEFAULT 'Unknown Artist',
            album TEXT DEFAULT 'Unknown Album',
            duration INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            cover_path TEXT,
            youtube_url TEXT,
            date_added INTEGER NOT NULL
        );",
        [],
    )?;

    // Alter table if column is_video does not exist
    let _ = conn.execute("ALTER TABLE tracks ADD COLUMN is_video INTEGER DEFAULT 0;", []);

    // Create playlists table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            date_created INTEGER NOT NULL
        );",
        [],
    )?;

    // Create playlist_tracks junction table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id TEXT NOT NULL,
            track_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY (playlist_id, track_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );",
        [],
    )?;

    // Create indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tracks_date ON tracks(date_added);",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_playlist_tracks_pos ON playlist_tracks(playlist_id, position);",
        [],
    )?;

    // Seed dummy data if database is empty
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tracks",
        [],
        |row| row.get(0),
    )?;

    if count == 0 {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let seed_tracks = vec![
            ("dQw4w9WgXcQ", "Never Gonna Give You Up", "Rick Astley", "Whenever You Need Somebody", 212, "tracks/dQw4w9WgXcQ.mp4", "covers/dQw4w9WgXcQ.jpg", "https://youtube.com/watch?v=dQw4w9WgXcQ", now),
            ("YQHsXMglC9I", "Stayin Alive", "Bee Gees", "Saturday Night Fever", 285, "tracks/YQHsXMglC9I.mp4", "covers/YQHsXMglC9I.jpg", "https://youtube.com/watch?v=YQHsXMglC9I", now - 100),
            ("L_LUpnjgPso", "Cyber Synthwave Run", "Lofi Coder", "GitHub Beats", 180, "tracks/L_LUpnjgPso.mp4", "covers/L_LUpnjgPso.jpg", "https://youtube.com/watch?v=L_LUpnjgPso", now - 200),
        ];

        for t in seed_tracks {
            conn.execute(
                "INSERT INTO tracks (id, title, artist, album, duration, file_path, cover_path, youtube_url, date_added)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9);",
                (t.0, t.1, t.2, t.3, t.4, t.5, t.6, t.7, t.8),
            )?;
        }

        conn.execute(
            "INSERT OR IGNORE INTO playlists (id, name, date_created) VALUES ('playlist-uuid-1', 'Synthwave Coding Session', ?1);",
            (now,),
        )?;

        conn.execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES ('playlist-uuid-1', 'L_LUpnjgPso', 0);",
            [],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES ('playlist-uuid-1', 'dQw4w9WgXcQ', 1);",
            [],
        )?;
    }

    Ok(conn)
}

pub fn get_tracks(conn: &Connection) -> Result<Vec<Track>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, artist, album, duration, file_path, cover_path, youtube_url, date_added, is_video 
         FROM tracks ORDER BY date_added DESC"
    )?;
    let track_iter = stmt.query_map([], |row| {
        let is_video_int: Option<i32> = row.get(9).ok();
        Ok(Track {
            id: row.get(0)?,
            title: row.get(1)?,
            artist: row.get(2)?,
            album: row.get(3)?,
            duration: row.get(4)?,
            file_path: row.get(5)?,
            cover_path: row.get(6)?,
            youtube_url: row.get(7)?,
            date_added: row.get(8)?,
            is_video: Some(is_video_int.unwrap_or(0) != 0),
        })
    })?;

    let mut tracks = Vec::new();
    for track in track_iter {
        tracks.push(track?);
    }
    Ok(tracks)
}

pub fn insert_track(conn: &Connection, track: &Track) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO tracks (id, title, artist, album, duration, file_path, cover_path, youtube_url, date_added, is_video)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        (
            &track.id,
            &track.title,
            &track.artist,
            &track.album,
            track.duration,
            &track.file_path,
            &track.cover_path,
            &track.youtube_url,
            track.date_added,
            track.is_video.unwrap_or(false) as i32,
        ),
    )?;
    Ok(())
}

pub fn create_playlist_db(conn: &Connection, id: &str, name: &str, date_created: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO playlists (id, name, date_created) VALUES (?1, ?2, ?3)",
        (id, name, date_created),
    )?;
    Ok(())
}

pub fn get_playlists_db(conn: &Connection) -> Result<Vec<Playlist>> {
    let mut stmt = conn.prepare("SELECT id, name, date_created FROM playlists ORDER BY date_created DESC")?;
    let playlist_iter = stmt.query_map([], |row| {
        Ok(Playlist {
            id: row.get(0)?,
            name: row.get(1)?,
            date_created: row.get(2)?,
        })
    })?;

    let mut playlists = Vec::new();
    for p in playlist_iter {
        playlists.push(p?);
    }
    Ok(playlists)
}

pub fn add_track_to_playlist_db(conn: &Connection, playlist_id: &str, track_id: &str) -> Result<()> {
    // Get next position
    let position: i32 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
        [playlist_id],
        |row| row.get(0),
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
        (playlist_id, track_id, position),
    )?;
    Ok(())
}

pub fn get_playlist_tracks_db(conn: &Connection, playlist_id: &str) -> Result<Vec<Track>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.title, t.artist, t.album, t.duration, t.file_path, t.cover_path, t.youtube_url, t.date_added, t.is_video
         FROM tracks t
         JOIN playlist_tracks pt ON t.id = pt.track_id
         WHERE pt.playlist_id = ?1
         ORDER BY pt.position ASC"
    )?;
    let track_iter = stmt.query_map([playlist_id], |row| {
        let is_video_int: Option<i32> = row.get(9).ok();
        Ok(Track {
            id: row.get(0)?,
            title: row.get(1)?,
            artist: row.get(2)?,
            album: row.get(3)?,
            duration: row.get(4)?,
            file_path: row.get(5)?,
            cover_path: row.get(6)?,
            youtube_url: row.get(7)?,
            date_added: row.get(8)?,
            is_video: Some(is_video_int.unwrap_or(0) != 0),
        })
    })?;

    let mut tracks = Vec::new();
    for track in track_iter {
        tracks.push(track?);
    }
    Ok(tracks)
}
