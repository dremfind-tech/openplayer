import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Download, AlertCircle, CheckCircle, Loader2, Sparkles, Clock, X } from "lucide-react";
import { useDownloadStore } from "../store";

interface DownloaderViewProps {
  onDownloadSuccess: () => void;
}

interface VideoFormatInfo {
  format_id: string;
  ext: string;
  height: number | null;
  width: number | null;
  abr: number | null;
  filesize: number | null;
  format_note: string | null;
  vcodec: string | null;
  acodec: string | null;
}

interface VideoDetails {
  id: string;
  title: string;
  duration: number;
  thumbnail: string | null;
  formats: VideoFormatInfo[];
}

export default function DownloaderView({ onDownloadSuccess }: DownloaderViewProps) {
  const [urlInput, setUrlInput] = useState("");
  const [downloadType, setDownloadType] = useState<"audio" | "video">("audio");
  const [videoQuality, setVideoQuality] = useState<"best" | "1080p" | "720p" | "480p" | "360p">("best");
  const [audioQuality, setAudioQuality] = useState<"high" | "medium" | "low">("high");
  const [errorMessage, setErrorMessage] = useState("");
  const [isFetchingPlaylist, setIsFetchingPlaylist] = useState(false);

  // Dynamic quality selection states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedDetails, setAnalyzedDetails] = useState<VideoDetails | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string>("");

  const {
    activeDownloads,
    addDownload,
    updateDownload,
    removeDownload,
    cancelDownload,
    cancelAllDownloads,
  } = useDownloadStore();

  useEffect(() => {
    // Listen for progress updates from Tauri backend
    const unlistenPromise = listen<any>("download-status", (event) => {
      const payload = event.payload;
      updateDownload(payload.url, {
        progress: payload.progress,
        speed: payload.speed,
        status: payload.status,
        error: payload.error,
      });

      if (payload.status === "finished") {
        setTimeout(() => {
          removeDownload(payload.url);
          onDownloadSuccess();
        }, 3000);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [updateDownload, removeDownload, onDownloadSuccess]);

  // Queue processing effect - limits concurrency to 2 concurrent downloads
  useEffect(() => {
    const activeList = Object.values(activeDownloads);
    const activeCount = activeList.filter(
      (d) => d.status === "downloading" || d.status === "fetching" || d.status === "converting"
    ).length;

    if (activeCount < 2) {
      const nextQueued = activeList.find((d) => d.status === "queued");
      if (nextQueued) {
        // Update to fetching status before invoking so we don't start it again on next render
        updateDownload(nextQueued.url, { status: "fetching" });

        invoke("download_track", { 
          url: nextQueued.url, 
          isVideo: nextQueued.downloadType === "video",
          quality: nextQueued.quality,
        }).catch((err) => {
          console.error("Download command failed for URL:", nextQueued.url, err);
          updateDownload(nextQueued.url, {
            status: "failed",
            error: typeof err === "string" ? err : "An unexpected error occurred during download.",
          });
        });
      }
    }
  }, [activeDownloads, updateDownload]);

  const getVideoOptions = (details: VideoDetails) => {
    const uniqueHeights = new Set<number>();
    details.formats.forEach((f) => {
      if (f.height && f.vcodec && f.vcodec !== "none") {
        uniqueHeights.add(f.height);
      }
    });

    const sortedHeights = Array.from(uniqueHeights).sort((a, b) => b - a);
    return sortedHeights.map((h) => {
      const fmts = details.formats.filter((f) => f.height === h);
      const isMP4Available = fmts.some((f) => f.ext === "mp4");
      
      let label = `${h}p`;
      if (h >= 2160) label += " (4K UHD)";
      else if (h >= 1440) label += " (2K)";
      else if (h >= 1080) label += " (Full HD)";
      else if (h >= 720) label += " (HD)";
      else if (h >= 480) label += " (SD)";
      else if (h >= 360) label += " (Low)";

      const bestFmt = fmts.find((f) => f.ext === "mp4") || fmts[0];
      let sizeText = "";
      if (bestFmt?.filesize) {
        const mb = (bestFmt.filesize / (1024 * 1024)).toFixed(1);
        sizeText = ` ~${mb} MB`;
      }

      return {
        value: `${h}p`,
        label: `${label}${sizeText}`,
        ext: isMP4Available ? "mp4" : fmts[0]?.ext || "mp4"
      };
    });
  };

  const getAudioOptions = (details: VideoDetails) => {
    const audioFormats = details.formats.filter(
      (f) => (f.vcodec === "none" || !f.vcodec) && f.abr
    );

    const uniqueBitrates = new Map<number, typeof audioFormats[0]>();
    audioFormats.forEach((f) => {
      if (f.abr) {
        const kbps = Math.round(f.abr);
        if (!uniqueBitrates.has(kbps) || (f.ext === "m4a" && uniqueBitrates.get(kbps)?.ext !== "m4a")) {
          uniqueBitrates.set(kbps, f);
        }
      }
    });

    const sortedBitrates = Array.from(uniqueBitrates.keys()).sort((a, b) => b - a);
    return sortedBitrates.map((kbps) => {
      const f = uniqueBitrates.get(kbps)!;
      let label = `${kbps} kbps`;
      if (kbps >= 150) label += " (High)";
      else if (kbps >= 120) label += " (Standard)";
      else if (kbps >= 60) label += " (Medium)";
      else label += " (Low)";

      let sizeText = "";
      if (f.filesize) {
        const mb = (f.filesize / (1024 * 1024)).toFixed(1);
        sizeText = ` ~${mb} MB`;
      }

      return {
        value: `${kbps}kbps`,
        label: `${label}${sizeText}`,
        ext: f.ext
      };
    });
  };

  const handleFormatChange = (type: "audio" | "video") => {
    setDownloadType(type);
    if (analyzedDetails) {
      const opts = type === "video" ? getVideoOptions(analyzedDetails) : getAudioOptions(analyzedDetails);
      if (opts.length > 0) {
        setSelectedQuality(opts[0].value);
      } else {
        setSelectedQuality(type === "video" ? "best" : "high");
      }
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setAnalyzedDetails(null);

    const url = urlInput.trim();
    if (!url) return;

    if (!url.includes("youtube.com/") && !url.includes("youtu.be/")) {
      setErrorMessage("Please enter a valid YouTube URL (video or playlist)");
      return;
    }

    const isPlaylist = url.includes("list=");

    if (isPlaylist) {
      setIsFetchingPlaylist(true);
      try {
        interface PlaylistVideo {
          title: string;
          id: string;
          url: string;
        }
        const videos = await invoke<PlaylistVideo[]>("get_playlist_videos", { url });
        if (videos.length === 0) {
          setErrorMessage("No videos found in this playlist.");
          setIsFetchingPlaylist(false);
          return;
        }

        let addedCount = 0;
        const playlistQuality = downloadType === "video" ? videoQuality : audioQuality;
        for (const video of videos) {
          if (!activeDownloads[video.url]) {
            addDownload(video.url, "queued", video.title, downloadType, playlistQuality);
            addedCount++;
          }
        }

        if (addedCount === 0) {
          setErrorMessage("All tracks from this playlist are already queued or downloading.");
        } else {
          setUrlInput("");
        }
      } catch (err) {
        console.error("Playlist command failed:", err);
        setErrorMessage(typeof err === "string" ? err : "Failed to extract playlist tracks.");
      } finally {
        setIsFetchingPlaylist(false);
      }
    } else {
      setIsAnalyzing(true);
      try {
        const details = await invoke<VideoDetails>("get_video_details", { url });
        setAnalyzedDetails(details);
        
        // Default to first quality option
        const initialOpts = downloadType === "video" ? getVideoOptions(details) : getAudioOptions(details);
        if (initialOpts.length > 0) {
          setSelectedQuality(initialOpts[0].value);
        } else {
          setSelectedQuality(downloadType === "video" ? "best" : "high");
        }
      } catch (err) {
        console.error("Failed to analyze video:", err);
        setErrorMessage(typeof err === "string" ? err : "Failed to analyze video qualities. Make sure the video is public.");
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handleStartDynamicDownload = () => {
    if (!analyzedDetails) return;
    
    const url = urlInput.trim();
    if (activeDownloads[url]) {
      setErrorMessage("This track is already downloading or queued.");
      return;
    }

    addDownload(url, "queued", analyzedDetails.title, downloadType, selectedQuality);
    
    // Reset inputs
    setUrlInput("");
    setAnalyzedDetails(null);
    setSelectedQuality("");
  };

  const formatDuration = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = secs % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 font-sans text-zinc-100">
      {/* Intro Header */}
      <div className="mb-10 text-center relative">
        <div className="absolute top-[-40px] left-1/2 -translate-x-1/2 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <h2 className="text-3xl font-extrabold tracking-tight font-outfit mb-3 flex items-center justify-center gap-2">
          <Sparkles className="text-violet-400 w-6 h-6 animate-pulse" />
          DOWNLOAD HUB
        </h2>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">
          Paste any YouTube song or playlist link to extract and save audio or video format with customizable qualities.
        </p>
      </div>

      {/* Analyzer Loader */}
      {isAnalyzing ? (
        <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-xl p-10 shadow-xl mb-8 flex flex-col items-center justify-center gap-4 text-center">
          <Loader2 size={36} className="text-violet-500 animate-spin" />
          <div>
            <h4 className="text-sm font-semibold text-zinc-200 font-outfit">Analyzing YouTube Link...</h4>
            <p className="text-xs text-zinc-500 mt-1 font-mono">Fetching available video formats and audio streams</p>
          </div>
        </div>
      ) : !analyzedDetails ? (
        /* Input Card */
        <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-xl p-6 shadow-xl mb-8">
          <form onSubmit={handleAnalyze} className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-grow">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-4 py-3 bg-zinc-950/80 rounded-lg border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all font-mono text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={isFetchingPlaylist}
                className="px-6 py-3 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(139,92,246,0.3)] hover:scale-[1.02] cursor-pointer"
              >
                {isFetchingPlaylist ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Queueing...
                  </>
                ) : urlInput.includes("list=") ? (
                  <>
                    <Download size={18} />
                    Queue Playlist
                  </>
                ) : (
                  <>
                    <Sparkles size={18} className="text-violet-300 animate-pulse" />
                    Analyze Link
                  </>
                )}
              </button>
            </div>

            {/* Playlist-only options (Format & Quality) */}
            {urlInput.includes("list=") && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 border-t border-zinc-850 pt-4 animate-in fade-in duration-200">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 font-semibold select-none">Save Format:</span>
                  <div className="flex bg-zinc-950/80 p-1 rounded-lg border border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() => setDownloadType("audio")}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        downloadType === "audio"
                          ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      🎵 Audio / Music
                    </button>
                    <button
                      type="button"
                      onClick={() => setDownloadType("video")}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        downloadType === "video"
                          ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      🎥 Video (MP4)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 font-semibold select-none">Quality:</span>
                  {downloadType === "video" ? (
                    <div className="flex bg-zinc-950/80 p-1 rounded-lg border border-zinc-800/80 gap-1">
                      {(["best", "1080p", "720p", "480p", "360p"] as const).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setVideoQuality(q)}
                          className={`flex items-center px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                            videoQuality === q
                              ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {q === "best" ? "✨ Best" : q}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex bg-zinc-950/80 p-1 rounded-lg border border-zinc-800/80 gap-1">
                      {(["high", "medium", "low"] as const).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setAudioQuality(q)}
                          className={`flex items-center px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                            audioQuality === q
                              ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {q === "high" ? "🔥 High" : q === "medium" ? "🎧 Med" : "📱 Low"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>

          {errorMessage && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-400 animate-pulse">
              <AlertCircle size={14} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      ) : (
        /* Analyzed Video Options Card */
        <div className="bg-zinc-900/60 backdrop-blur-md border border-zinc-800 rounded-xl p-6 shadow-xl mb-8 animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-violet-400 font-outfit">
              Link Analyzed Successfully
            </h3>
            <button
              onClick={() => {
                setAnalyzedDetails(null);
                setUrlInput("");
              }}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 hover:bg-zinc-800 rounded-md cursor-pointer"
              title="Clear analysis"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            {/* Thumbnail */}
            <div className="w-full md:w-48 aspect-video md:aspect-[16/10] bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800 flex-shrink-0 relative group">
              {analyzedDetails.thumbnail ? (
                <img
                  src={analyzedDetails.thumbnail}
                  alt={analyzedDetails.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                  No Thumbnail
                </div>
              )}
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                {formatDuration(analyzedDetails.duration)}
              </div>
            </div>

            {/* Config details */}
            <div className="flex-grow flex flex-col justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-zinc-100 line-clamp-2 leading-relaxed mb-2 font-mono">
                  {analyzedDetails.title}
                </h4>
                <p className="text-xs text-zinc-500 font-mono">
                  Duration: {formatDuration(analyzedDetails.duration)} | Video ID: {analyzedDetails.id}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 border-t border-zinc-800/60 pt-4">
                {/* Format selection */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-zinc-400 font-semibold select-none">Save Format</span>
                  <div className="flex bg-zinc-950/80 p-1 rounded-lg border border-zinc-800/80 self-start">
                    <button
                      type="button"
                      onClick={() => handleFormatChange("audio")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        downloadType === "audio"
                          ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      🎵 Audio
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFormatChange("video")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        downloadType === "video"
                          ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      🎥 Video
                    </button>
                  </div>
                </div>

                {/* Quality selection dropdown */}
                <div className="flex-grow flex flex-col gap-1.5">
                  <span className="text-xs text-zinc-400 font-semibold select-none">Select Quality</span>
                  <select
                    value={selectedQuality}
                    onChange={(e) => setSelectedQuality(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950/80 rounded-lg border border-zinc-855 text-zinc-100 text-xs focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all font-mono"
                  >
                    {(downloadType === "video" ? getVideoOptions(analyzedDetails) : getAudioOptions(analyzedDetails)).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} ({opt.ext.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 justify-end border-t border-zinc-800/60 pt-4 mt-2">
                <button
                  onClick={() => {
                    setAnalyzedDetails(null);
                    setUrlInput("");
                  }}
                  className="px-4 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartDynamicDownload}
                  className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-all flex items-center gap-2 shadow-[0_0_12px_rgba(139,92,246,0.25)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  <Download size={14} />
                  Add to Download Queue
                </button>
              </div>
            </div>
          </div>
          {errorMessage && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-400 animate-pulse">
              <AlertCircle size={14} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* Downloads List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Active Tasks</h3>
          {Object.keys(activeDownloads).length > 0 && (
            <button
              onClick={cancelAllDownloads}
              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors bg-red-950/20 hover:bg-red-950/45 px-2.5 py-1 rounded border border-red-900/30 flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              Cancel All
            </button>
          )}
        </div>
        {Object.keys(activeDownloads).length === 0 ? (
          <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/10">
            <span className="text-xs text-zinc-600">No active downloads. Paste a link above to start.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.values(activeDownloads).map((download) => (
              <div
                key={download.url}
                className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex-grow min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0 pr-4">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-850 text-[9px] uppercase font-mono tracking-wider font-semibold text-zinc-400 flex-shrink-0 border border-zinc-800">
                        {download.downloadType === "video" ? "🎥 Video" : "🎵 Audio"}
                      </span>
                      {download.quality && (
                        <span className="px-1.5 py-0.5 rounded bg-violet-950/60 text-[9px] uppercase font-mono tracking-wider font-semibold text-violet-400 flex-shrink-0 border border-violet-900/40">
                          {download.quality === "best" ? "✨ best" : download.quality === "high" ? "🔥 high" : download.quality}
                        </span>
                      )}
                      <span className="text-xs font-mono truncate text-zinc-300">{download.title || download.url}</span>
                    </div>
                    <span className="text-xs font-semibold text-zinc-400 whitespace-nowrap">
                      {download.status === "queued" && "Queued..."}
                      {download.status === "fetching" && "Analyzing video..."}
                      {download.status === "downloading" && `Downloading: ${download.progress.toFixed(1)}%`}
                      {download.status === "converting" && (download.downloadType === "video" ? "Processing video..." : "Processing audio & tags...")}
                      {download.status === "finished" && "Completed!"}
                      {download.status === "failed" && "Failed"}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        download.status === "failed"
                          ? "bg-red-500"
                          : download.status === "finished"
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                          : download.status === "queued"
                          ? "bg-zinc-700"
                          : "bg-gradient-to-r from-violet-600 to-cyan-400 shadow-[0_0_8px_rgba(139,92,246,0.5)]"
                      }`}
                      style={{
                        width: `${
                          download.status === "queued"
                            ? 0
                            : download.status === "fetching"
                            ? 15
                            : download.status === "converting"
                            ? 90
                            : download.progress
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-center">
                  {download.status === "downloading" && (
                    <span className="text-xs font-mono text-cyan-400">{download.speed}</span>
                  )}
                  {download.status === "queued" && <Clock size={16} className="text-zinc-500 animate-pulse" />}
                  {download.status === "fetching" && <Loader2 size={16} className="text-violet-500 animate-spin" />}
                  {download.status === "converting" && <Loader2 size={16} className="text-cyan-500 animate-spin" />}
                  {download.status === "finished" && <CheckCircle size={18} className="text-emerald-500" />}
                  {download.status === "failed" && (
                    <div className="flex items-center gap-1.5 text-red-400 text-xs max-w-xs md:max-w-md bg-red-950/20 px-3 py-1 rounded border border-red-900/30">
                      <AlertCircle size={14} className="flex-shrink-0" />
                      <span className="truncate">{download.error || "Failed to download."}</span>
                    </div>
                  )}
                  {download.status !== "finished" && download.status !== "failed" && (
                    <button
                      onClick={() => cancelDownload(download.url)}
                      className="text-xs text-zinc-500 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-zinc-800/40 cursor-pointer flex items-center justify-center"
                      title="Cancel download"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
