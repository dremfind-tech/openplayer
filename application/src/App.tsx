import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Download, Plus, Library, ListMusic, HardDrive, Video, Settings } from "lucide-react";
import WindowControls from "./components/WindowControls";
import PlayerBar from "./components/PlayerBar";
import LibraryView from "./components/LibraryView";
import DownloaderView from "./components/DownloaderView";
import VideosView from "./components/VideosView";
import SettingsView from "./components/SettingsView";
import FullscreenPlayer from "./components/FullscreenPlayer";
import { usePlayerStore, Track, Playlist } from "./store";
import TrayPlayer from "./components/TrayPlayer";

export default function App() {
  const [windowLabel, setWindowLabel] = useState("");

  useEffect(() => {
    setWindowLabel(getCurrentWindow().label);
  }, []);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);

  // Send state to tray window
  useEffect(() => {
    if (windowLabel === "main") {
      invoke("update_player_state", {
        state: {
          currentTrack,
          isPlaying,
          currentTime,
          duration
        }
      }).catch((err) => console.error("Failed to update player state:", err));
    }
  }, [currentTrack, isPlaying, currentTime, duration, windowLabel]);

  // Listen for tray request for state
  useEffect(() => {
    if (windowLabel !== "main") return;
    
    const setupRequest = async () => {
      const unlistenRequest = await listen("request-player-state", () => {
        const state = usePlayerStore.getState();
        invoke("update_player_state", {
          state: {
            currentTrack: state.currentTrack,
            isPlaying: state.isPlaying,
            currentTime: state.currentTime,
            duration: state.duration
          }
        }).catch((err) => console.error("Failed to update player state:", err));
      });
      return unlistenRequest;
    };
    
    const promise = setupRequest();
    return () => {
      promise.then(fn => fn());
    };
  }, [windowLabel]);

  // Listen for tray events
  useEffect(() => {
    if (windowLabel !== "main") return;

    const listenTrayEvents = async () => {
      const unlistenPlayPause = await listen("tray-play-pause", () => {
        usePlayerStore.getState().togglePlay();
      });
      const unlistenPrev = await listen("tray-prev", () => {
        usePlayerStore.getState().prevTrack();
      });
      const unlistenNext = await listen("tray-next", () => {
        usePlayerStore.getState().nextTrack();
      });
      const unlistenSeek = await listen("tray-seek", (event: any) => {
        usePlayerStore.getState().seekTo(event.payload);
      });

      return () => {
        unlistenPlayPause();
        unlistenPrev();
        unlistenNext();
        unlistenSeek();
      };
    };

    const cleanupPromise = listenTrayEvents();

    return () => {
      cleanupPromise.then((cleanup) => cleanup());
    };
  }, [windowLabel]);

  const [activeTab, setActiveTab] = useState<"library" | "downloader" | "videos" | "settings">("library");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showNewPlaylistInput, setShowNewPlaylistInput] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ free_bytes: number; total_bytes: number; app_bytes: number } | null>(null);
  const [_isStorageHovered, setIsStorageHovered] = useState(false);

  const {
    playlists,
    currentPlaylistId,
    setTracks,
    setPlaylists,
    setCurrentPlaylistId,
    theme,
    isFullscreenOpen,
  } = usePlayerStore();

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove(
      "light",
      "theme-white-light-orange",
      "theme-obsidian",
      "theme-gray-orange",
      "theme-white-cream",
      "theme-black-modern"
    );
    if (theme !== "dark") {
      if (theme === "light") {
        root.classList.add("light");
      } else {
        root.classList.add(`theme-${theme}`);
      }
    }
  }, [theme]);

  const loadLibrary = async () => {
    try {
      const allTracks = await invoke<Track[]>("get_all_tracks");
      setTracks(allTracks);
    } catch (err) {
      console.error("Failed to load tracks:", err);
    }
  };

  const loadPlaylists = async () => {
    try {
      const allPlaylists = await invoke<Playlist[]>("get_all_playlists");
      setPlaylists(allPlaylists);
    } catch (err) {
      console.error("Failed to load playlists:", err);
    }
  };

  const loadPlaylistTracks = async (playlistId: string) => {
    try {
      const playlistTracks = await invoke<Track[]>("get_playlist_tracks", { playlistId });
      setTracks(playlistTracks);
      setCurrentPlaylistId(playlistId);
    } catch (err) {
      console.error("Failed to load playlist tracks:", err);
    }
  };

  const fetchStorageInfo = async () => {
    try {
      const info = await invoke<{ free_bytes: number; total_bytes: number; app_bytes: number }>("get_storage_info");
      setStorageInfo(info);
    } catch (err) {
      console.error("Failed to fetch storage info:", err);
    }
  };

  const formatBytes = (bytes: number, decimals = 1) => {
    if (!bytes) return "0 GB";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Initial load
  useEffect(() => {
    if (windowLabel !== "main") return;
    loadLibrary();
    loadPlaylists();
    fetchStorageInfo();
  }, [windowLabel]);

  // If this window is the tray popover, render the TrayPlayer
  if (windowLabel === "tray_popover") {
    return <TrayPlayer />;
  }

  const handleSelectLibrary = () => {
    setCurrentPlaylistId(null);
    loadLibrary();
    setActiveTab("library");
  };

  const handleSelectPlaylist = (playlistId: string) => {
    loadPlaylistTracks(playlistId);
    setActiveTab("library");
  };

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      await invoke("create_playlist", { name: newPlaylistName.trim() });
      setNewPlaylistName("");
      setShowNewPlaylistInput(false);
      loadPlaylists();
    } catch (err) {
      console.error("Failed to create playlist:", err);
    }
  };

  const handleRefresh = () => {
    if (currentPlaylistId) {
      loadPlaylistTracks(currentPlaylistId);
    } else {
      loadLibrary();
    }
    loadPlaylists();
    fetchStorageInfo();
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans select-none">
      {/* Custom Title Bar */}
      <WindowControls />

      {/* Main Container */}
      <div className="flex flex-grow min-h-0">
        
        {/* Sidebar */}
        <aside className="w-60 bg-zinc-950 border-r border-zinc-900 flex flex-col justify-between py-6">
          <div className="flex flex-col gap-8 px-4">
            
            {/* Nav Section */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest px-2 select-none">
                Discover
              </span>
              <button
                onClick={handleSelectLibrary}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "library" && !currentPlaylistId
                    ? "bg-violet-950/45 text-violet-400 border border-violet-500/20 shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent"
                }`}
              >
                <Library size={16} />
                Music
              </button>
              <button
                onClick={() => setActiveTab("downloader")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "downloader"
                    ? "bg-violet-950/45 text-violet-400 border border-violet-500/20 shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent"
                }`}
              >
                <Download size={16} />
                Download Hub
              </button>
              <button
                onClick={() => {
                  setCurrentPlaylistId(null);
                  setActiveTab("videos");
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "videos"
                    ? "bg-violet-950/45 text-violet-400 border border-violet-500/20 shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent"
                }`}
              >
                <Video size={16} />
                Videos
              </button>
              <button
                onClick={() => {
                  setCurrentPlaylistId(null);
                  setActiveTab("settings");
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "settings"
                    ? "bg-violet-950/45 text-violet-400 border border-violet-500/20 shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent"
                }`}
              >
                <Settings size={16} />
                Settings
              </button>
            </div>

            {/* Playlists Section */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest select-none">
                  Playlists
                </span>
                <button
                  onClick={() => setShowNewPlaylistInput(!showNewPlaylistInput)}
                  className="p-1 text-zinc-500 hover:text-zinc-200 rounded transition-colors"
                  title="Create Playlist"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Create Playlist Input */}
              {showNewPlaylistInput && (
                <form onSubmit={handleCreatePlaylist} className="px-2 mt-1">
                  <input
                    type="text"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="New playlist name..."
                    autoFocus
                    className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                </form>
              )}

              {/* Playlists List */}
              <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                {playlists.length === 0 ? (
                  <span className="text-[10px] text-zinc-600 block px-2 select-none">No playlists</span>
                ) : (
                  playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      onClick={() => handleSelectPlaylist(playlist.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all truncate ${
                        currentPlaylistId === playlist.id
                          ? "bg-violet-950/35 text-violet-400 border border-violet-500/15"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30 border border-transparent"
                      }`}
                    >
                      <ListMusic size={14} className="flex-shrink-0" />
                      <span className="truncate">{playlist.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

          </div>
          
          {/* Bottom Sidebar Info & Controls */}
          <div className="px-6 flex flex-col gap-4">
            {/* Storage Info Section */}
            {storageInfo && (() => {
              const systemUsedPct = (Math.max(0, storageInfo.total_bytes - storageInfo.free_bytes - storageInfo.app_bytes) / storageInfo.total_bytes) * 100;
              const appUsedPct = storageInfo.total_bytes > 0 ? Math.max(storageInfo.app_bytes > 0 ? 1.5 : 0, (storageInfo.app_bytes / storageInfo.total_bytes) * 100) : 0;
              return (
                <div
                  onMouseEnter={() => setIsStorageHovered(true)}
                  onMouseLeave={() => setIsStorageHovered(false)}
                  className="flex flex-col gap-2 select-none cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HardDrive size={14} className="text-violet-400" />
                      <span className="font-semibold text-[10px] uppercase tracking-wider text-zinc-500">Storage</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {formatBytes(storageInfo.free_bytes)} free
                    </span>
                  </div>

                  {/* Stacked bar — system | app | free */}
                  <div className="w-full h-2 bg-emerald-500 rounded-full overflow-hidden flex">
                    {/* System / other used — amber */}
                    <div
                      className="h-full bg-amber-400 transition-all duration-500 ease-out flex-shrink-0"
                      style={{ width: `${systemUsedPct}%` }}
                    />
                    {/* App used — violet */}
                    <div
                      className="h-full bg-violet-500 transition-all duration-500 ease-out flex-shrink-0"
                      style={{ width: `${appUsedPct}%` }}
                    />
                    {/* Remainder = free — emerald (the container bg) */}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center justify-between gap-1 text-[9px] font-medium">
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center gap-1 text-amber-400">
                        <span className="inline-block w-2 h-2 rounded-sm bg-amber-400 flex-shrink-0" />
                        System
                      </span>
                      <span className="flex items-center gap-1 text-violet-400">
                        <span className="inline-block w-2 h-2 rounded-sm bg-violet-500 flex-shrink-0" />
                        App {formatBytes(storageInfo.app_bytes)}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 flex-shrink-0" />
                      Free
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Version Info & Settings Gear */}
            <div className="flex items-center justify-between text-[10px] text-zinc-600 font-mono select-none pt-2 border-t border-zinc-900/60">
              <span>v1.0.0 (Beta)</span>
              <button
                onClick={() => {
                  setCurrentPlaylistId(null);
                  setActiveTab("settings");
                }}
                className={`p-1.5 rounded-md hover:bg-zinc-900/50 transition-colors flex items-center justify-center cursor-pointer ${
                  activeTab === "settings" ? "text-violet-400 bg-zinc-900/50" : "text-zinc-500 hover:text-zinc-400"
                }`}
                title="Settings"
              >
                <Settings size={12} className="hover:rotate-45 transition-transform duration-300" />
              </button>
            </div>
          </div>
        </aside>

        {/* Viewport */}
        <main className="flex-grow flex flex-col bg-zinc-950 min-w-0 overflow-y-auto">
          {activeTab === "library" ? (
            <LibraryView onRefresh={handleRefresh} />
          ) : activeTab === "downloader" ? (
            <DownloaderView onDownloadSuccess={handleRefresh} />
          ) : activeTab === "videos" ? (
            <VideosView onRefresh={handleRefresh} />
          ) : (
            <SettingsView />
          )}
        </main>

      </div>

      {/* Bottom Playback Control Bar — visible on library/playlist tab or when a track is loaded */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          activeTab === "library" || currentTrack !== null ? "max-h-28 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <PlayerBar />
      </div>

      {/* Fullscreen Player Overlay */}
      {isFullscreenOpen && <FullscreenPlayer />}
    </div>
  );
}
