import { getCurrentWindow } from "@tauri-apps/api/window";

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
}

export function Titlebar({ isDark, onToggleTheme }: Props) {
  const appWindow = getCurrentWindow();

  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = () => appWindow.toggleMaximize();
  const handleClose = () => appWindow.close();

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start drag if clicking directly on the titlebar, not on buttons
    if (e.target === e.currentTarget) {
      e.preventDefault();
      appWindow.startDragging();
    }
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-9 flex items-center justify-between px-3 bg-surface-2 dark:bg-dark-2 border-b border-surface-border dark:border-dark-border select-none cursor-default"
    >
      {/* Window controls (macOS style - left side) */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleClose}
          className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-90 border-none p-0 cursor-pointer transition-all"
          title="Close"
        />
        <button
          onClick={handleMinimize}
          className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-90 border-none p-0 cursor-pointer transition-all"
          title="Minimize"
        />
        <button
          onClick={handleMaximize}
          className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-90 border-none p-0 cursor-pointer transition-all"
          title="Maximize"
        />
      </div>

      {/* Title - also draggable */}
      <span
        onMouseDown={(e) => {
          e.preventDefault();
          appWindow.startDragging();
        }}
        className="text-sm font-medium text-text-secondary dark:text-text-dark-secondary cursor-default"
      >
        Inkless
      </span>

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        className="w-6 h-6 flex items-center justify-center rounded-md bg-transparent hover:bg-surface-3 dark:hover:bg-dark-3 border-none p-0 cursor-pointer transition-all text-text-secondary"
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
    </div>
  );
}
