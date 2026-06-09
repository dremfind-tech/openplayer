import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Play, Pause, SkipForward, SkipBack, Music, Power } from "lucide-react";

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  file_path: string;
  cover_path: string | null;
}

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export default function TrayPlayer() {
  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });

  // Listen to updates from the main window
  useEffect(() => {
    const setupListeners = async () => {
      const unlistenUpdate = await listen<PlayerState>("player-state-update", (event) => {
        setState(event.payload);
      });

      // Request initial state on load
      await invoke("request_player_state").catch((err) => console.error(err));

      return () => {
        unlistenUpdate();
      };
    };

    const cleanupPromise = setupListeners();
    return () => {
      cleanupPromise.then((cleanup) => cleanup());
    };
  }, []);

  const handlePlayPause = () => {
    invoke("send_tray_action", { action: "play-pause" }).catch((err) => console.error(err));
  };

  const handlePrev = () => {
    invoke("send_tray_action", { action: "prev" }).catch((err) => console.error(err));
  };

  const handleNext = () => {
    invoke("send_tray_action", { action: "next" }).catch((err) => console.error(err));
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    invoke("send_tray_action", { action: "seek", payload: val }).catch((err) => console.error(err));
    setState((prev) => ({ ...prev, currentTime: val }));
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === 0) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const coverSrc = state.currentTrack?.cover_path
    ? convertFileSrc(state.currentTrack.cover_path)
    : "";

  return (
    <div className="w-full h-full bg-zinc-950/95 border border-zinc-800 text-zinc-100 p-4 flex flex-col justify-between select-none font-sans overflow-hidden">
      {/* Top Section: Track Details */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex-shrink-0 overflow-hidden flex items-center justify-center relative shadow-md">
          {coverSrc ? (
            <>
              <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full object-cover filter blur-xs opacity-40 scale-105" />
              <img src={coverSrc} alt={state.currentTrack?.title} className="relative w-full h-full object-contain z-10" />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-violet-600 to-indigo-900 flex items-center justify-center">
              <Music size={18} className="text-zinc-300" />
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0 flex-grow">
          {state.currentTrack ? (
            <>
              <span className="text-sm font-semibold truncate text-zinc-100">{state.currentTrack.title}</span>
              <span className="text-xs text-zinc-400 truncate">{state.currentTrack.artist}</span>
            </>
          ) : (
            <>
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">No Track Playing</span>
              <span className="text-[10px] text-zinc-600">Select a song in the app</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 self-start pt-0.5">
          <span className="text-[9px] font-bold text-violet-400/70 tracking-widest uppercase font-mono">
            Open Beat
          </span>
          <button
            onClick={() => invoke("exit_app").catch((err) => console.error(err))}
            className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-950/30 active:scale-95 transition-all cursor-pointer"
            title="Quit App"
          >
            <Power size={11} />
          </button>
        </div>
      </div>

      {/* Middle Section: Progress Bar */}
      <div className="flex flex-col gap-1 w-full">
        <div className="flex items-center w-full gap-2.5 text-[10px] text-zinc-500 font-mono">
          <span className="w-8 text-right">{formatTime(state.currentTime)}</span>
          <input
            type="range"
            min={0}
            max={state.duration || 100}
            value={state.currentTime}
            onChange={handleSeek}
            disabled={!state.currentTrack}
            style={{
              background: `linear-gradient(to right, #8b5cf6 ${state.duration ? (state.currentTime / state.duration) * 100 : 0}%, #27272a ${state.duration ? (state.currentTime / state.duration) * 100 : 0}%)`
            }}
            className="w-full accent-violet-500 h-1 rounded-lg cursor-pointer outline-none appearance-none focus:outline-none transition-all"
          />
          <span className="w-8 text-left">{formatTime(state.duration)}</span>
        </div>
      </div>

      {/* Bottom Section: Media Controls */}
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={handlePrev}
          disabled={!state.currentTrack}
          className="p-2 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/40 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="Previous"
        >
          <SkipBack size={18} />
        </button>

        <button
          onClick={handlePlayPause}
          disabled={!state.currentTrack}
          className={`p-2.5 rounded-full flex items-center justify-center active:scale-95 transition-all ${
            state.currentTrack
              ? "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.3)] hover:shadow-[0_0_16px_rgba(139,92,246,0.5)]"
              : "bg-zinc-800 text-zinc-650 cursor-not-allowed"
          }`}
          title={state.isPlaying ? "Pause" : "Play"}
        >
          {state.isPlaying ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" className="translate-x-[1px]" />
          )}
        </button>

        <button
          onClick={handleNext}
          disabled={!state.currentTrack}
          className="p-2 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/40 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="Next"
        >
          <SkipForward size={18} />
        </button>
      </div>
    </div>
  );
}
