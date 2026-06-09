pub mod database;
pub mod downloader;

use tauri::{AppHandle, Manager, Emitter};
use tauri::tray::TrayIconBuilder;
use rusqlite::Connection;
use database::{Track, Playlist};

#[tauri::command]
fn update_player_state(app_handle: AppHandle, state: serde_json::Value) -> Result<(), String> {
    app_handle.emit("player-state-update", state).map_err(|e| e.to_string())
}

#[tauri::command]
fn request_player_state(app_handle: AppHandle) -> Result<(), String> {
    app_handle.emit("request-player-state", ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn send_tray_action(app_handle: AppHandle, action: String, payload: Option<serde_json::Value>) -> Result<(), String> {
    app_handle.emit(&format!("tray-{}", action), payload).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_all_tracks(app_handle: AppHandle) -> Result<Vec<Track>, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("library.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
    let mut tracks = database::get_tracks(&conn).map_err(|e| format!("Database error: {}", e))?;
    
    for track in &mut tracks {
        let abs_audio = app_dir.join(&track.file_path);
        track.file_path = abs_audio.to_string_lossy().to_string();
        
        if let Some(ref cover) = track.cover_path {
            let abs_cover = app_dir.join(cover);
            track.cover_path = Some(abs_cover.to_string_lossy().to_string());
        }
    }
    
    Ok(tracks)
}

#[tauri::command]
fn create_playlist(app_handle: AppHandle, name: String) -> Result<Playlist, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("library.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
    
    let playlist_id = uuid::Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    database::create_playlist_db(&conn, &playlist_id, &name, now)
        .map_err(|e| format!("Failed to create playlist: {}", e))?;

    Ok(Playlist {
        id: playlist_id,
        name,
        date_created: now,
    })
}

#[tauri::command]
fn get_all_playlists(app_handle: AppHandle) -> Result<Vec<Playlist>, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("library.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
    database::get_playlists_db(&conn).map_err(|e| format!("Database error: {}", e))
}

#[tauri::command]
fn add_track_to_playlist(app_handle: AppHandle, playlist_id: String, track_id: String) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("library.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
    database::add_track_to_playlist_db(&conn, &playlist_id, &track_id)
        .map_err(|e| format!("Database error: {}", e))
}

#[tauri::command]
fn get_playlist_tracks(app_handle: AppHandle, playlist_id: String) -> Result<Vec<Track>, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("library.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
    let mut tracks = database::get_playlist_tracks_db(&conn, &playlist_id).map_err(|e| format!("Database error: {}", e))?;
    
    for track in &mut tracks {
        let abs_audio = app_dir.join(&track.file_path);
        track.file_path = abs_audio.to_string_lossy().to_string();
        
        if let Some(ref cover) = track.cover_path {
            let abs_cover = app_dir.join(cover);
            track.cover_path = Some(abs_cover.to_string_lossy().to_string());
        }
    }
    
    Ok(tracks)
}

#[tauri::command]
fn delete_track(app_handle: AppHandle, track_id: String) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("library.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
    
    let mut stmt = conn.prepare("SELECT file_path, cover_path FROM tracks WHERE id = ?1")
        .map_err(|e| e.to_string())?;
        
    let row = stmt.query_row([&track_id], |r| {
        let file_path: String = r.get(0)?;
        let cover_path: Option<String> = r.get(1)?;
        Ok((file_path, cover_path))
    });
    
    if let Ok((file_path, cover_path)) = row {
        conn.execute("DELETE FROM tracks WHERE id = ?1", [&track_id])
            .map_err(|e| format!("Failed to delete track: {}", e))?;
            
        let abs_audio = app_dir.join(file_path);
        if abs_audio.exists() {
            let _ = std::fs::remove_file(abs_audio);
        }
        
        if let Some(cover) = cover_path {
            let abs_cover = app_dir.join(cover);
            if abs_cover.exists() {
                let _ = std::fs::remove_file(abs_cover);
            }
        }
    } else {
        return Err("Track not found".to_string());
    }
    
    Ok(())
}

#[tauri::command]
async fn import_tracks_dialog(app_handle: AppHandle) -> Result<Vec<Track>, String> {
    let files = tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .add_filter("Audio Files", &["mp3", "m4a", "webm", "wav", "ogg", "mp4", "opus"])
            .pick_files()
    })
    .await
    .map_err(|e| e.to_string())?;

    let Some(paths) = files else {
        return Ok(Vec::new());
    };

    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("library.db");
    let tracks_dir = app_dir.join("tracks");
    std::fs::create_dir_all(&tracks_dir).map_err(|e| e.to_string())?;

    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
    let mut imported_tracks = Vec::new();

    for path in paths {
        let file_stem = path.file_stem().ok_or("Invalid file name")?.to_string_lossy().to_string();
        let track_id = uuid::Uuid::new_v4().to_string();
        let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        let dest_filename = format!("{}.{}", track_id, ext);
        let dest_path = tracks_dir.join(&dest_filename);
        
        std::fs::copy(&path, &dest_path).map_err(|e| format!("Failed to copy file: {}", e))?;
        let file_rel_path = format!("tracks/{}", dest_filename);
        
        let mut duration = 0;
        let mut title = file_stem.clone();
        let mut artist = "Unknown Artist".to_string();
        let mut album = "Local Import".to_string();

        let parsed_metadata = (|| -> Result<(i32, String, String, String), Box<dyn std::error::Error>> {
            let tagged_file = lofty::probe::Probe::open(&path)?
                .guess_file_type()?
                .read()?;
            
            use lofty::file::{AudioFile, TaggedFileExt};
            let properties = tagged_file.properties();
            let duration_secs = properties.duration().as_secs() as i32;

            let mut t_title = file_stem;
            let mut t_artist = "Unknown Artist".to_string();
            let mut t_album = "Local Import".to_string();

            use lofty::tag::Accessor;
            if let Some(primary_tag) = tagged_file.primary_tag() {
                if let Some(t) = primary_tag.title() {
                    t_title = t.to_string();
                }
                if let Some(a) = primary_tag.artist() {
                    t_artist = a.to_string();
                }
                if let Some(al) = primary_tag.album() {
                    t_album = al.to_string();
                }
            } else if !tagged_file.tags().is_empty() {
                let tag = &tagged_file.tags()[0];
                if let Some(t) = tag.title() {
                    t_title = t.to_string();
                }
                if let Some(a) = tag.artist() {
                    t_artist = a.to_string();
                }
                if let Some(al) = tag.album() {
                    t_album = al.to_string();
                }
            }

            Ok((duration_secs, t_title, t_artist, t_album))
        })();

        if let Ok((d, t, a, al)) = parsed_metadata {
            duration = d;
            title = t;
            artist = a;
            album = al;
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
            
        let track = Track {
            id: track_id.clone(),
            title,
            artist,
            album,
            duration,
            file_path: file_rel_path,
            cover_path: None,
            youtube_url: None,
            date_added: now,
        };
        
        database::insert_track(&conn, &track).map_err(|e| format!("Failed to save track: {}", e))?;
        imported_tracks.push(track);
    }

    Ok(imported_tracks)
}

#[tauri::command]
fn remove_track_from_playlist(app_handle: AppHandle, playlist_id: String, track_id: String) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("library.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {}", e))?;
    conn.execute(
        "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
        [&playlist_id, &track_id],
    ).map_err(|e| format!("Database error: {}", e))?;
    Ok(())
}

fn dir_size(path: &std::path::Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    let mut size = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries {
            if let Ok(entry) = entry {
                size += dir_size(&entry.path());
            }
        }
    }
    size
}

#[derive(serde::Serialize)]
struct StorageInfo {
    free_bytes: u64,
    total_bytes: u64,
    app_bytes: u64,
}

#[tauri::command]
fn get_storage_info(app_handle: AppHandle) -> Result<StorageInfo, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(&app_dir);
    let app_bytes = dir_size(&app_dir);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let mut path_buf: Vec<u16> = app_dir.as_os_str().encode_wide().collect();
        path_buf.push(0);

        let mut free_bytes: u64 = 0;
        let mut total_bytes: u64 = 0;
        let mut total_free_bytes: u64 = 0;

        #[link(name = "kernel32")]
        extern "system" {
            fn GetDiskFreeSpaceExW(
                lpDirectoryName: *const u16,
                lpFreeBytesAvailableToCaller: *mut u64,
                lpTotalNumberOfBytes: *mut u64,
                lpTotalNumberOfFreeBytes: *mut u64,
            ) -> i32;
        }

        let success = unsafe {
            GetDiskFreeSpaceExW(
                path_buf.as_ptr(),
                &mut free_bytes,
                &mut total_bytes,
                &mut total_free_bytes,
            )
        };

        if success != 0 {
            Ok(StorageInfo {
                free_bytes,
                total_bytes,
                app_bytes,
            })
        } else {
            Err("Failed to query disk space".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = std::process::Command::new("df")
            .arg("-k")
            .arg(&app_dir)
            .output();
            
        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let lines: Vec<&str> = stdout.lines().collect();
            if lines.len() >= 2 {
                let cols: Vec<&str> = lines[1].split_whitespace().collect();
                if cols.len() >= 4 {
                    if let (Ok(total_kb), Ok(avail_kb)) = (cols[1].parse::<u64>(), cols[3].parse::<u64>()) {
                        return Ok(StorageInfo {
                            free_bytes: avail_kb * 1024,
                            total_bytes: total_kb * 1024,
                            app_bytes,
                        });
                    }
                }
            }
        }
        
        Ok(StorageInfo {
            free_bytes: 50 * 1024 * 1024 * 1024,
            total_bytes: 256 * 1024 * 1024 * 1024,
            app_bytes,
        })
    }
}

#[tauri::command]
fn exit_app(app_handle: AppHandle) {
    app_handle.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
            let db_path = app_dir.join("library.db");
            
            println!("Initializing SQLite database at: {}", db_path.to_string_lossy());
            database::init_db(&db_path).expect("Failed to initialize SQLite database");
            
            let show_i = tauri::menu::MenuItem::with_id(app, "show", "Show Open Beat", true, None::<&str>)?;
            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Quit Open Beat", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show_i, &quit_i])?;

            if let Some(icon) = app.default_window_icon().cloned() {
                if let Some(popover_window) = app.get_webview_window("tray_popover") {
                    let popover_clone = popover_window.clone();
                    popover_window.on_window_event(move |event| {
                        if let tauri::WindowEvent::Focused(false) = event {
                            let _ = popover_clone.hide();
                        }
                    });
                }

                let _tray = TrayIconBuilder::new()
                    .icon(icon)
                    .menu(&menu)
                    .on_menu_event(|app, event| {
                        match event.id.as_ref() {
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            rect,
                            ..
                        } = event {
                            if let Some(window) = tray.app_handle().get_webview_window("tray_popover") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let win_size = window.outer_size().unwrap_or(tauri::PhysicalSize { width: 360, height: 180 });
                                    let win_w = win_size.width as f64;
                                    let win_h = win_size.height as f64;

                                     let (icon_x, icon_y) = match rect.position {
                                         tauri::Position::Physical(p) => (p.x as f64, p.y as f64),
                                         tauri::Position::Logical(l) => (l.x, l.y),
                                     };
                                     let (icon_w, icon_h) = match rect.size {
                                         tauri::Size::Physical(s) => (s.width as f64, s.height as f64),
                                         tauri::Size::Logical(l) => (l.width, l.height),
                                     };

                                    let monitor = window.current_monitor().ok().flatten();
                                    let (monitor_w, monitor_h) = if let Some(m) = monitor {
                                        let size = m.size();
                                        (size.width as f64, size.height as f64)
                                    } else {
                                        (1920.0, 1080.0)
                                    };

                                    let x = (icon_x + icon_w / 2.0) - win_w / 2.0;
                                    let x = x.max(0.0).min(monitor_w - win_w);

                                    let y = if icon_y > monitor_h / 2.0 {
                                        icon_y - win_h - 10.0
                                    } else {
                                        icon_y + icon_h + 10.0
                                    };

                                    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                                        x: x as i32,
                                        y: y as i32,
                                    }));
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    })
                    .build(app)?;
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            downloader::download_track,
            downloader::get_playlist_videos,
            downloader::cancel_download,
            get_all_tracks,
            create_playlist,
            get_all_playlists,
            add_track_to_playlist,
            get_playlist_tracks,
            delete_track,
            remove_track_from_playlist,
            import_tracks_dialog,
            get_storage_info,
            update_player_state,
            request_player_state,
            send_tray_action,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

