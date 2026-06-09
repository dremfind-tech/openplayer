import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

export default function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    // Check initial state
    appWindow.isMaximized().then(setIsMaximized);
    appWindow.isFullscreen().then(setIsFullscreen);

    // Listen to resize events to update maximize/fullscreen icon
    const unlisten = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      const fullscreen = await appWindow.isFullscreen();
      setIsMaximized(maximized);
      setIsFullscreen(fullscreen);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appWindow]);

  const handleMinimize = () => {
    appWindow.minimize();
  };

  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  };

  const handleFullscreen = async () => {
    const fullscreen = await appWindow.isFullscreen();
    await appWindow.setFullscreen(!fullscreen);
    setIsFullscreen(!fullscreen);
  };

  const handleClose = () => {
    appWindow.close();
  };

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={handleMaximize}
      className="flex items-center justify-between h-10 bg-zinc-950 border-b border-zinc-800 select-none text-zinc-400 font-sans cursor-default"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 pl-4 text-xs font-semibold tracking-wider text-violet-400">
        <svg data-tauri-drag-region className="w-4 h-4 fill-violet-500" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5zm4 4h-2v-2h2v2zm0-4h-2V7h2v5z"/>
        </svg>
        <span data-tauri-drag-region className="font-outfit uppercase">Open Beat</span>
      </div>

      <div className="flex h-full">
        <button
          onClick={handleFullscreen}
          className="flex items-center justify-center w-12 h-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          )}
        </button>
        <button
          onClick={handleMinimize}
          className="flex items-center justify-center w-12 h-full hover:bg-zinc-800 transition-colors"
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleMaximize}
          className="flex items-center justify-center w-12 h-full hover:bg-zinc-800 transition-colors"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          <Square size={12} />
        </button>
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-12 h-full hover:bg-red-600 hover:text-white transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
