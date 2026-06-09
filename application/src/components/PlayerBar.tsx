import { useEffect, useRef, useState } from "react";
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
  ListMusic,
  Speaker,
} from "lucide-react";
import { usePlayerStore } from "../store";

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    volume,
    isShuffle,
    isRepeat,
    togglePlay,
    setPlaying,
    setCurrentTime,
    setVolume,
    nextTrack,
    prevTrack,
    toggleShuffle,
    toggleRepeat,
    setFullscreenOpen,
    duration,
    setDuration,
    lastSeek,
    audioSinkId,
    setAudioSinkId,
  } = usePlayerStore();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(volume);
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

  const audioSrc = currentTrack ? convertFileSrc(currentTrack.file_path) : "";
  const coverSrc = currentTrack?.cover_path ? convertFileSrc(currentTrack.cover_path) : "";

  // Synchronize audio output device (Sink ID)
  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current as any;
      if (typeof audio.setSinkId === "function") {
        audio.setSinkId(audioSinkId).catch((err: any) => {
          console.error("Failed to set audio output device:", err);
        });
      } else {
        console.warn("setSinkId is not supported on this browser/webview.");
      }
    }
  }, [audioSinkId, audioSrc]);

  // Synchronize external seeks
  useEffect(() => {
    if (lastSeek && audioRef.current) {
      audioRef.current.currentTime = lastSeek.time;
    }
  }, [lastSeek]);

  // Synchronize audio playing state
  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying && audioSrc) {
      audioRef.current.play().catch((err) => {
        console.error("Playback error:", err);
        setPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, audioSrc]);

  // Synchronize volume
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
  };

  const handleAudioEnded = () => {
    nextTrack();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      setVolume(prevVolume);
    } else {
      setPrevVolume(volume);
      setIsMuted(true);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center justify-between px-6 pt-4 pb-6 h-24 bg-zinc-950/80 backdrop-blur-md border-t border-zinc-900 select-none text-zinc-100 font-sans">
      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
      />

      {/* Left section: Track Info */}
      <div className="flex items-center w-1/4 min-w-[200px] gap-3">
        {currentTrack ? (
          <div 
            onClick={() => setFullscreenOpen(true)}
            className="flex items-center gap-3 cursor-pointer group/info transition-opacity hover:opacity-80 min-w-0"
          >
            <div className="relative w-12 h-12 rounded bg-zinc-800 overflow-hidden border border-violet-500/20 group-hover/info:border-violet-500/50 transition-all flex-shrink-0">
              {coverSrc ? (
                <>
                  <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full object-cover filter blur-xs opacity-50 scale-105" />
                  <img src={coverSrc} alt={currentTrack.title} className="relative w-full h-full object-contain z-10" />
                </>
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-violet-600 to-indigo-900" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate text-zinc-100 group-hover/info:text-violet-400 transition-colors">{currentTrack.title}</span>
              <span className="text-xs truncate text-zinc-400">{currentTrack.artist}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
              <ListMusic size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">No Track Loaded</span>
              <span className="text-[10px] text-zinc-600">Select a song from library</span>
            </div>
          </div>
        )}
      </div>

      {/* Middle section: Controls & Seeker */}
      <div className="flex flex-col items-center w-2/5 max-w-[600px] gap-2">
        {/* Buttons */}
        <div className="flex items-center gap-5">
          <button
            onClick={toggleShuffle}
            className={`p-1 rounded transition-colors ${
              isShuffle ? "text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" : "text-zinc-500 hover:text-zinc-300"
            }`}
            title="Shuffle"
          >
            <Shuffle size={16} />
          </button>
          
          <button
            onClick={prevTrack}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Previous"
          >
            <SkipBack size={18} />
          </button>

          <button
            onClick={togglePlay}
            disabled={!currentTrack}
            className={`p-3 rounded-full transition-all flex items-center justify-center ${
              currentTrack
                ? "bg-violet-600 hover:bg-violet-500 text-white hover:scale-105 shadow-[0_0_12px_rgba(139,92,246,0.3)] hover:shadow-[0_0_16px_rgba(139,92,246,0.5)]"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            }`}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-[1px]" />}
          </button>

          <button
            onClick={nextTrack}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Next"
          >
            <SkipForward size={18} />
          </button>

          <button
            onClick={toggleRepeat}
            className={`p-1 rounded transition-colors ${
              isRepeat ? "text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" : "text-zinc-500 hover:text-zinc-300"
            }`}
            title="Repeat"
          >
            <Repeat size={16} />
          </button>
        </div>

        {/* Seeker Slider */}
        <div className="flex items-center w-full gap-3 text-xs text-zinc-500 font-mono">
          <span className="w-10 text-right">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            disabled={!currentTrack}
            style={{
              background: `linear-gradient(to right, #8b5cf6 ${duration ? (currentTime / duration) * 100 : 0}%, #27272a ${duration ? (currentTime / duration) * 100 : 0}%)`
            }}
            className="w-full accent-violet-500 h-1 rounded-lg cursor-pointer outline-none appearance-none focus:outline-none transition-all"
          />
          <span className="w-10 text-left">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right section: Volume & Options */}
      <div className="flex items-center justify-end w-1/4 min-w-[200px] gap-3 relative" ref={menuRef}>
        {/* Device Selection Button */}
        <div className="relative">
          <button
            onClick={() => setShowDeviceMenu(!showDeviceMenu)}
            className={`p-1.5 rounded-md transition-colors ${
              showDeviceMenu || audioSinkId 
                ? "text-violet-400 bg-violet-950/20 hover:bg-violet-900/30" 
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/40"
            }`}
            title="Choose Output Device"
          >
            <Speaker size={16} />
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

        <button
          onClick={toggleMute}
          className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="w-24 accent-violet-500 bg-zinc-800 h-1 rounded-lg cursor-pointer outline-none appearance-none hover:bg-zinc-700"
          title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
        />
      </div>
    </div>
  );
}
