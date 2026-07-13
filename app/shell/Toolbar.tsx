"use client";
// Dock vertical flottant, centré à gauche (voir .toolbar / .tbtn dans shell.css).
// Raccourcis : créer un protocole, ouvrir les fichiers, ouvrir le bench, ouvrir MCP.
// Icônes en SVG inline, pas de dépendance d'icon set. Chaque bouton porte un
// tooltip stylé (.tbtn-tip) qui s'affiche à droite au survol.
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

// Prise / hub : un nœud relié à deux autres — évoque le connecteur MCP + le graphe.
function McpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="19" cy="6" r="2.2" />
      <circle cx="19" cy="18" r="2.2" />
      <path d="M7 11 17 7" />
      <path d="M7 13 17 17" />
    </svg>
  );
}

export function Toolbar() {
  const { open } = useWindowsContext();
  return (
    <nav className="toolbar" aria-label="Toolbar">
      <button type="button" className="tbtn" onClick={() => open("import")} aria-label="New protocol">
        <PlusIcon />
        <span className="tbtn-tip">New protocol</span>
      </button>
      <div className="dock-sep" aria-hidden />
      <button type="button" className="tbtn" onClick={() => open("files")} aria-label="Files">
        <FolderIcon />
        <span className="tbtn-tip">Files</span>
      </button>
      <button type="button" className="tbtn" onClick={() => open("bench-hub")} aria-label="Bench">
        <FlaskIcon />
        <span className="tbtn-tip">Bench</span>
      </button>
      <button type="button" className="tbtn" onClick={() => open("mcp")} aria-label="MCP">
        <McpIcon />
        <span className="tbtn-tip">MCP</span>
      </button>
    </nav>
  );
}
