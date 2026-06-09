import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";


export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  file_path: string;
  cover_path: string | null;
  youtube_url: string | null;
  date_added: number;
}

export interface Playlist {
  id: string;
  name: string;
  date_created: number;
}

export interface DownloadStatus {
  url: string;
  progress: number;
  speed: string;
  status: "fetching" | "downloading" | "converting" | "finished" | "failed" | "queued";
  error?: string;
  title?: string;
}

interface PlayerState {
  // Library & Playlists
  tracks: Track[];
  playlists: Playlist[];
  currentPlaylistId: string | null;
  setTracks: (tracks: Track[]) => void;
  setPlaylists: (playlists: Playlist[]) => void;
  setCurrentPlaylistId: (id: string | null) => void;

  // Playback state
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  lastSeek: { time: number; timestamp: number } | null;
  volume: number;
  isShuffle: boolean;
  isRepeat: boolean;
  
  // Queue state
  queue: Track[];
  currentIndex: number;

  // UI state
  theme: "dark" | "light";
  isFullscreenOpen: boolean;
  audioSinkId: string;

  // Actions
  playTrack: (track: Track, customQueue?: Track[]) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (trackId: string) => void;
  clearQueue: () => void;
  setTheme: (theme: "dark" | "light") => void;
  setFullscreenOpen: (open: boolean) => void;
  setAudioSinkId: (sinkId: string) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  tracks: [],
  playlists: [],
  currentPlaylistId: null,
  setTracks: (tracks) => set({ tracks }),
  setPlaylists: (playlists) => set({ playlists }),
  setCurrentPlaylistId: (currentPlaylistId) => set({ currentPlaylistId }),

  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  lastSeek: null,
  volume: 0.8,
  isShuffle: false,
  isRepeat: false,
  queue: [],
  currentIndex: -1,
  theme: (localStorage.getItem("theme") as "dark" | "light") || "dark",
  isFullscreenOpen: false,
  audioSinkId: localStorage.getItem("audioSinkId") || "",

  playTrack: (track, customQueue) => {
    const state = get();
    const activeQueue = customQueue || state.tracks;
    const index = activeQueue.findIndex((t) => t.id === track.id);
    
    set({
      currentTrack: track,
      queue: activeQueue,
      currentIndex: index >= 0 ? index : 0,
      isPlaying: true,
      currentTime: 0,
      duration: 0,
    });
  },

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  seekTo: (time) => set({ lastSeek: { time, timestamp: Date.now() }, currentTime: time }),
  setVolume: (volume) => set({ volume }),

  nextTrack: () => {
    const { queue, currentIndex, isRepeat, isShuffle } = get();
    if (queue.length === 0) return;

    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * queue.length);
      set({
        currentIndex: randomIndex,
        currentTrack: queue[randomIndex],
        currentTime: 0,
        isPlaying: true,
      });
      return;
    }

    let nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      if (isRepeat) {
        nextIndex = 0;
      } else {
        set({ isPlaying: false, currentTime: 0 });
        return;
      }
    }

    set({
      currentIndex: nextIndex,
      currentTrack: queue[nextIndex],
      currentTime: 0,
      isPlaying: true,
    });
  },

  prevTrack: () => {
    const { queue, currentIndex, isRepeat } = get();
    if (queue.length === 0) return;

    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      if (isRepeat) {
        prevIndex = queue.length - 1;
      } else {
        prevIndex = 0;
      }
    }

    set({
      currentIndex: prevIndex,
      currentTrack: queue[prevIndex],
      currentTime: 0,
      isPlaying: true,
    });
  },

  toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),
  toggleRepeat: () => set((state) => ({ isRepeat: !state.isRepeat })),

  addToQueue: (track) => set((state) => {
    if (state.queue.some((t) => t.id === track.id)) return {};
    return { queue: [...state.queue, track] };
  }),

  removeFromQueue: (trackId) => set((state) => {
    const newQueue = state.queue.filter((t) => t.id !== trackId);
    let newIndex = state.currentIndex;
    if (state.currentTrack?.id === trackId) {
      newIndex = newQueue.length > 0 ? 0 : -1;
    } else {
      newIndex = newQueue.findIndex((t) => t.id === state.currentTrack?.id);
    }
    return {
      queue: newQueue,
      currentIndex: newIndex,
      currentTrack: newIndex >= 0 ? newQueue[newIndex] : null,
    };
  }),

  clearQueue: () => set({ queue: [], currentIndex: -1, currentTrack: null, isPlaying: false }),
  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    set({ theme });
  },
  setFullscreenOpen: (isFullscreenOpen) => set({ isFullscreenOpen }),
  setAudioSinkId: (audioSinkId) => {
    localStorage.setItem("audioSinkId", audioSinkId);
    set({ audioSinkId });
  },
}));

interface DownloadState {
  activeDownloads: Record<string, DownloadStatus>;
  addDownload: (url: string, status?: "fetching" | "queued", title?: string) => void;
  updateDownload: (url: string, update: Partial<DownloadStatus>) => void;
  removeDownload: (url: string) => void;
  cancelDownload: (url: string) => Promise<void>;
  cancelAllDownloads: () => Promise<void>;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  activeDownloads: {},
  addDownload: (url, status = "fetching", title) => set((state) => ({
    activeDownloads: {
      ...state.activeDownloads,
      [url]: {
        url,
        progress: 0,
        speed: status === "queued" ? "Queued" : "N/A",
        status,
        title,
      }
    }
  })),
  updateDownload: (url, update) => set((state) => {
    const download = state.activeDownloads[url];
    if (!download) return {};
    return {
      activeDownloads: {
        ...state.activeDownloads,
        [url]: { ...download, ...update }
      }
    };
  }),
  removeDownload: (url) => set((state) => {
    const newDownloads = { ...state.activeDownloads };
    delete newDownloads[url];
    return { activeDownloads: newDownloads };
  }),
  cancelDownload: async (url) => {
    try {
      await invoke("cancel_download", { url });
    } catch (err) {
      console.error("Failed to cancel download in backend:", err);
    }
    get().removeDownload(url);
  },
  cancelAllDownloads: async () => {
    const urls = Object.keys(get().activeDownloads);
    for (const url of urls) {
      try {
        await invoke("cancel_download", { url });
      } catch (err) {
        console.error("Failed to cancel download in backend:", err);
      }
    }
    set({ activeDownloads: {} });
  },
}));
