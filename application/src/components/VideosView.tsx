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
  AlertCircle
} from "lucide-react";
import { usePlayerStore, Track } from "../store";

interface VideosViewProps {
  onRefresh: () => void;
}

export default function VideosView({ onRefresh }: VideosViewProps) {
  const { tracks, setPlaying, removeFromQueue } = usePlayerStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [playingVideo, setPlayingVideo] = useState<Track | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Track | null>(null);

  // Video playback state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(0.8);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  
  const controlsTimeoutRef = useRef<number | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  // Exclude non-video tracks
  const videos = tracks.filter((t) => t.is_video);

  const filteredVideos = videos.filter((video) => {
    const query = searchQuery.toLowerCase();
    return (
      video.title.toLowerCase().includes(query) ||
      video.artist.toLowerCase().includes(query)
    );
  });

  const handlePlayVideo = (track: Track) => {
    setPlaying(false); // Pause main music player
    setPlayingVideo(track);
    setIsPlayingVideo(true);
    setVideoCurrentTime(0);
    setVideoDuration(0);
  };

  const handleCloseVideo = () => {
    setPlayingVideo(null);
    setIsPlayingVideo(false);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
  };

  // Keyboard shortcut listener for custom video player
  useEffect(() => {
    if (!playingVideo) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        togglePlayVideo();
      } else if (e.code === "Escape") {
        e.preventDefault();
        handleCloseVideo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [playingVideo, isPlayingVideo]);

  // Handle controls fadeout
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlayingVideo) {
        setShowControls(false);
      }
    }, 2500);
  };

  useEffect(() => {
    if (playingVideo && isPlayingVideo) {
      handleMouseMove();
    }
    return () => {
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [playingVideo, isPlayingVideo]);

  const togglePlayVideo = () => {
    if (videoRef.current) {
      if (isPlayingVideo) {
        videoRef.current.pause();
        setIsPlayingVideo(false);
      } else {
        videoRef.current.play().catch(console.error);
        setIsPlayingVideo(true);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setVideoCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  const handleVideoEnded = () => {
    setIsPlayingVideo(false);
    setShowControls(true);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
    setVideoCurrentTime(val);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVideoVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
    }
    if (val > 0) {
      setIsVideoMuted(false);
    }
  };

  const toggleMuteVideo = () => {
    if (videoRef.current) {
      const targetMute = !isVideoMuted;
      setIsVideoMuted(targetMute);
      videoRef.current.muted = targetMute;
    }
  };

  const handleFullscreen = () => {
    if (playerContainerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(console.error);
      } else {
        playerContainerRef.current.requestFullscreen().catch(console.error);
      }
    }
  };

  const executeDeleteVideo = async () => {
    if (!deleteTarget) return;
    try {
      await invoke("delete_track", { trackId: deleteTarget.id });
      removeFromQueue(deleteTarget.id);
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      console.error("Failed to delete video:", err);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex-grow flex flex-col min-h-0 text-zinc-100 font-sans p-6 select-none relative">
      
      {/* Title / Search Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold font-outfit uppercase tracking-wider text-violet-400">
            MY VIDEOS
          </h2>
          <p className="text-xs text-zinc-400">
            {filteredVideos.length} {filteredVideos.length === 1 ? "video" : "videos"} stored offline
          </p>
        </div>

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

      {/* Videos List Grid */}
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
            return (
              <div
                key={video.id}
                className="bg-zinc-900/20 hover:bg-zinc-900/40 border border-zinc-900 hover:border-zinc-800 rounded-xl p-3.5 transition-all flex flex-col group relative"
              >
                {/* 16:9 Aspect ratio video poster */}
                <div 
                  onClick={() => handlePlayVideo(video)}
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

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center z-10">
                    <div className="p-3.5 bg-violet-600 rounded-full text-white shadow-[0_0_12px_rgba(139,92,246,0.6)] hover:bg-violet-500 hover:scale-110 transition-all">
                      <Play size={20} fill="currentColor" className="translate-x-[1px]" />
                    </div>
                  </div>

                  {/* Duration Badge */}
                  <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-semibold font-mono text-zinc-300 z-10 border border-zinc-800">
                    {formatTime(video.duration)}
                  </span>
                </div>

                {/* Info & Delete Button */}
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="flex-grow min-w-0">
                    <span 
                      onClick={() => handlePlayVideo(video)}
                      className="text-sm font-semibold truncate text-zinc-100 group-hover:text-violet-400 transition-colors block cursor-pointer"
                      title={video.title}
                    >
                      {video.title}
                    </span>
                    <span className="text-xs truncate text-zinc-400 mt-1 block">
                      {video.artist !== "Unknown Artist" ? video.artist : "YouTube Video"}
                    </span>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(video)}
                    className="p-1.5 hover:bg-red-950/20 text-zinc-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                    title="Delete Video"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Player Fullscreen Overlay Modal */}
      {playingVideo && (
        <div 
          ref={playerContainerRef}
          onMouseMove={handleMouseMove}
          className="fixed inset-0 z-[1000] bg-black flex items-center justify-center select-none font-sans"
        >
          {/* Main Video Element */}
          <video
            ref={videoRef}
            src={convertFileSrc(playingVideo.file_path)}
            className="w-full h-full object-contain cursor-pointer"
            onClick={togglePlayVideo}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleVideoEnded}
            autoPlay
          />

          {/* Video Control Bar & Header Overlay */}
          <div 
            className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 flex flex-col justify-between p-6 transition-opacity duration-300 pointer-events-none ${
              showControls ? "opacity-100" : "opacity-0"
            }`}
          >
            {/* Header: Title and Close */}
            <div className="flex items-center justify-between w-full pointer-events-auto">
              <div className="flex flex-col gap-1 max-w-[80%]">
                <span className="text-lg font-bold text-zinc-100 drop-shadow-md truncate">{playingVideo.title}</span>
                <span className="text-xs text-zinc-400 font-medium drop-shadow-sm">Offline Playback</span>
              </div>
              <button
                onClick={handleCloseVideo}
                className="p-2.5 rounded-full bg-zinc-900/60 hover:bg-red-650 border border-zinc-800 text-zinc-300 hover:text-white transition-all shadow-lg hover:scale-105 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Bottom Panel: Seeker & Controls */}
            <div className="w-full flex flex-col gap-4 pointer-events-auto bg-zinc-950/85 backdrop-blur-md border border-zinc-800/60 p-4 rounded-xl shadow-2xl">
              {/* Progress Slider */}
              <div className="flex items-center w-full gap-3 text-xs text-zinc-400 font-mono">
                <span>{formatTime(videoCurrentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={videoDuration || 100}
                  value={videoCurrentTime}
                  onChange={handleSeek}
                  style={{
                    background: `linear-gradient(to right, #8b5cf6 ${videoDuration ? (videoCurrentTime / videoDuration) * 100 : 0}%, #27272a ${videoDuration ? (videoCurrentTime / videoDuration) * 100 : 0}%)`
                  }}
                  className="w-full accent-violet-500 h-1.5 rounded-lg cursor-pointer outline-none appearance-none focus:outline-none transition-all"
                />
                <span>{formatTime(videoDuration)}</span>
              </div>

              {/* Action Buttons row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  {/* Play/Pause Button */}
                  <button
                    onClick={togglePlayVideo}
                    className="p-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white shadow-md transition-all hover:scale-105 cursor-pointer"
                  >
                    {isPlayingVideo ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="translate-x-[1px]" />}
                  </button>

                  {/* Volume Controls */}
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={toggleMuteVideo}
                      className="text-zinc-400 hover:text-zinc-100 transition-colors p-1"
                    >
                      {isVideoMuted || videoVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isVideoMuted ? 0 : videoVolume}
                      onChange={handleVolumeChange}
                      className="w-20 accent-violet-500 bg-zinc-800 h-1 rounded-lg cursor-pointer outline-none appearance-none hover:bg-zinc-700"
                    />
                  </div>
                </div>

                {/* Right options: Fullscreen */}
                <button
                  onClick={handleFullscreen}
                  className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50 rounded-lg transition-all cursor-pointer"
                  title="Fullscreen"
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-400 mb-3">
              <AlertCircle size={22} />
              <span className="font-bold text-base">Delete Video?</span>
            </div>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-zinc-200">"{deleteTarget.title}"</span>? This will permanently remove the video file from your disk.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeDeleteVideo}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors cursor-pointer"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
