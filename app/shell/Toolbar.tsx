"use client";
// Dock vertical flottant, centré à gauche (voir .toolbar / .tbtn dans shell.css).
// Trois raccourcis : créer un protocole, ouvrir les fichiers, ouvrir le bench.
// Icônes en SVG inline, pas de dépendance d'icon set.
import { useWindowsContext } from "./WindowsContext";

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function FlaskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2h6" />
      <path d="M10 2v7L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V2" />
      <path d="M7 14h10" />
    </svg>
  );
}

export function Toolbar() {
  const { open } = useWindowsContext();
  return (
    <nav className="toolbar" aria-label="Toolbar">
      <button type="button" className="tbtn" onClick={() => open("import")} aria-label="New protocol" title="New protocol">
        <PlusIcon />
      </button>
      <div className="dock-sep" aria-hidden />
      <button type="button" className="tbtn" onClick={() => open("files")} aria-label="Files" title="Files">
        <FolderIcon />
      </button>
      <button type="button" className="tbtn" onClick={() => open("bench-hub")} aria-label="Bench" title="Bench">
        <FlaskIcon />
      </button>
    </nav>
  );
}
