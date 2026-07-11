"use client";
// Pilule verticale flottante (voir .toolbar / .tbtn dans shell.css) — quatre
// raccourcis qui ouvrent une fenêtre via le contexte. Icônes en SVG inline,
// pas de dépendance d'icon set.
import { useWindowsContext } from "./WindowsContext";

function BenchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2h6" />
      <path d="M10 2v7L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V2" />
      <path d="M7 14h10" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function NewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Toolbar() {
  const { open } = useWindowsContext();
  return (
    <nav className="toolbar" aria-label="Toolbar">
      <button type="button" className="tbtn" onClick={() => open("bench-hub")} aria-label="Bench" title="Bench">
        <BenchIcon />
      </button>
      <button type="button" className="tbtn" onClick={() => open("files")} aria-label="Files" title="Files">
        <FilesIcon />
      </button>
      <button type="button" className="tbtn" onClick={() => open("import")} aria-label="New protocol" title="New protocol">
        <NewIcon />
      </button>
      <button type="button" className="tbtn" onClick={() => open("settings")} aria-label="Settings" title="Settings">
        <SettingsIcon />
      </button>
    </nav>
  );
}
