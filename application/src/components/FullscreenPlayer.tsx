import { useEffect, useState, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  ChevronDown,
  X,
  Speaker,
} from "lucide-react";
import { usePlayerStore } from "../store";

export default function FullscreenPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isShuffle,
    isRepeat,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleShuffle,
    toggleRepeat,
    seekTo,
    setVolume,
    setFullscreenOpen,
    queue,
    currentIndex,
    audioSinkId,
    setAudioSinkId,
  } = usePlayerStore();

  // Sliding gesture state
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragCurrentX, setDragCurrentX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  // Device management state
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);

  const updateDevices = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devList = await navigator.mediaDevices.enumerateDevices();
        setDevices(devList.filter(device => device.kind === "audiooutput"));
      }
    } catch (err) {
      console.error("Error enumerating devices:", err);
    }
  };

  const requestPermissionAndFetch = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      updateDevices();
    } catch (err) {
      console.warn("Could not get media permission:", err);
      updateDevices();
    }
  };

  useEffect(() => {
    updateDevices();
    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener("devicechange", updateDevices);
      return () => {
        navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
      };
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowDeviceMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Animation direction tracking
  const [prevTrackId, setPrevTrackId] = useState<string | null>(currentTrack?.id || null);
  const [animationDirection, setAnimationDirection] = useState<'next' | 'prev' | null>(null);

  useEffect(() => {
    if (currentTrack) {
      if (prevTrackId && currentTrack.id !== prevTrackId) {
        const oldIdx = queue.findIndex(t => t.id === prevTrackId);
        const newIdx = queue.findIndex(t => t.id === currentTrack.id);
        
        if (newIdx > oldIdx || (oldIdx === queue.length - 1 && newIdx === 0)) {
          setAnimationDirection('next');
        } else {
          setAnimationDirection('prev');
        }
        
        const timer = setTimeout(() => {
          setAnimationDirection(null);
        }, 500);
        setPrevTrackId(currentTrack.id);
        return () => clearTimeout(timer);
      } else if (!prevTrackId) {
        setPrevTrackId(currentTrack.id);
      }
    }
  }, [currentTrack?.id, queue, prevTrackId]);

  // Get previous and next tracks for preview
  let prevTrackObj = null;
  let nextTrackObj = null;

  if (queue.length > 1 && currentIndex >= 0) {
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      if (isRepeat) prevIndex = queue.length - 1;
    }
    if (prevIndex >= 0 && prevIndex < queue.length) {
      prevTrackObj = queue[prevIndex];
    }

    let nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      if (isRepeat) nextIndex = 0;
    }
    if (nextIndex >= 0 && nextIndex < queue.length) {
      nextTrackObj = queue[nextIndex];
    }
  }

  const handleDragStart = (clientX: number) => {
    setDragStartX(clientX);
    setIsDragging(true);
  };

  const handleDragMove = (clientX: number) => {
    if (dragStartX === null) return;
    setDragCurrentX(clientX - dragStartX);
  };

  const handleDragEnd = () => {
    if (dragStartX === null) return;
    const threshold = 100; // Drag threshold to switch tracks (in pixels)
    if (dragCurrentX < -threshold) {
      nextTrack();
    } else if (dragCurrentX > threshold) {
      prevTrack();
    }
    setDragStartX(null);
    setDragCurrentX(0);
    setIsDragging(false);
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFullscreenOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setFullscreenOpen]);

  if (!currentTrack) return null;

  const coverSrc = currentTrack.cover_path ? convertFileSrc(currentTrack.cover_path) : "";

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekTo(parseFloat(e.target.value));
  };

  let animClass = "animate-fade-in";
  if (animationDirection === "next") {
    animClass = "animate-slide-in-right";
  } else if (animationDirection === "prev") {
    animClass = "animate-slide-in-left";
  }

  return (
    <div className="fixed top-10 bottom-0 left-0 right-0 z-40 bg-zinc-950 flex flex-col justify-between p-8 md:p-12 overflow-hidden select-none font-sans text-zinc-100 animate-in fade-in duration-300">
      {/* Blurred background cover art */}
      {coverSrc ? (
        <div 
          key={`bg-${currentTrack.id}`}
          className="absolute inset-0 -z-10 bg-cover bg-center filter blur-3xl opacity-20 scale-110 pointer-events-none transition-all duration-750 animate-fade-in"
          style={{ backgroundImage: `url(${coverSrc})` }}
        />
      ) : (
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-violet-950/20 to-zinc-950 -z-10 filter blur-3xl pointer-events-none" />
      )}
      
      {/* Dark overlay sheet */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-zinc-950/80 to-zinc-950 -z-10" />

      {/* Top Header Section */}
      <div className="flex items-center justify-between w-full z-10">
        <button 
          onClick={() => setFullscreenOpen(false)}
          className="p-2 rounded-full hover:bg-zinc-800/40 text-zinc-400 hover:text-zinc-100 transition-all hover:scale-105 active:scale-95"
          title="Minimize Player"
        >
          <ChevronDown size={28} />
        </button>
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Now Playing</span>
        <button 
          onClick={() => setFullscreenOpen(false)}
          className="p-2 rounded-full hover:bg-zinc-800/40 text-zinc-400 hover:text-zinc-100 transition-all hover:scale-105 active:scale-95"
          title="Close"
        >
          <X size={20} />
        </button>
      </div>

      {/* Center Section: Track Image in the Center with side previews */}
      <div 
        className="flex-grow flex items-center justify-center py-4 z-10 cursor-grab active:cursor-grabbing w-full overflow-hidden"
        onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
        onTouchEnd={handleDragEnd}
        onMouseDown={(e) => handleDragStart(e.clientX)}
        onMouseMove={(e) => {
          if (e.buttons === 1) handleDragMove(e.clientX);
        }}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        <div className="flex items-center justify-center gap-6 md:gap-12 w-full max-w-5xl px-8 relative">
          
          {/* Previous Track Cover Preview (left) - remains still during drag */}
          <div 
            style={{
              transform: 'scale(0.8)',
              transition: 'opacity 0.4s ease',
              opacity: prevTrackObj ? 0.35 : 0
            }}
            className="w-40 h-40 md:w-56 md:h-56 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden shadow-lg select-none pointer-events-none flex-shrink-0 relative"
          >
            {prevTrackObj && (
              prevTrackObj.cover_path ? (
                <>
                  <img 
                    src={convertFileSrc(prevTrackObj.cover_path)} 
                    alt="" 
                    className="absolute inset-0 w-full h-full object-cover filter blur-sm opacity-40 scale-105"
                  />
                  <img 
                    key={`prev-img-${prevTrackObj.id}`}
                    src={convertFileSrc(prevTrackObj.cover_path)} 
                    alt={prevTrackObj.title} 
                    className="relative w-full h-full object-contain z-10 animate-fade-in" 
                  />
                </>
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-violet-600 to-indigo-900 flex items-center justify-center text-violet-200 font-bold text-lg">
                  {prevTrackObj.title.slice(0, 2).toUpperCase()}
                </div>
              )
            )}
          </div>

          {/* Current Track Cover Art (center) - slides during drag & transition */}
          <div 
            key={`curr-card-${currentTrack.id}`}
            style={{
              transform: isDragging 
                ? `translateX(${dragCurrentX}px)` 
                : 'translateX(0px)',
              transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)'
            }}
            className={`relative w-64 h-64 md:w-80 md:h-80 lg:w-[380px] lg:h-[380px] rounded-3xl bg-zinc-900 border border-zinc-800 shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden pointer-events-none hover:scale-[1.02] flex-shrink-0 ${
              isPlaying ? "shadow-violet-600/25 border-violet-500/30" : ""
            } ${isDragging ? "" : animClass}`}
          >
            {coverSrc ? (
              <>
                <img 
                  src={coverSrc} 
                  alt="" 
                  className="absolute inset-0 w-full h-full object-cover filter blur-md opacity-45 scale-105"
                />
                <img 
                  src={coverSrc} 
                  alt={currentTrack.title} 
                  className="relative w-full h-full object-contain z-10" 
                />
              </>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-violet-600 to-indigo-900 flex items-center justify-center">
                <svg className="w-24 h-24 text-violet-400/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 0L21 12m-1.5-6L9 9M9 9v9m0 0a3 3 0 11-6 0 3 3 0 016 0zm10.5-3V9.75M19.5 15a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            )}
          </div>

          {/* Next Track Cover Preview (right) - remains still during drag */}
          <div 
            style={{
              transform: 'scale(0.8)',
              transition: 'opacity 0.4s ease',
              opacity: nextTrackObj ? 0.35 : 0
            }}
            className="w-40 h-40 md:w-56 md:h-56 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden shadow-lg select-none pointer-events-none flex-shrink-0 relative"
          >
            {nextTrackObj && (
              nextTrackObj.cover_path ? (
                <>
                  <img 
                    src={convertFileSrc(nextTrackObj.cover_path)} 
                    alt="" 
                    className="absolute inset-0 w-full h-full object-cover filter blur-sm opacity-40 scale-105"
                  />
                  <img 
                    key={`next-img-${nextTrackObj.id}`}
                    src={convertFileSrc(nextTrackObj.cover_path)} 
                    alt={nextTrackObj.title} 
                    className="relative w-full h-full object-contain z-10 animate-fade-in" 
                  />
                </>
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-violet-600 to-indigo-900 flex items-center justify-center text-violet-200 font-bold text-lg">
                  {nextTrackObj.title.slice(0, 2).toUpperCase()}
                </div>
              )
            )}
          </div>

        </div>
      </div>

      {/* Bottom Section: Title, Seeker, and Playback Controls (Spotify Style) */}
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-5 z-10 pb-6">
        
        {/* Track Details - Left aligned */}
        <div 
          key={`details-${currentTrack.id}`}
          className="flex justify-between items-end w-full px-2 animate-slide-fade-in"
        >
          <div className="flex flex-col min-w-0 text-left">
            <h2 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight text-zinc-100 truncate w-full">
              {currentTrack.title}
            </h2>
            <p className="text-zinc-400 hover:text-zinc-350 transition-colors text-xs md:text-sm lg:text-base mt-1 truncate w-full font-medium">
              {currentTrack.artist}
            </p>
          </div>
        </div>

        {/* Progress Seeker */}
        <div className="w-full px-2 flex flex-col gap-1.5 font-sans">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeekChange}
            style={{
              background: `linear-gradient(to right, #ffffff ${duration ? (currentTime / duration) * 100 : 0}%, #27272a ${duration ? (currentTime / duration) * 100 : 0}%)`
            }}
            className="w-full accent-white h-1 rounded-lg cursor-pointer outline-none appearance-none transition-all duration-200"
          />
          <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono tracking-wider">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Playback Controls & Volume Row */}
        <div className="flex items-center justify-between w-full px-2">
          {/* Shuffle button */}
          <button
            onClick={toggleShuffle}
            className={`p-2 rounded-full transition-all hover:scale-105 active:scale-95 ${
              isShuffle 
                ? "text-cyan-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.6)]" 
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            title="Shuffle"
          >
            <Shuffle size={18} />
          </button>
          
          {/* Previous, Play/Pause, Next */}
          <div className="flex items-center gap-4">
            <button
              onClick={prevTrack}
              className="p-2 rounded-full text-zinc-400 hover:text-zinc-100 transition-all hover:scale-105 active:scale-95"
              title="Previous"
            >
              <SkipBack size={20} fill="currentColor" className="stroke-none" />
            </button>

            <button
              onClick={togglePlay}
              className="p-4 rounded-full bg-white hover:bg-zinc-200 text-black hover:scale-105 active:scale-95 shadow-lg transition-all flex items-center justify-center"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause size={24} fill="currentColor" className="stroke-none text-black" />
              ) : (
                <Play size={24} fill="currentColor" className="stroke-none text-black translate-x-[1px]" />
              )}
            </button>

            <button
              onClick={nextTrack}
              className="p-2 rounded-full text-zinc-400 hover:text-zinc-100 transition-all hover:scale-105 active:scale-95"
              title="Next"
            >
              <SkipForward size={20} fill="currentColor" className="stroke-none" />
            </button>
          </div>

          <div className="flex items-center gap-4 relative" ref={menuRef}>
            {/* Repeat button */}
            <button
              onClick={toggleRepeat}
              className={`p-2 rounded-full transition-all hover:scale-105 active:scale-95 ${
                isRepeat 
                  ? "text-cyan-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.6)]" 
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Repeat"
            >
              <Repeat size={18} />
            </button>

            {/* Device Selection Button */}
            <div className="relative">
              <button
                onClick={() => setShowDeviceMenu(!showDeviceMenu)}
                className={`p-2 rounded-full transition-all hover:scale-105 active:scale-95 ${
                  showDeviceMenu || audioSinkId 
                    ? "text-violet-400 bg-violet-950/20 hover:bg-violet-900/30" 
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="Choose Output Device"
              >
                <Speaker size={18} />
              </button>
              
              {/* Popover Menu */}
              {showDeviceMenu && (
                <div className="absolute right-0 bottom-full mb-3 w-64 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 text-zinc-200">
                  <div className="px-2.5 py-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider select-none border-b border-zinc-800/60 pb-1">
                    Select Audio Output
                  </div>
                  <div className="max-h-48 overflow-y-auto py-1 flex flex-col gap-0.5">
                    <button
                      onClick={() => {
                        setAudioSinkId("");
                        setShowDeviceMenu(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                        audioSinkId === "" 
                          ? "bg-violet-600/20 text-violet-300 font-semibold" 
                          : "hover:bg-zinc-800/60"
                      }`}
                    >
                      <span>Default System Device</span>
                      {audioSinkId === "" && <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />}
                    </button>
                    {devices.map((device, idx) => (
                      <button
                        key={device.deviceId}
                        onClick={() => {
                          setAudioSinkId(device.deviceId);
                          setShowDeviceMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                          audioSinkId === device.deviceId 
                            ? "bg-violet-600/20 text-violet-300 font-semibold" 
                            : "hover:bg-zinc-800/60"
                        }`}
                      >
                        <span className="truncate pr-2">{device.label || `Audio Output ${idx + 1}`}</span>
                        {audioSinkId === device.deviceId && <div className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                  {devices.length > 0 && devices.some(d => !d.label) && (
                    <button
                      onClick={requestPermissionAndFetch}
                      className="mt-1 text-[9px] text-center text-violet-400 hover:text-violet-300 transition-colors py-1.5 border-t border-zinc-800/40"
                    >
                      Show device names
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Volume controls */}
            <div className="hidden sm:flex items-center gap-2 text-zinc-500 hover:text-zinc-400 transition-colors">
              <button
                onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
                className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
                title={volume === 0 ? "Unmute" : "Mute"}
              >
                {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-20 accent-white bg-zinc-800 h-1 rounded-lg cursor-pointer outline-none appearance-none hover:bg-zinc-700"
                title={`Volume: ${Math.round(volume * 100)}%`}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

