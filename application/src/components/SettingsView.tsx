import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerStore, Theme } from "../store";
import { Check, Volume2, HardDrive, Settings2, Palette } from "lucide-react";

interface StorageInfo {
  free_bytes: number;
  total_bytes: number;
  app_bytes: number;
}

interface ThemeItem {
  id: Theme;
  name: string;
  desc: string;
  isDark: boolean;
  colors: {
    bg: string;
    card: string;
    text: string;
    accent: string;
  };
}

const THEMES: ThemeItem[] = [
  {
    id: "dark",
    name: "Default Dark",
    desc: "Sleek dark theme with violet accent",
    isDark: true,
    colors: { bg: "#09090b", card: "#18181b", text: "#fafafa", accent: "#8b5cf6" },
  },
  {
    id: "light",
    name: "Default Light",
    desc: "Clean light theme with violet accent",
    isDark: false,
    colors: { bg: "#ffffff", card: "#f4f4f5", text: "#09090b", accent: "#7c3aed" },
  },
  {
    id: "white-light-orange",
    name: "White Orange",
    desc: "Bright white with vibrant orange",
    isDark: false,
    colors: { bg: "#ffffff", card: "#fdf8f5", text: "#0f0d0c", accent: "#f97316" },
  },
  {
    id: "obsidian",
    name: "Obsidian",
    desc: "Deep slate dark with lavender accent",
    isDark: true,
    colors: { bg: "#0f1115", card: "#16181d", text: "#f8fafc", accent: "#9376e0" },
  },
  {
    id: "gray-orange",
    name: "Gray Orange (Claude)",
    desc: "Warm tan-cream with coral orange",
    isDark: false,
    colors: { bg: "#f9f8f6", card: "#f1efe9", text: "#100e0a", accent: "#ea580c" },
  },
  {
    id: "white-cream",
    name: "White Cream",
    desc: "Organic warm cream with amber accent",
    isDark: false,
    colors: { bg: "#faf6f0", card: "#f3ebe1", text: "#120e0a", accent: "#d97706" },
  },
  {
    id: "black-modern",
    name: "Modern Black",
    desc: "Pitch black with electric magenta",
    isDark: true,
    colors: { bg: "#000000", card: "#0b0b0d", text: "#ffffff", accent: "#d946ef" },
  },
];

export default function SettingsView() {
  const { theme, setTheme, audioSinkId, setAudioSinkId } = usePlayerStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

  // Fetch audio output devices
  const loadAudioDevices = async () => {
    try {
      // Request permission if needed
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const outputs = allDevices.filter((d) => d.kind === "audiooutput");
      setDevices(outputs);
    } catch (err) {
      console.error("Failed to fetch audio devices:", err);
    }
  };

  // Fetch storage info
  const loadStorageInfo = async () => {
    try {
      const info = await invoke<StorageInfo>("get_storage_info");
      setStorageInfo(info);
    } catch (err) {
      console.error("Failed to load storage info:", err);
    }
  };

  useEffect(() => {
    loadAudioDevices();
    loadStorageInfo();
  }, []);

  const formatBytes = (bytes: number, decimals = 1) => {
    if (!bytes) return "0 GB";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  return (
    <div className="flex-grow flex flex-col min-h-0 text-zinc-100 font-sans p-6 select-none relative animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Settings2 className="text-violet-400 w-6 h-6" />
        <h2 className="text-2xl font-bold font-outfit uppercase tracking-wider text-violet-400">
          SETTINGS
        </h2>
      </div>

      <div className="flex-grow overflow-y-auto pr-1 space-y-8 pb-10">
        
        {/* Themes section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-900 pb-2">
            <Palette className="text-zinc-400 w-4 h-4" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
              Interface Themes
            </h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {THEMES.map((t) => {
              const isActive = theme === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`relative flex flex-col justify-between border rounded-xl p-4 transition-all duration-300 cursor-pointer ${
                    isActive
                      ? "border-violet-500 bg-violet-950/10 shadow-[0_0_15px_rgba(139,92,246,0.12)] scale-[1.02]"
                      : "bg-zinc-900/20 hover:bg-zinc-900/40 border-zinc-900 hover:border-zinc-800 hover:scale-[1.01]"
                  }`}
                >
                  {/* Theme Info */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-zinc-100">{t.name}</span>
                      {isActive && (
                        <div className="p-0.5 bg-violet-600 rounded-full text-white">
                          <Check size={10} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-400 block leading-tight">{t.desc}</span>
                  </div>

                  {/* Visual Palette Preview */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-900/60">
                    <div className="flex gap-1.5">
                      <div
                        className="w-4 h-4 rounded-full border border-zinc-800/40 shadow-sm"
                        style={{ backgroundColor: t.colors.bg }}
                        title="Background"
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-zinc-800/40 shadow-sm"
                        style={{ backgroundColor: t.colors.card }}
                        title="Card Background"
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-zinc-800/40 shadow-sm"
                        style={{ backgroundColor: t.colors.text }}
                        title="Text Color"
                      />
                    </div>
                    <div
                      className="w-5 h-2 rounded-full shadow-sm"
                      style={{ backgroundColor: t.colors.accent }}
                      title="Accent Color"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Audio Output section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-900 pb-2">
            <Volume2 className="text-zinc-400 w-4 h-4" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
              Audio Output Device
            </h3>
          </div>

          <div className="bg-zinc-900/25 border border-zinc-900 rounded-xl p-4 max-w-xl space-y-3">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Select the audio device to use for playback. If set to default, Open Beat will follow your system's current audio selection.
            </p>
            
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              <button
                onClick={() => setAudioSinkId("")}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all border ${
                  audioSinkId === ""
                    ? "bg-violet-950/20 text-violet-400 border-violet-500/25"
                    : "bg-zinc-900/40 text-zinc-300 border-transparent hover:border-zinc-800 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Volume2 size={14} className="text-zinc-400" />
                  <span>Default System Device</span>
                </div>
                {audioSinkId === "" && <Check size={13} className="text-violet-400 flex-shrink-0" />}
              </button>

              {devices.map((device) => {
                const isSelected = audioSinkId === device.deviceId;
                return (
                  <button
                    key={device.deviceId}
                    onClick={() => setAudioSinkId(device.deviceId)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all border ${
                      isSelected
                        ? "bg-violet-950/20 text-violet-400 border-violet-500/25"
                        : "bg-zinc-900/40 text-zinc-300 border-transparent hover:border-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Volume2 size={14} className="text-zinc-400" />
                      <span className="truncate pr-4">{device.label || `Audio Device (${device.deviceId.slice(0, 5)}...)`}</span>
                    </div>
                    {isSelected && <Check size={13} className="text-violet-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Storage Info section */}
        {storageInfo && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-2">
              <HardDrive className="text-zinc-400 w-4 h-4" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                Application Storage
              </h3>
            </div>

            <div className="bg-zinc-900/25 border border-zinc-900 rounded-xl p-5 max-w-xl space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-400">Disk Storage Status</span>
                <span className="font-mono text-violet-400">{formatBytes(storageInfo.free_bytes)} free</span>
              </div>

              {/* Progress Bar */}
              {(() => {
                const systemUsedPct = (Math.max(0, storageInfo.total_bytes - storageInfo.free_bytes - storageInfo.app_bytes) / storageInfo.total_bytes) * 100;
                const appUsedPct = storageInfo.total_bytes > 0 ? (storageInfo.app_bytes / storageInfo.total_bytes) * 100 : 0;
                const minAppPct = storageInfo.app_bytes > 0 ? Math.max(1.5, appUsedPct) : 0;

                return (
                  <div className="space-y-3">
                    <div className="w-full h-3.5 bg-emerald-500/90 rounded-full overflow-hidden flex shadow-inner border border-zinc-950/20">
                      {/* System / Other used (Amber) */}
                      <div
                        className="h-full bg-amber-400/90 transition-all duration-500 ease-out flex-shrink-0"
                        style={{ width: `${systemUsedPct}%` }}
                      />
                      {/* App used (Violet) */}
                      <div
                        className="h-full bg-violet-500/90 transition-all duration-500 ease-out flex-shrink-0 border-l border-zinc-950/10"
                        style={{ width: `${minAppPct}%` }}
                      />
                      {/* Free Space remainder = container bg (emerald-500) */}
                    </div>

                    {/* Legend grid */}
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-medium pt-1">
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 text-amber-400">
                          <span className="inline-block w-2.5 h-2.5 rounded bg-amber-400 shadow-sm" />
                          Other System Files
                        </span>
                        <span className="text-[9px] text-zinc-500 font-mono pl-4">
                          {formatBytes(Math.max(0, storageInfo.total_bytes - storageInfo.free_bytes - storageInfo.app_bytes))}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 text-violet-400 font-semibold">
                          <span className="inline-block w-2.5 h-2.5 rounded bg-violet-500 shadow-sm" />
                          Open Beat Data
                        </span>
                        <span className="text-[9px] text-zinc-500 font-mono pl-4">
                          {formatBytes(storageInfo.app_bytes)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <span className="inline-block w-2.5 h-2.5 rounded bg-emerald-500 shadow-sm" />
                          Available Free
                        </span>
                        <span className="text-[9px] text-zinc-500 font-mono pl-4">
                          {formatBytes(storageInfo.free_bytes)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
