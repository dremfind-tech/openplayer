import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Play,
  Search,
  Folder,
  Plus,
  MoreVertical,
  Trash2,
  FolderPlus,
  Grid,
  List,
  AlignJustify,
  CheckSquare,
  X,
  Check,
  FolderMinus
} from "lucide-react";
import { usePlayerStore, Track } from "../store";

interface LibraryViewProps {
  onRefresh: () => void;
}

interface ConfirmConfig {
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export default function LibraryView({ onRefresh }: LibraryViewProps) {
  const { tracks, playlists, currentPlaylistId, playTrack, removeFromQueue } = usePlayerStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmConfig | null>(null);

  // View Mode: grid, detailed, compact
  const [viewMode, setViewMode] = useState<"grid" | "detailed" | "compact">(() => {
    return (localStorage.getItem("library_view_mode") as any) || "grid";
  });

  // Multi-select State
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [showBulkPlaylistDropdown, setShowBulkPlaylistDropdown] = useState(false);
  const bulkPlaylistRef = useRef<HTMLDivElement | null>(null);

  // Save view mode preference
  const handleViewModeChange = (mode: "grid" | "detailed" | "compact") => {
    setViewMode(mode);
    localStorage.setItem("library_view_mode", mode);
  };

  // Reset multi-select when switching playlists/library
  useEffect(() => {
    setSelectedTrackIds(new Set());
    setIsSelectMode(false);
    setShowBulkPlaylistDropdown(false);
  }, [currentPlaylistId]);

  // Close playlist dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
      if (bulkPlaylistRef.current && !bulkPlaylistRef.current.contains(event.target as Node)) {
        setShowBulkPlaylistDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on window scroll to prevent it from detaching
  useEffect(() => {
    function handleScroll() {
      setActiveMenuId(null);
    }
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);

  const handlePlay = (track: Track) => {
    playTrack(track, filteredTracks);
  };

  const handleAddToPlaylist = async (playlistId: string, trackId: string) => {
    try {
      await invoke("add_track_to_playlist", { playlistId, trackId });
      setActiveMenuId(null);
      onRefresh();
    } catch (err) {
      console.error("Failed to add track to playlist:", err);
    }
  };

  const handleDeleteTrack = (trackId: string) => {
    setConfirmDialog({
      title: "Delete Track",
      message: "Are you sure you want to delete this track? This will remove the file from your disk permanently.",
      confirmText: "Delete",
      isDanger: true,
      onConfirm: async () => {
        try {
          await invoke("delete_track", { trackId });
          removeFromQueue(trackId);
          setActiveMenuId(null);
          onRefresh();
        } catch (err) {
          console.error("Failed to delete track:", err);
        }
      }
    });
  };

  const handleRemoveFromPlaylist = async (trackId: string) => {
    if (!currentPlaylistId) return;
    try {
      await invoke("remove_track_from_playlist", { playlistId: currentPlaylistId, trackId });
      setActiveMenuId(null);
      onRefresh();
    } catch (err) {
      console.error("Failed to remove track from playlist:", err);
    }
  };

  const handleImportLocal = async () => {
    try {
      const imported = await invoke<Track[]>("import_tracks_dialog");
      if (imported && imported.length > 0) {
        onRefresh();
      }
    } catch (err) {
      console.error("Failed to import tracks:", err);
    }
  };

  const handleOpenMenu = (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    if (activeMenuId === trackId) {
      setActiveMenuId(null);
      setMenuPosition(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const menuWidth = 192; // w-48
    const menuHeight = 220; // approximate menu height

    // Align menu left-edge with trigger button's right-edge (dropping to the right)
    let left = rect.right + 4;
    
    // Check if the menu overflows the right border
    if (left + menuWidth > screenWidth - 16) {
      // If it overflows, drop to the left (align menu right-edge with trigger button's left-edge)
      left = rect.left - menuWidth - 4;
    }

    // Default top positioning aligned with trigger top
    let top = rect.top;
    
    // Check if the menu overflows the bottom border
    if (top + menuHeight > screenHeight - 16) {
      // Shift upward so it fits
      top = screenHeight - menuHeight - 16;
    }
    
    // Ensure top is never negative
    if (top < 16) {
      top = 16;
    }

    setMenuPosition({ x: left, y: top });
    setActiveMenuId(trackId);
  };

  // Multi-select actions
  const toggleSelectTrack = (trackId: string) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedTrackIds.size === filteredTracks.length) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(filteredTracks.map((t) => t.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedTrackIds.size === 0) return;
    setConfirmDialog({
      title: "Delete Selected Tracks",
      message: `Are you sure you want to delete ${selectedTrackIds.size} tracks? This will remove the files from your disk permanently.`,
      confirmText: "Delete All",
      isDanger: true,
      onConfirm: async () => {
        try {
          for (const id of selectedTrackIds) {
            await invoke("delete_track", { trackId: id });
            removeFromQueue(id);
          }
          setSelectedTrackIds(new Set());
          setIsSelectMode(false);
          onRefresh();
        } catch (err) {
          console.error("Failed to delete tracks:", err);
        }
      }
    });
  };

  const handleBulkRemoveFromPlaylist = () => {
    if (!currentPlaylistId || selectedTrackIds.size === 0) return;
    setConfirmDialog({
      title: "Remove from Playlist",
      message: `Are you sure you want to remove ${selectedTrackIds.size} tracks from this playlist?`,
      confirmText: "Remove All",
      isDanger: true,
      onConfirm: async () => {
        try {
          for (const id of selectedTrackIds) {
            await invoke("remove_track_from_playlist", { playlistId: currentPlaylistId, trackId: id });
          }
          setSelectedTrackIds(new Set());
          setIsSelectMode(false);
          onRefresh();
        } catch (err) {
          console.error("Failed to remove tracks from playlist:", err);
        }
      }
    });
  };

  const handleBulkAddToPlaylist = async (playlistId: string) => {
    if (selectedTrackIds.size === 0) return;
    try {
      for (const id of selectedTrackIds) {
        await invoke("add_track_to_playlist", { playlistId, trackId: id });
      }
      setSelectedTrackIds(new Set());
      setIsSelectMode(false);
      setShowBulkPlaylistDropdown(false);
      onRefresh();
    } catch (err) {
      console.error("Failed to add tracks to playlist:", err);
    }
  };

  const activePlaylist = playlists.find((p) => p.id === currentPlaylistId);

  const filteredTracks = tracks
    .filter((track) => !track.is_video)
    .filter((track) => {
      const query = searchQuery.toLowerCase();
      return (
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query) ||
        track.album.toLowerCase().includes(query)
      );
    });

  const selectedTotalSize = filteredTracks
    .filter((t) => selectedTrackIds.has(t.id))
    .reduce((sum, t) => sum + (t.file_size_bytes ?? 0), 0);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp * 1000);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <div className="flex-grow flex flex-col min-h-0 text-zinc-100 font-sans p-6 select-none relative">
      {/* Title & Search Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold font-outfit uppercase tracking-wider text-violet-400">
            {activePlaylist ? activePlaylist.name : "MY MUSIC"}
          </h2>
          <p className="text-xs text-zinc-400">
            {filteredTracks.length} {filteredTracks.length === 1 ? "track" : "tracks"}{" "}
            {activePlaylist ? "in playlist" : "stored offline"}
          </p>
        </div>

        {/* Search & Actions Panel */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Multi-select Toggle Button */}
          <button
            onClick={() => {
              setIsSelectMode(!isSelectMode);
              setSelectedTrackIds(new Set());
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${
              isSelectMode
                ? "bg-violet-950/45 text-violet-400 border-violet-500/30 shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                : "bg-zinc-900/40 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-white"
            }`}
            title="Toggle selection mode"
          >
            {isSelectMode ? <X size={15} /> : <CheckSquare size={15} />}
            {isSelectMode ? "Cancel Select" : "Select Multiple"}
          </button>

          {/* View Switchers */}
          <div className="flex bg-zinc-900/60 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => handleViewModeChange("grid")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "grid" ? "bg-violet-600 text-white shadow-md" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Grid View"
            >
              <Grid size={15} />
            </button>
            <button
              onClick={() => handleViewModeChange("detailed")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "detailed" ? "bg-violet-600 text-white shadow-md" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Detailed List View"
            >
              <List size={15} />
            </button>
            <button
              onClick={() => handleViewModeChange("compact")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "compact" ? "bg-violet-600 text-white shadow-md" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Compact List View"
            >
              <AlignJustify size={15} />
            </button>
          </div>

          <button
            onClick={handleImportLocal}
            className="flex items-center gap-2 px-4 py-2 bg-violet-650 hover:bg-violet-600 text-white rounded-lg text-sm font-semibold shadow-[0_0_12px_rgba(139,92,246,0.15)] transition-all hover:scale-[1.02]"
            title="Import songs from your device"
          >
            <FolderPlus size={16} />
            Import Local
          </button>
          
          <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tracks, artists..."
              className="w-full pl-9 pr-4 py-2 bg-zinc-900/60 rounded-lg border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all placeholder-zinc-500"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          </div>
        </div>
      </div>

      {/* Bulk Action Sticky Toolbar (only visible in select mode when items are selected) */}
      {isSelectMode && (
        <div className="mb-4 p-3 bg-zinc-900/90 backdrop-blur-md border border-violet-500/20 rounded-xl flex items-center justify-between shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-800 text-xs font-semibold rounded-md border border-zinc-700 transition-colors"
            >
              {selectedTrackIds.size === filteredTracks.length ? "Deselect All" : "Select All"}
            </button>
            <span className="text-xs text-violet-400 font-medium">
              {selectedTrackIds.size} of {filteredTracks.length} selected
            </span>
            {selectedTrackIds.size > 0 && (
              <span className="text-xs text-zinc-400 font-mono bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700">
                {formatBytes(selectedTotalSize)}
              </span>
            )}
          </div>

          {selectedTrackIds.size > 0 && (
            <div className="flex items-center gap-2 relative">
              {/* Add to Playlist Dropdown Trigger */}
              <div ref={bulkPlaylistRef} className="relative">
                <button
                  onClick={() => setShowBulkPlaylistDropdown(!showBulkPlaylistDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-xs font-semibold rounded-md text-white shadow-md transition-colors"
                >
                  <FolderPlus size={13} />
                  Add to Playlist
                </button>

                {showBulkPlaylistDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-zinc-950 border border-zinc-850 rounded-lg shadow-2xl z-50 p-1 flex flex-col gap-0.5">
                    <div className="px-2 py-1 text-[9px] text-zinc-500 font-semibold select-none border-b border-zinc-900">
                      CHOOSE PLAYLIST
                    </div>
                    {playlists.length === 0 ? (
                      <div className="px-2 py-2 text-[10px] text-zinc-600 select-none">
                        No playlists created
                      </div>
                    ) : (
                      <div className="max-h-36 overflow-y-auto space-y-0.5 mt-0.5">
                        {playlists.map((playlist) => (
                          <button
                            key={playlist.id}
                            onClick={() => handleBulkAddToPlaylist(playlist.id)}
                            className="w-full text-left px-2 py-1.5 text-zinc-300 hover:bg-zinc-900 hover:text-white rounded flex items-center justify-between transition-colors truncate text-xs"
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

              {/* Remove from Playlist (only if viewing a playlist) */}
              {activePlaylist && (
                <button
                  onClick={handleBulkRemoveFromPlaylist}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-red-950/40 text-zinc-300 hover:text-red-400 border border-zinc-700 hover:border-red-900/30 text-xs font-semibold rounded-md transition-all"
                >
                  <FolderMinus size={13} />
                  Remove
                </button>
              )}

              {/* Delete Tracks */}
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/20 hover:bg-red-900 text-red-400 hover:text-white border border-red-900/30 text-xs font-semibold rounded-md transition-colors"
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      {/* Library Content */}
      {filteredTracks.length === 0 ? (
        <div className="flex-grow flex flex-col items-center justify-center py-20 border border-dashed border-zinc-800/80 rounded-xl bg-zinc-900/5">
          <Folder size={48} className="text-zinc-700 mb-4" />
          <span className="text-sm font-semibold text-zinc-500">No tracks found</span>
          <span className="text-xs text-zinc-600 mt-1">
            {searchQuery ? "Try checking your search terms" : "Download or import tracks first to fill your library!"}
          </span>
        </div>
      ) : (
        <div className="flex-grow overflow-y-auto pr-1">
          {/* GRID VIEW */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {filteredTracks.map((track) => {
                const coverSrc = track.cover_path ? convertFileSrc(track.cover_path) : "";
                const isSelected = selectedTrackIds.has(track.id);

                return (
                  <div
                    key={track.id}
                    onClick={() => isSelectMode && toggleSelectTrack(track.id)}
                    className={`bg-zinc-900/20 hover:bg-zinc-900/40 border rounded-lg p-3 transition-all flex flex-col group relative ${
                      isSelectMode ? "cursor-pointer" : ""
                    } ${isSelected ? "border-violet-500 bg-violet-950/10 shadow-[0_0_15px_rgba(139,92,246,0.1)]" : "border-zinc-900 hover:border-zinc-800"}`}
                  >
                    {/* Checkbox or Hover Select overlay */}
                    {isSelectMode && (
                      <div className="absolute top-5 left-5 z-20">
                        {isSelected ? (
                          <div className="p-1 bg-violet-600 rounded text-white shadow-lg">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="p-1 bg-black/60 rounded text-zinc-400 border border-zinc-750">
                            <div className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Artwork Container */}
                    <div className="relative aspect-square w-full rounded bg-zinc-800 overflow-hidden mb-3 shadow-md">
                      {coverSrc ? (
                        <>
                          <img
                            src={coverSrc}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover filter blur-xs opacity-50 scale-105"
                          />
                          <img
                            src={coverSrc}
                            alt={track.title}
                            className="relative w-full h-full object-contain z-10 group-hover:scale-105 transition-transform duration-300"
                          />
                        </>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-600 to-indigo-900 flex items-center justify-center text-violet-200 font-bold text-lg">
                          {track.title.slice(0, 2).toUpperCase()}
                        </div>
                      )}

                      {/* Play Hover Overlay (hidden in select mode) */}
                      {!isSelectMode && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center z-20">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlay(track);
                            }}
                            className="p-3 bg-violet-600 rounded-full text-white shadow-[0_0_12px_rgba(139,92,246,0.6)] hover:bg-violet-500 hover:scale-115 transition-all"
                          >
                            <Play size={20} fill="currentColor" className="translate-x-[1px]" />
                          </button>
                        </div>
                      )}

                      {/* Playlist Action Button */}
                      {!isSelectMode && (
                        <button
                          onClick={(e) => handleOpenMenu(e, track.id)}
                          className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-zinc-900 text-zinc-300 hover:text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-30"
                        >
                          <MoreVertical size={14} />
                        </button>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold truncate text-zinc-100 leading-snug" title={track.title}>
                        {track.title}
                      </span>
                      <span className="text-xs truncate text-zinc-400 mt-1" title={track.artist}>
                        {track.artist}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono mt-2 self-end">
                        {formatDuration(track.duration)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* DETAILED LIST VIEW */}
          {viewMode === "detailed" && (
            <div className="flex flex-col border border-zinc-900 rounded-lg bg-zinc-900/10 overflow-hidden">
              <div className="grid grid-cols-12 px-4 py-2 bg-zinc-900/40 text-[10px] font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-900">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-4">Title</div>
                <div className="col-span-3">Album</div>
                <div className="col-span-2">Date Added</div>
                <div className="col-span-1 text-center">Duration</div>
                <div className="col-span-1 text-right pr-2">Actions</div>
              </div>

              <div className="divide-y divide-zinc-900">
                {filteredTracks.map((track, idx) => {
                  const coverSrc = track.cover_path ? convertFileSrc(track.cover_path) : "";
                  const isSelected = selectedTrackIds.has(track.id);

                  return (
                    <div
                      key={track.id}
                      onClick={() => isSelectMode && toggleSelectTrack(track.id)}
                      onDoubleClick={() => !isSelectMode && handlePlay(track)}
                      className={`grid grid-cols-12 items-center px-4 py-3 text-sm transition-all group ${
                        isSelectMode ? "cursor-pointer" : ""
                      } ${isSelected ? "bg-violet-950/15 text-violet-300" : "text-zinc-300 hover:bg-zinc-900/30"}`}
                    >
                      {/* Checkbox or # Index */}
                      <div className="col-span-1 flex items-center justify-center">
                        {isSelectMode ? (
                          isSelected ? (
                            <div className="p-0.5 bg-violet-600 rounded text-white">
                              <Check size={11} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-3.5 h-3.5 rounded border border-zinc-700 bg-zinc-900/50" />
                          )
                        ) : (
                          <span className="text-zinc-600 group-hover:hidden text-xs font-mono">
                            {idx + 1}
                          </span>
                        )}
                        {!isSelectMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlay(track);
                            }}
                            className="hidden group-hover:flex text-violet-400 hover:text-violet-300 transition-colors"
                          >
                            <Play size={14} fill="currentColor" />
                          </button>
                        )}
                      </div>

                      {/* Title & Artist */}
                      <div className="col-span-4 flex items-center gap-3 min-w-0">
                        {coverSrc ? (
                          <div className="relative w-10 h-10 rounded shadow overflow-hidden flex-shrink-0">
                            <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full object-cover filter blur-xs opacity-50 scale-105" />
                            <img src={coverSrc} alt={track.title} className="relative w-full h-full object-contain z-10" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-900 flex items-center justify-center text-violet-200 font-bold text-xs rounded shadow">
                            {track.title.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-zinc-100 truncate pr-2" title={track.title}>
                            {track.title}
                          </span>
                          <span className="text-xs text-zinc-400 truncate mt-0.5" title={track.artist}>
                            {track.artist}
                          </span>
                        </div>
                      </div>

                      {/* Album */}
                      <div className="col-span-3 text-zinc-400 truncate pr-2" title={track.album}>
                        {track.album}
                      </div>

                      {/* Date Added */}
                      <div className="col-span-2 text-zinc-500 text-xs">
                        {formatDate(track.date_added)}
                      </div>

                      {/* Duration */}
                      <div className="col-span-1 text-center font-mono text-xs text-zinc-400">
                        {formatDuration(track.duration)}
                      </div>

                      {/* Actions Button */}
                      <div className="col-span-1 text-right relative pr-2">
                        {!isSelectMode && (
                          <button
                            onClick={(e) => handleOpenMenu(e, track.id)}
                            className="p-1 hover:bg-zinc-800/60 text-zinc-500 hover:text-zinc-200 rounded transition-colors inline-block"
                          >
                            <MoreVertical size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* COMPACT VIEW */}
          {viewMode === "compact" && (
            <div className="flex flex-col border border-zinc-900 rounded-lg bg-zinc-900/10 overflow-hidden">
              <div className="divide-y divide-zinc-900">
                {filteredTracks.map((track, idx) => {
                  const coverSrc = track.cover_path ? convertFileSrc(track.cover_path) : "";
                  const isSelected = selectedTrackIds.has(track.id);

                  return (
                    <div
                      key={track.id}
                      onClick={() => isSelectMode && toggleSelectTrack(track.id)}
                      onDoubleClick={() => !isSelectMode && handlePlay(track)}
                      className={`flex items-center justify-between px-4 py-2.5 text-sm transition-all group ${
                        isSelectMode ? "cursor-pointer" : ""
                      } ${isSelected ? "bg-violet-950/15 text-violet-300" : "text-zinc-300 hover:bg-zinc-900/30"}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Checkbox or Play Icon */}
                        <div className="flex items-center justify-center w-5 h-5">
                          {isSelectMode ? (
                            isSelected ? (
                              <div className="p-0.5 bg-violet-600 rounded text-white">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            ) : (
                              <div className="w-3.5 h-3.5 rounded border border-zinc-700 bg-zinc-900/50" />
                            )
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlay(track);
                              }}
                              className="hidden group-hover:flex text-violet-400 hover:text-violet-300 transition-colors"
                            >
                              <Play size={13} fill="currentColor" />
                            </button>
                          )}
                          {!isSelectMode && (
                            <span className="text-xs font-mono text-zinc-600 group-hover:hidden">
                              {idx + 1}
                            </span>
                          )}
                        </div>

                        {/* Thumbnail (medium-compact) */}
                        {coverSrc ? (
                          <div className="relative w-8 h-8 rounded shadow-sm overflow-hidden flex-shrink-0">
                            <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full object-cover filter blur-xs opacity-50 scale-105" />
                            <img src={coverSrc} alt={track.title} className="relative w-full h-full object-contain z-10" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-indigo-900 flex items-center justify-center text-violet-200 font-bold text-xs rounded shadow-sm">
                            {track.title.slice(0, 2).toUpperCase()}
                          </div>
                        )}

                        {/* Title & Artist inline */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-semibold text-zinc-200 truncate max-w-[250px] sm:max-w-[350px]" title={track.title}>
                            {track.title}
                          </span>
                          <span className="text-xs text-zinc-500">•</span>
                          <span className="text-xs text-zinc-400 truncate max-w-[180px] sm:max-w-[280px]" title={track.artist}>
                            {track.artist}
                          </span>
                        </div>
                      </div>

                      {/* Right side Info: Duration & Actions */}
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-zinc-500">
                          {formatDuration(track.duration)}
                        </span>

                        {!isSelectMode && (
                          <button
                            onClick={(e) => handleOpenMenu(e, track.id)}
                            className="p-1 hover:bg-zinc-800/60 text-zinc-500 hover:text-zinc-200 rounded transition-colors"
                          >
                            <MoreVertical size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Global Viewport Context Menu */}
      {activeMenuId && menuPosition && (() => {
        const track = tracks.find((t) => t.id === activeMenuId);
        if (!track) return null;
        return (
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: `${menuPosition.y}px`,
              left: `${menuPosition.x}px`,
            }}
            className="w-56 bg-zinc-900/95 backdrop-blur-lg border border-zinc-800/40 rounded-xl shadow-2xl z-[999] p-1.5 font-sans flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-2.5 py-1 text-[10px] text-zinc-400 font-bold uppercase tracking-wider select-none border-b border-zinc-800/30 pb-1.5 mb-0.5">
              Actions
            </div>
            
            {activePlaylist && (
              <button
                onClick={() => handleRemoveFromPlaylist(track.id)}
                className="w-full text-left px-2.5 py-2 text-zinc-300 hover:bg-zinc-800/60 hover:text-white rounded-lg flex items-center gap-2.5 transition-all text-xs font-semibold cursor-pointer"
              >
                <FolderMinus size={13} className="text-zinc-400 flex-shrink-0" />
                <span>Remove from Playlist</span>
              </button>
            )}

            <button
              onClick={() => handleDeleteTrack(track.id)}
              className="w-full text-left px-2.5 py-2 text-red-400 hover:bg-red-950/20 hover:text-red-350 rounded-lg flex items-center gap-2.5 transition-all text-xs font-semibold cursor-pointer"
            >
              <Trash2 size={13} className="text-red-400/80 flex-shrink-0" />
              <span>Delete Track</span>
            </button>

            <div className="px-2.5 py-1 text-[10px] text-zinc-400 font-bold uppercase tracking-wider select-none border-t border-b border-zinc-800/30 pt-2 pb-1.5 mt-0.5 mb-0.5">
              Add to Playlist
            </div>
            {playlists.length === 0 ? (
              <div className="px-2.5 py-2 text-[10px] text-zinc-500 italic select-none">
                No playlists created
              </div>
            ) : (
              <div className="max-h-36 overflow-y-auto mt-0.5 space-y-0.5 pr-0.5">
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => handleAddToPlaylist(playlist.id, track.id)}
                    className="w-full text-left px-2.5 py-1.5 text-zinc-300 hover:bg-violet-600/10 hover:text-violet-400 rounded-lg flex items-center justify-between transition-all text-xs font-semibold cursor-pointer group"
                  >
                    <span className="truncate">{playlist.name}</span>
                    <Plus size={12} className="text-zinc-500 flex-shrink-0 group-hover:text-violet-400 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {confirmDialog && (
        <div 
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setConfirmDialog(null)}
        >
          <div 
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1.5">
              <h3 className="text-base font-bold font-outfit uppercase tracking-wider text-violet-400">
                {confirmDialog.title}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {confirmDialog.message}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-1">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                {confirmDialog.cancelText || "Cancel"}
              </button>
              <button
                onClick={async () => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  await action();
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 cursor-pointer shadow-md ${
                  confirmDialog.isDanger
                    ? "bg-red-650 hover:bg-red-600 shadow-red-900/10"
                    : "bg-violet-650 hover:bg-violet-600 shadow-violet-900/10"
                }`}
              >
                {confirmDialog.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

