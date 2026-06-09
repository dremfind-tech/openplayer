import { useState, useRef, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  Play,
  Pause,
  Search,
  Trash2,
  X,
  Volume2,
  VolumeX,
  Maximize2,
  Video,
  AlertCircle,
  Rewind,
  FastForward,
  SkipBack,
  SkipForward,
  Lock,
  LockOpen,
  CheckSquare,
  Check,
  FolderPlus,
  Plus,
} from "lucide-react";
import { usePlayerStore, Track } from "../store";

interface VideosViewProps {
  onRefresh: () => void;
}

interface ConfirmConfig {
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  confirmText?: string;
  isDanger?: boolean;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function VideosView({ onRefresh }: VideosViewProps) {
  const { tracks, playlists, setPlaying, removeFromQueue } = usePlayerStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [playingVideo, setPlayingVideo] = useState<Track | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmConfig | null>(null);

  // Multi-select
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkPlaylistDropdown, setShowBulkPlaylistDropdown] = useState(false);
  const bulkPlaylistRef = useRef<HTMLDivElement | null>(null);

  // Video playback state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(0.8);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockHint, setShowUnlockHint] = useState(false);
  const unlockHintTimeoutRef = useRef<number | null>(null);

  const controlsTimeoutRef = useRef<number | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  const videos = tracks.filter((t) => t.is_video);

  const filteredVideos = videos.filter((video) => {
    const query = searchQuery.toLowerCase();
    return (
      video.title.toLowerCase().includes(query) ||
      video.artist.toLowerCase().includes(query)
    );
  });

  const selectedTotalSize = filteredVideos
    .filter((v) => selectedIds.has(v.id))
    .reduce((sum, v) => sum + (v.file_size_bytes ?? 0), 0);

  const currentVideoIndex = playingVideo
    ? videos.findIndex((v) => v.id === playingVideo.id)
    : -1;
  const hasPrev = currentVideoIndex > 0;
  const hasNext = currentVideoIndex < videos.length - 1;

  // Close bulk playlist dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (bulkPlaylistRef.current && !bulkPlaylistRef.current.contains(e.target as Node)) {
        setShowBulkPlaylistDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Multi-select handlers ────────────────────────────────────────────────

  const toggleSelectVideo = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredVideos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredVideos.map((v) => v.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setConfirmDialog({
      title: "Delete Selected Videos",
      message: `Are you sure you want to delete ${selectedIds.size} video${selectedIds.size > 1 ? "s" : ""}? This will permanently remove the files from your disk.`,
      confirmText: "Delete All",
      isDanger: true,
      onConfirm: async () => {
        for (const id of selectedIds) {
          await invoke("delete_track", { trackId: id });
          removeFromQueue(id);
        }
        setSelectedIds(new Set());
        setIsSelectMode(false);
        onRefresh();
      },
    });
  };

  const handleBulkAddToPlaylist = async (playlistId: string) => {
    if (selectedIds.size === 0) return;
    try {
      for (const id of selectedIds) {
        await invoke("add_track_to_playlist", { playlistId, trackId: id });
      }
      setSelectedIds(new Set());
      setIsSelectMode(false);
      setShowBulkPlaylistDropdown(false);
      onRefresh();
    } catch (err) {
      console.error("Failed to add videos to playlist:", err);
    }
  };

  // ── Single delete ────────────────────────────────────────────────────────

  const handleDeleteVideo = (video: Track) => {
    setConfirmDialog({
      title: "Delete Video",
      message: `Are you sure you want to delete "${video.title}"? This will permanently remove the video file from your disk.`,
      confirmText: "Delete",
      isDanger: true,
      onConfirm: async () => {
        await invoke("delete_track", { trackId: video.id });
        removeFromQueue(video.id);
        onRefresh();
      },
    });
  };

  // ── Playback ─────────────────────────────────────────────────────────────

  const handlePlayVideo = (track: Track) => {
    setPlaying(false);
    setPlayingVideo(track);
    setIsPlayingVideo(true);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setShowSpeedMenu(false);
  };

  const handleCloseVideo = () => {
    setPlayingVideo(null);
    setIsPlayingVideo(false);
    setShowSpeedMenu(false);
    setIsLocked(false);
    setShowUnlockHint(false);
    if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
    if (unlockHintTimeoutRef.current) window.clearTimeout(unlockHintTimeoutRef.current);
  };

  const handlePrevVideo = () => {
    if (currentVideoIndex > 0) handlePlayVideo(videos[currentVideoIndex - 1]);
  };

  const handleNextVideo = () => {
    if (currentVideoIndex < videos.length - 1) handlePlayVideo(videos[currentVideoIndex + 1]);
  };

  const handleSkipBack = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
      setVideoCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSkipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(videoDuration, videoRef.current.currentTime + 10);
      setVideoCurrentTime(videoRef.current.currentTime);
    }
  };

  const showUnlockHintBriefly = () => {
    setShowUnlockHint(true);
    if (unlockHintTimeoutRef.current) window.clearTimeout(unlockHintTimeoutRef.current);
    unlockHintTimeoutRef.current = window.setTimeout(() => setShowUnlockHint(false), 2500);
  };

  const toggleLock = () => {
    const next = !isLocked;
    setIsLocked(next);
    setShowSpeedMenu(false);
    if (next) {
      setShowControls(false);
      showUnlockHintBriefly();
    } else {
      setShowUnlockHint(false);
      if (unlockHintTimeoutRef.current) window.clearTimeout(unlockHintTimeoutRef.current);
      setShowControls(true);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    setShowSpeedMenu(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!playingVideo) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyL") { e.preventDefault(); toggleLock(); return; }
      if (isLocked) return;
      if (e.code === "Space") { e.preventDefault(); togglePlayVideo(); }
      else if (e.code === "Escape") { e.preventDefault(); showSpeedMenu ? setShowSpeedMenu(false) : handleCloseVideo(); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); handleSkipBack(); }
      else if (e.code === "ArrowRight") { e.preventDefault(); handleSkipForward(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playingVideo, isPlayingVideo, videoDuration, showSpeedMenu, isLocked]);

  const handleMouseMove = () => {
    if (isLocked) { showUnlockHintBriefly(); return; }
    setShowControls(true);
    if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlayingVideo) { setShowControls(false); setShowSpeedMenu(false); }
    }, 2500);
  };

  useEffect(() => {
    if (playingVideo && isPlayingVideo) handleMouseMove();
    return () => { if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current); };
  }, [playingVideo, isPlayingVideo]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
      videoRef.current.playbackRate = playbackSpeed;
    }
  };

  const togglePlayVideo = () => {
    if (videoRef.current) {
      if (isPlayingVideo) { videoRef.current.pause(); setIsPlayingVideo(false); }
      else { videoRef.current.play().catch(console.error); setIsPlayingVideo(true); }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) setVideoCurrentTime(videoRef.current.currentTime);
  };

  const handleVideoEnded = () => {
    if (currentVideoIndex < videos.length - 1) {
      handlePlayVideo(videos[currentVideoIndex + 1]);
    } else {
      setIsPlayingVideo(false);
      setShowControls(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = val;
    setVideoCurrentTime(val);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVideoVolume(val);
    if (videoRef.current) videoRef.current.volume = val;
    if (val > 0) setIsVideoMuted(false);
  };

  const toggleMuteVideo = () => {
    if (videoRef.current) {
      const next = !isVideoMuted;
      setIsVideoMuted(next);
      videoRef.current.muted = next;
    }
  };

  const handleFullscreen = () => {
    if (playerContainerRef.current) {
      document.fullscreenElement
        ? document.exitFullscreen().catch(console.error)
        : playerContainerRef.current.requestFullscreen().catch(console.error);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex-grow flex flex-col min-h-0 text-zinc-100 font-sans p-6 select-none relative">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold font-outfit uppercase tracking-wider text-violet-400">
            MY VIDEOS
          </h2>
          <p className="text-xs text-zinc-400">
            {filteredVideos.length} {filteredVideos.length === 1 ? "video" : "videos"} stored offline
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Multi-select toggle */}
          <button
            onClick={() => { setIsSelectMode(!isSelectMode); setSelectedIds(new Set()); setShowBulkPlaylistDropdown(false); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${
              isSelectMode
                ? "bg-violet-950/45 text-violet-400 border-violet-500/30 shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                : "bg-zinc-900/40 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-white"
            }`}
          >
            {isSelectMode ? <X size={15} /> : <CheckSquare size={15} />}
            {isSelectMode ? "Cancel" : "Select"}
          </button>

          {/* Search */}
          <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search videos..."
              className="w-full pl-9 pr-4 py-2 bg-zinc-900/60 rounded-lg border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all placeholder-zinc-500"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          </div>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {isSelectMode && (
        <div className="mb-4 p-3 bg-zinc-900/90 backdrop-blur-md border border-violet-500/20 rounded-xl flex items-center justify-between shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-800 text-xs font-semibold rounded-md border border-zinc-700 transition-colors cursor-pointer"
            >
              {selectedIds.size === filteredVideos.length ? "Deselect All" : "Select All"}
            </button>
            <span className="text-xs text-violet-400 font-medium">
              {selectedIds.size} of {filteredVideos.length} selected
            </span>
            {selectedIds.size > 0 && (
              <span className="text-xs text-zinc-400 font-mono bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700">
                {formatBytes(selectedTotalSize)}
              </span>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              {/* Add to Playlist */}
              <div ref={bulkPlaylistRef} className="relative">
                <button
                  onClick={() => setShowBulkPlaylistDropdown(!showBulkPlaylistDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-xs font-semibold rounded-md text-white shadow-md transition-colors cursor-pointer"
                >
                  <FolderPlus size={13} />
                  Add to Playlist
                </button>

                {showBulkPlaylistDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl z-50 p-1 flex flex-col gap-0.5">
                    <div className="px-2 py-1 text-[9px] text-zinc-500 font-semibold select-none border-b border-zinc-900">
                      CHOOSE PLAYLIST
                    </div>
                    {playlists.length === 0 ? (
                      <div className="px-2 py-2 text-[10px] text-zinc-600 select-none">No playlists created</div>
                    ) : (
                      <div className="max-h-36 overflow-y-auto space-y-0.5 mt-0.5">
                        {playlists.map((playlist) => (
                          <button
                            key={playlist.id}
                            onClick={() => handleBulkAddToPlaylist(playlist.id)}
                            className="w-full text-left px-2 py-1.5 text-zinc-300 hover:bg-zinc-900 hover:text-white rounded flex items-center justify-between transition-colors text-xs cursor-pointer"
                          >
                            <span className="truncate">{playlist.name}</span>
                            <Plus size={11} className="text-zinc-500 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bulk Delete */}
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/20 hover:bg-red-900 text-red-400 hover:text-white border border-red-900/30 text-xs font-semibold rounded-md transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      {/* Videos Grid */}
      {filteredVideos.length === 0 ? (
        <div className="flex-grow flex flex-col items-center justify-center py-20 border border-dashed border-zinc-800/80 rounded-xl bg-zinc-900/5">
          <Video size={48} className="text-zinc-700 mb-4" />
          <span className="text-sm font-semibold text-zinc-500">No videos found</span>
          <span className="text-xs text-zinc-600 mt-1">
            {searchQuery ? "Try checking your search terms" : "Download some videos in the Download Hub first!"}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 overflow-y-auto pr-1">
          {filteredVideos.map((video) => {
            const coverSrc = video.cover_path ? convertFileSrc(video.cover_path) : "";
            const isSelected = selectedIds.has(video.id);

            return (
              <div
                key={video.id}
                onClick={() => isSelectMode && toggleSelectVideo(video.id)}
                className={`border rounded-xl p-3.5 transition-all flex flex-col group relative ${
                  isSelectMode ? "cursor-pointer" : ""
                } ${
                  isSelected
                    ? "border-violet-500 bg-violet-950/10 shadow-[0_0_15px_rgba(139,92,246,0.1)]"
                    : "bg-zinc-900/20 hover:bg-zinc-900/40 border-zinc-900 hover:border-zinc-800"
                }`}
              >
                {/* Thumbnail */}
                <div
                  onClick={() => !isSelectMode && handlePlayVideo(video)}
                  className="relative aspect-video w-full rounded-lg bg-zinc-800 overflow-hidden mb-3.5 shadow-lg cursor-pointer"
                >
                  {coverSrc ? (
                    <img
                      src={coverSrc}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-700 to-indigo-900 flex items-center justify-center">
                      <Video size={28} className="text-violet-200" />
                    </div>
                  )}

                  {/* Select checkbox overlay */}
                  {isSelectMode && (
                    <div className="absolute top-2 left-2 z-20">
                      {isSelected ? (
                        <div className="p-1 bg-violet-600 rounded text-white shadow-lg">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="p-1 bg-black/60 rounded border border-zinc-600">
                          <div className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Play overlay (hidden in select mode) */}
                  {!isSelectMode && (
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center z-10">
                      <div className="p-3.5 bg-violet-600 rounded-full text-white shadow-[0_0_12px_rgba(139,92,246,0.6)] hover:bg-violet-500 hover:scale-110 transition-all">
                        <Play size={20} fill="currentColor" className="translate-x-[1px]" />
                      </div>
                    </div>
                  )}

                  <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-semibold font-mono text-white z-10 border border-white/10">
                    {formatTime(video.duration)}
                  </span>
                </div>

                {/* Info row */}
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="flex-grow min-w-0">
                    <span
                      onClick={() => !isSelectMode && handlePlayVideo(video)}
                      className={`text-sm font-semibold truncate block ${
                        isSelectMode ? "" : "cursor-pointer group-hover:text-violet-400"
                      } ${isSelected ? "text-violet-300" : "text-zinc-100"} transition-colors`}
                      title={video.title}
                    >
                      {video.title}
                    </span>
                    <span className="text-xs truncate text-zinc-400 mt-1 block">
                      {video.artist !== "Unknown Artist" ? video.artist : "YouTube Video"}
                    </span>
                  </div>

                  {/* Single delete (hidden in select mode) */}
                  {!isSelectMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteVideo(video); }}
                      className="p-1.5 hover:bg-red-950/20 text-zinc-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                      title="Delete Video"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Video Player Modal ───────────────────────────────────────────── */}
      {playingVideo && (
        <div
          ref={playerContainerRef}
          onMouseMove={handleMouseMove}
          className="fixed inset-0 z-[1000] bg-black flex items-center justify-center select-none font-sans"
        >
          <video
            ref={videoRef}
            src={convertFileSrc(playingVideo.file_path)}
            className={`w-full h-full object-contain ${isLocked ? "cursor-default" : "cursor-pointer"}`}
            onClick={isLocked ? showUnlockHintBriefly : togglePlayVideo}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleVideoEnded}
            autoPlay
          />

          {/* Controls overlay */}
          <div
            className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 flex flex-col justify-between p-6 transition-opacity duration-300 pointer-events-none ${
              showControls ? "opacity-100" : "opacity-0"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between w-full pointer-events-auto">
              <div className="flex flex-col gap-1 max-w-[80%]">
                <span className="text-lg font-bold text-zinc-100 drop-shadow-md truncate">
                  {playingVideo.title}
                </span>
                <span className="text-xs text-zinc-400 font-medium drop-shadow-sm">
                  {currentVideoIndex + 1} / {videos.length} &nbsp;·&nbsp; Offline Playback
                </span>
              </div>
              <button
                onClick={handleCloseVideo}
                className="p-2.5 rounded-full bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:text-white transition-all shadow-lg hover:scale-105 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Bottom panel */}
            <div className="w-full flex flex-col gap-4 pointer-events-auto bg-zinc-950/85 backdrop-blur-md border border-zinc-800/60 p-4 rounded-xl shadow-2xl">
              {/* Progress */}
              <div className="flex items-center w-full gap-3 text-xs text-zinc-400 font-mono">
                <span>{formatTime(videoCurrentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={videoDuration || 100}
                  value={videoCurrentTime}
                  onChange={handleSeek}
                  style={{
                    background: `linear-gradient(to right, #8b5cf6 ${
                      videoDuration ? (videoCurrentTime / videoDuration) * 100 : 0
                    }%, #27272a ${
                      videoDuration ? (videoCurrentTime / videoDuration) * 100 : 0
                    }%)`,
                  }}
                  className="w-full accent-violet-500 h-1.5 rounded-lg cursor-pointer outline-none appearance-none focus:outline-none transition-all"
                />
                <span>{formatTime(videoDuration)}</span>
              </div>

              {/* Controls row */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1">
                  <button onClick={handlePrevVideo} disabled={!hasPrev} className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" title="Previous video">
                    <SkipBack size={16} />
                  </button>
                  <button onClick={handleSkipBack} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-all cursor-pointer" title="Rewind 10s (←)">
                    <Rewind size={15} />
                    <span className="text-[10px] font-bold">10</span>
                  </button>
                  <button onClick={togglePlayVideo} className="p-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white shadow-md transition-all hover:scale-105 cursor-pointer mx-1">
                    {isPlayingVideo ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="translate-x-[1px]" />}
                  </button>
                  <button onClick={handleSkipForward} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-all cursor-pointer" title="Forward 10s (→)">
                    <span className="text-[10px] font-bold">10</span>
                    <FastForward size={15} />
                  </button>
                  <button onClick={handleNextVideo} disabled={!hasNext} className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" title="Next video">
                    <SkipForward size={16} />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <button onClick={toggleMuteVideo} className="text-zinc-400 hover:text-zinc-100 transition-colors p-1 cursor-pointer">
                      {isVideoMuted || videoVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <input type="range" min={0} max={1} step={0.05} value={isVideoMuted ? 0 : videoVolume} onChange={handleVolumeChange} className="w-20 accent-violet-500 bg-zinc-800 h-1 rounded-lg cursor-pointer outline-none appearance-none hover:bg-zinc-700" />
                  </div>

                  {/* Speed */}
                  <div className="relative">
                    <button
                      onClick={() => setShowSpeedMenu((p) => !p)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer min-w-[42px] text-center border ${
                        showSpeedMenu ? "bg-violet-600 text-white border-violet-500" : "bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 border-zinc-700"
                      }`}
                      title="Playback speed"
                    >
                      {playbackSpeed}x
                    </button>
                    {showSpeedMenu && (
                      <div className="absolute bottom-full mb-2 right-0 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden z-50 min-w-[72px]">
                        {SPEEDS.map((s) => (
                          <button key={s} onClick={() => handleSpeedChange(s)}
                            className={`block w-full px-4 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                              playbackSpeed === s ? "bg-violet-600/30 text-violet-300 font-bold" : "text-zinc-300 hover:bg-zinc-800"
                            }`}
                          >
                            {s}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Lock */}
                  <button
                    onClick={toggleLock}
                    className={`p-2 rounded-lg transition-all cursor-pointer ${
                      isLocked ? "text-amber-400 bg-amber-400/10 hover:bg-amber-400/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50"
                    }`}
                    title={isLocked ? "Unlock controls (L)" : "Lock controls (L)"}
                  >
                    {isLocked ? <Lock size={16} /> : <LockOpen size={16} />}
                  </button>

                  {/* Fullscreen */}
                  <button onClick={handleFullscreen} className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50 rounded-lg transition-all cursor-pointer" title="Fullscreen">
                    <Maximize2 size={16} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 text-[10px] text-zinc-600">
                <span>← → skip 10s</span>
                <span>Space play/pause</span>
                <span>L lock</span>
                <span>Esc close</span>
              </div>
            </div>
          </div>

          {/* Unlock hint */}
          <div
            className={`absolute top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
              isLocked && showUnlockHint ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
          >
            <button
              onClick={toggleLock}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-900/95 border border-amber-500/60 shadow-2xl text-sm font-semibold text-zinc-100 hover:bg-zinc-800 hover:border-amber-400 transition-all cursor-pointer backdrop-blur-md"
            >
              <Lock size={14} className="text-amber-400" />
              <span>Unlock controls</span>
              <span className="text-zinc-500 text-xs font-normal">· Press L</span>
            </button>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-400 mb-3">
              <AlertCircle size={22} />
              <span className="font-bold text-base">{confirmDialog.title}</span>
            </div>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  await action();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors cursor-pointer"
              >
                {confirmDialog.confirmText ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
