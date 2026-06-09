use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::fs;
use std::sync::Mutex;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};
use rusqlite::Connection;
use serde::{Serialize, Deserialize};

use crate::database::{Track, insert_track};

static ACTIVE_DOWNLOADS: Mutex<Option<HashMap<String, u32>>> = Mutex::new(None);


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadStatus {
    pub url: String,
    pub progress: f32,
    pub speed: String,
    pub status: String,
    pub error: Option<String>,
}

fn ensure_yt_dlp(app_dir: &Path) -> Result<PathBuf, String> {
    let bin_dir = app_dir.join("bin");
    if !bin_dir.exists() {
        fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    let (exe_name, download_url) = (
        "yt-dlp.exe",
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
    );

    #[cfg(target_os = "macos")]
    let (exe_name, download_url) = (
        "yt-dlp_macos",
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
    );

    #[cfg(target_os = "linux")]
    let (exe_name, download_url) = (
        "yt-dlp_linux",
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux",
    );

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let (exe_name, download_url) = (
        "yt-dlp",
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
    );

    let exe_path = bin_dir.join(exe_name);
    if !exe_path.exists() {
        println!("{} not found. Downloading latest version from GitHub...", exe_name);
        let mut response = reqwest::blocking::get(download_url).map_err(|e| format!("Failed to download yt-dlp: {}", e))?;
        let mut dest = fs::File::create(&exe_path).map_err(|e| format!("Failed to create yt-dlp file: {}", e))?;
        std::io::copy(&mut response, &mut dest).map_err(|e| format!("Failed to write yt-dlp: {}", e))?;
        
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&exe_path).map_err(|e| e.to_string())?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&exe_path, perms).map_err(|e| e.to_string())?;
        }

        println!("{} downloaded successfully!", exe_name);
    }
    Ok(exe_path)
}

#[tauri::command]
pub async fn download_track(
    app_handle: AppHandle,
    url: String,
    is_video: Option<bool>,
    quality: Option<String>,
) -> Result<Track, String> {
    let is_video = is_video.unwrap_or(false);
    // Validate YouTube URL
    if !url.contains("youtube.com/") && !url.contains("youtu.be/") {
        return Err("Invalid YouTube URL. Please provide a valid YouTube link.".to_string());
    }

    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("library.db");
    let tracks_dir = app_dir.join("tracks");
    let covers_dir = app_dir.join("covers");

    // Ensure directories exist
    fs::create_dir_all(&tracks_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&covers_dir).map_err(|e| e.to_string())?;

    // Ensure yt-dlp is present
    let app_dir_clone = app_dir.clone();
    let yt_dlp_path = tokio::task::spawn_blocking(move || {
        ensure_yt_dlp(&app_dir_clone)
    }).await.map_err(|e| format!("Spawn blocking error: {}", e))??;

    // Emit fetching status
    let _ = app_handle.emit("download-status", DownloadStatus {
        url: url.clone(),
        progress: 0.0,
        speed: "N/A".to_string(),
        status: "fetching".to_string(),
        error: None,
    });

    // 1. Fetch metadata using yt-dlp
    let output = Command::new(&yt_dlp_path)
        .args(&[
            "--print",
            "%(title)s|%(duration)s|%(id)s",
            "--no-playlist",
            &url,
        ])
        .output()
        .map_err(|e| format!("Failed to get video metadata: {}", e))?;

    if !output.status.success() {
        let err_str = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = app_handle.emit("download-status", DownloadStatus {
            url: url.clone(),
            progress: 0.0,
            speed: "0".to_string(),
            status: "failed".to_string(),
            error: Some(err_str.clone()),
        });
        return Err(format!("Metadata fetch failed: {}", err_str));
    }

    let meta_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parts: Vec<&str> = meta_str.split('|').collect();
    if parts.len() < 3 {
        return Err("Failed to parse video metadata from yt-dlp output".to_string());
    }

    let video_id = parts[parts.len() - 1].to_string();
    let duration: i32 = parts[parts.len() - 2].parse().unwrap_or(0);
    let title = parts[..parts.len() - 2].join("|");

    // 2. Start the actual download
    // We ask yt-dlp to download based on format choice and quality choices
    let format_arg_string: String = if is_video {
        if let Some(ref q) = quality {
            if let Ok(height) = q.trim_end_matches('p').parse::<i32>() {
                format!("bv*[height<={height}][ext=mp4]+ba[ext=m4a]/b[height<={height}][ext=mp4]/bv*[height<={height}]+ba/b[height<={height}]")
            } else {
                "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv+ba/b".to_string()
            }
        } else {
            "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv+ba/b".to_string()
        }
    } else {
        if let Some(ref q) = quality {
            let clean_q = q.trim_end_matches("k").trim_end_matches("kbps");
            if let Ok(abr) = clean_q.parse::<i32>() {
                format!("ba[abr<={abr}][ext=m4a]/ba[abr<={abr}]/ba")
            } else if q == "high" {
                "ba[ext=m4a]/ba".to_string()
            } else if q == "medium" {
                "ba[abr<=128][ext=m4a]/ba[abr<=128]/ba".to_string()
            } else if q == "low" {
                "ba[abr<=64][ext=m4a]/ba[abr<=64]/ba".to_string()
            } else {
                "ba[ext=m4a]/ba".to_string()
            }
        } else {
            "ba[ext=m4a]/ba".to_string()
        }
    };
    let format_arg = &format_arg_string;

    let mut child = Command::new(&yt_dlp_path)
        .args(&[
            "-f",
            format_arg,
            "--newline",
            "--progress",
            "--no-playlist",
            "--write-thumbnail",
            "-o",
            &format!("{}.%(ext)s", video_id),
            &url,
        ])
        .current_dir(&tracks_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn download process: {}", e))?;

    let pid = child.id();
    if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
        guard.get_or_insert_with(HashMap::new).insert(url.clone(), pid);
    }

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let reader = BufReader::new(stdout);

    // Track state
    let mut current_progress = 0.0;
    let mut current_speed = "0B/s".to_string();

    let _ = app_handle.emit("download-status", DownloadStatus {
        url: url.clone(),
        progress: 0.0,
        speed: "N/A".to_string(),
        status: "downloading".to_string(),
        error: None,
    });

    for line in reader.lines() {
        if let Ok(line_str) = line {
            // Check for progress percentage in stdout lines
            // Example: [download]  10.5% of 3.42MiB at  2.11MiB/s ETA 00:01
            if line_str.contains("[download]") && line_str.contains("%") {
                let parts: Vec<&str> = line_str.split_whitespace().collect();
                for (i, part) in parts.iter().enumerate() {
                    if part.contains("%") {
                        if let Ok(p) = part.trim_end_matches('%').parse::<f32>() {
                            current_progress = p;
                        }
                    }
                    if *part == "at" && i + 1 < parts.len() {
                        current_speed = parts[i + 1].to_string();
                    }
                }

                // Emit progress event
                let _ = app_handle.emit("download-status", DownloadStatus {
                    url: url.clone(),
                    progress: current_progress,
                    speed: current_speed.clone(),
                    status: "downloading".to_string(),
                    error: None,
                });
            }
        }
    }

    let status = child.wait().map_err(|e| {
        if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
            if let Some(map) = guard.as_mut() {
                map.remove(&url);
            }
        }
        e.to_string()
    })?;

    if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
        if let Some(map) = guard.as_mut() {
            map.remove(&url);
        }
    }

    if !status.success() {
        // Clean up partial files starting with video_id in tracks_dir
        if let Ok(entries) = fs::read_dir(&tracks_dir) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                    if file_name.starts_with(&video_id) {
                        let _ = fs::remove_file(path);
                    }
                }
            }
        }

        let _ = app_handle.emit("download-status", DownloadStatus {
            url: url.clone(),
            progress: current_progress,
            speed: "0".to_string(),
            status: "failed".to_string(),
            error: Some("yt-dlp process exited with error or was cancelled".to_string()),
        });
        return Err("Download process failed to complete".to_string());
    }

    // 3. Find the downloaded files
    // Find cover image and audio track
    let mut actual_audio_path = String::new();
    let mut cover_dest_path = None;

    if let Ok(entries) = fs::read_dir(&tracks_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                
                if file_name.starts_with(&video_id) {
                    let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
                    if ext == "m4a" || ext == "webm" || ext == "mp3" || ext == "mp4" || ext == "opus" {
                        // Keep track relative to App Data directory for storage portability
                        actual_audio_path = format!("tracks/{}", file_name);
                    } else if ext == "jpg" || ext == "jpeg" || ext == "png" || ext == "webp" {
                        // Move thumbnail to covers/ folder
                        let dest = covers_dir.join(format!("{}.jpg", video_id));
                        if let Err(e) = fs::rename(&path, &dest) {
                            println!("Failed to move cover art: {}", e);
                            // Fallback: try copy if rename fails across devices
                            let _ = fs::copy(&path, &dest);
                            let _ = fs::remove_file(&path);
                        }
                        cover_dest_path = Some(format!("covers/{}.jpg", video_id));
                    }
                }
            }
        }
    }

    if actual_audio_path.is_empty() {
        return Err("Could not find downloaded file in tracks directory".to_string());
    }

    // 4. Save metadata to Database
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let track = Track {
        id: video_id.clone(),
        title,
        artist: "Unknown Artist".to_string(), // YouTube tracks default to Unknown Artist or channel
        album: "Open Beat Downloader".to_string(),
        duration,
        file_path: actual_audio_path,
        cover_path: cover_dest_path,
        youtube_url: Some(url.clone()),
        date_added: now,
        is_video: Some(is_video),
    };

    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
    insert_track(&conn, &track).map_err(|e| format!("Failed to save track metadata: {}", e))?;

    // Emit finished event
    let _ = app_handle.emit("download-status", DownloadStatus {
        url,
        progress: 100.0,
        speed: "0".to_string(),
        status: "finished".to_string(),
        error: None,
    });

    Ok(track)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaylistVideo {
    pub title: String,
    pub id: String,
    pub url: String,
}

#[tauri::command]
pub async fn get_playlist_videos(app_handle: AppHandle, url: String) -> Result<Vec<PlaylistVideo>, String> {
    // Validate YouTube URL
    if !url.contains("youtube.com/") && !url.contains("youtu.be/") {
        return Err("Invalid YouTube URL. Please provide a valid YouTube link.".to_string());
    }

    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    
    // Ensure yt-dlp is present
    let app_dir_clone = app_dir.clone();
    let yt_dlp_path = tokio::task::spawn_blocking(move || {
        ensure_yt_dlp(&app_dir_clone)
    }).await.map_err(|e| format!("Spawn blocking error: {}", e))??;

    // Run yt-dlp in flat-playlist mode to print each video's title, ID, and webpage URL
    let output = Command::new(&yt_dlp_path)
        .args(&[
            "--flat-playlist",
            "--print",
            "%(title)s|%(id)s|%(webpage_url)s",
            &url,
        ])
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

    if !output.status.success() {
        let err_str = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("yt-dlp playlist extraction failed: {}", err_str));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let mut videos = Vec::new();
    for line in stdout_str.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split('|').collect();
        if parts.len() >= 3 {
            let url = parts[parts.len() - 1].to_string();
            let id = parts[parts.len() - 2].to_string();
            let title = parts[..parts.len() - 2].join("|");
            videos.push(PlaylistVideo {
                title,
                id,
                url,
            });
        }
    }

    Ok(videos)
}

#[tauri::command]
pub async fn cancel_download(url: String) -> Result<(), String> {
    let pid = {
        let mut guard = ACTIVE_DOWNLOADS.lock().map_err(|e| e.to_string())?;
        guard.as_mut().and_then(|map| map.remove(&url))
    };

    if let Some(pid) = pid {
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(&["/F", "/T", "/PID", &pid.to_string()])
                .status();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("kill")
                .args(&["-9", &pid.to_string()])
                .status();
        }
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoFormatInfo {
    pub format_id: String,
    pub ext: String,
    pub height: Option<i32>,
    pub width: Option<i32>,
    pub abr: Option<f32>,
    pub filesize: Option<i64>,
    pub format_note: Option<String>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoDetails {
    pub id: String,
    pub title: String,
    pub duration: i32,
    pub thumbnail: Option<String>,
    pub formats: Vec<VideoFormatInfo>,
}

#[tauri::command]
pub async fn get_video_details(app_handle: AppHandle, url: String) -> Result<VideoDetails, String> {
    if !url.contains("youtube.com/") && !url.contains("youtu.be/") {
        return Err("Invalid YouTube URL. Please provide a valid YouTube link.".to_string());
    }

    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    
    // Ensure yt-dlp is present
    let app_dir_clone = app_dir.clone();
    let yt_dlp_path = tokio::task::spawn_blocking(move || {
        ensure_yt_dlp(&app_dir_clone)
    }).await.map_err(|e| format!("Spawn blocking error: {}", e))??;

    // Run yt-dlp --dump-json
    let output = Command::new(&yt_dlp_path)
        .args(&[
            "--dump-json",
            "--no-playlist",
            &url,
        ])
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

    if !output.status.success() {
        let err_str = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Failed to retrieve video details: {}", err_str));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let json_val: serde_json::Value = serde_json::from_str(&stdout_str)
        .map_err(|e| format!("Failed to parse metadata JSON: {}", e))?;

    let id = json_val["id"].as_str().unwrap_or("").to_string();
    let title = json_val["title"].as_str().unwrap_or("").to_string();
    let duration = json_val["duration"].as_i64().unwrap_or(0) as i32;
    let thumbnail = json_val["thumbnail"].as_str().map(|s| s.to_string());

    let mut formats = Vec::new();
    if let Some(formats_arr) = json_val["formats"].as_array() {
        for f in formats_arr {
            let format_id = f["format_id"].as_str().unwrap_or("").to_string();
            let ext = f["ext"].as_str().unwrap_or("").to_string();
            let height = f["height"].as_i64().map(|h| h as i32);
            let width = f["width"].as_i64().map(|w| w as i32);
            let abr = f["abr"].as_f64().map(|a| a as f32);
            let filesize = f["filesize"].as_i64();
            let format_note = f["format_note"].as_str().map(|s| s.to_string());
            let vcodec = f["vcodec"].as_str().map(|s| s.to_string());
            let acodec = f["acodec"].as_str().map(|s| s.to_string());

            formats.push(VideoFormatInfo {
                format_id,
                ext,
                height,
                width,
                abr,
                filesize,
                format_note,
                vcodec,
                acodec,
            });
        }
    }

    Ok(VideoDetails {
        id,
        title,
        duration,
        thumbnail,
        formats,
    })
}


