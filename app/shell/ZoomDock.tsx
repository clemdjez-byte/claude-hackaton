"use client";
// Dock vertical droit — contrôle de vue du graphe de connaissances (screen
// accueil). Visuel uniquement pour l'instant : le graphe est statique, donc les
// paliers de zoom / lecture ne sont pas encore câblés (title "bientôt"). La
// silhouette (fit → niveaux 2/1/0 → dispersion → pause) reprend la maquette.
function FitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="7" r="2" />
      <circle cx="17" cy="6" r="2" />
      <circle cx="13" cy="17" r="2" />
      <path d="M8 8l7 7M8 7.5l8-1" />
    </svg>
  );
}

function ScatterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="6" cy="7" r="1.6" />
      <circle cx="13" cy="5" r="1.6" />
      <circle cx="18" cy="10" r="1.6" />
      <circle cx="8" cy="14" r="1.6" />
      <circle cx="15" cy="17" r="1.6" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

export function ZoomDock() {
  return (
    <nav className="zoomdock" aria-label="Graph view" title="Graph view (bientôt)">
      <span className="zbtn" aria-hidden>
        <FitIcon />
      </span>
      <div className="dock-sep" aria-hidden />
      <span className="zbtn zlevel" aria-hidden>2</span>
      <span className="zbtn zlevel" aria-hidden>1</span>
      <span className="zbtn zlevel active" aria-hidden>0</span>
      <div className="dock-sep" aria-hidden />
      <span className="zbtn" aria-hidden>
        <ScatterIcon />
      </span>
      <span className="zbtn" aria-hidden>
        <PauseIcon />
      </span>
    </nav>
  );
}
