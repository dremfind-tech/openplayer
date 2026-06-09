import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Download, AlertCircle, CheckCircle, Loader2, Sparkles, Clock, X } from "lucide-react";
import { useDownloadStore } from "../store";

interface DownloaderViewProps {
  onDownloadSuccess: () => void;
}

export default function DownloaderView({ onDownloadSuccess }: DownloaderViewProps) {
  const [urlInput, setUrlInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isFetchingPlaylist, setIsFetchingPlaylist] = useState(false);
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

        invoke("download_track", { url: nextQueued.url }).catch((err) => {
          console.error("Download command failed for URL:", nextQueued.url, err);
          updateDownload(nextQueued.url, {
            status: "failed",
            error: typeof err === "string" ? err : "An unexpected error occurred during download.",
          });
        });
      }
    }
  }, [activeDownloads, updateDownload]);

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

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
        for (const video of videos) {
          if (!activeDownloads[video.url]) {
            addDownload(video.url, "queued", video.title);
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
      if (activeDownloads[url]) {
        setErrorMessage("This track is already downloading or queued.");
        return;
      }

      // Add to active downloads list as queued
      addDownload(url, "queued");
      setUrlInput("");
    }
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
          Paste any YouTube song or playlist link to extract and save audio directly to your local offline library.
        </p>
      </div>

      {/* Input Card */}
      <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-xl p-6 shadow-xl mb-8">
        <form onSubmit={handleDownload} className="flex flex-col sm:flex-row gap-3">
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
            className="px-6 py-3 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(139,92,246,0.3)] hover:scale-[1.02]"
          >
            {isFetchingPlaylist ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <Download size={18} />
                Download
              </>
            )}
          </button>
        </form>

        {errorMessage && (
          <div className="mt-3 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle size={14} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

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
                    <span className="text-xs font-mono truncate text-zinc-300 pr-4">{download.title || download.url}</span>
                    <span className="text-xs font-semibold text-zinc-400 whitespace-nowrap">
                      {download.status === "queued" && "Queued..."}
                      {download.status === "fetching" && "Analyzing video..."}
                      {download.status === "downloading" && `Downloading: ${download.progress.toFixed(1)}%`}
                      {download.status === "converting" && "Processing audio & tags..."}
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
