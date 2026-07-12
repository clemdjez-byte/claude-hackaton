"use client";
// Le bureau : monte l'état des fenêtres, le contexte qui l'expose, le fond
// navigable (Galaxy), le dock d'outils, la barre Ask, l'accueil éditorial
// (greeting + horloge + compteur de documents), et empile les fenêtres
// ouvertes par-dessus le tout.
import { useCallback, useMemo, useRef, useState } from "react";
import { useWindows } from "./useWindows";
import { WindowsContext } from "./WindowsContext";
import { Window } from "./Window";
import { WindowContent } from "./WindowContent";
import { Toolbar } from "./Toolbar";
import { ChatDock } from "./ChatDock";
import { Clock } from "./Clock";
import { Galaxy } from "./Galaxy";
import { ZoomDock } from "./ZoomDock";

// Prénom affiché dans le greeting. En dur pour l'instant (mono-utilisateur) —
// à brancher sur la session quand l'auth existera.
const USER_NAME = "Clément";

export function Desktop() {
  const api = useWindows();
  const { windows, activeId, focus } = api;
  const [docCount, setDocCount] = useState<number | null>(null);
  const onGraphLoad = useCallback((n: number) => setDocCount(n), []);

  // Pile des fenêtres réduites (bas droite), déployée en éventail au survol.
  // Ordre stable = ordre du tableau windows (pas le z), pour que la pile ne se
  // réarrange pas quand on survole. Le timer évite le clignotement quand la
  // souris passe d'une vignette à l'autre.
  const minOrder = windows.filter((w) => w.layout === "min").map((w) => w.id);
  const [dockOpen, setDockOpen] = useState(false);
  const dockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openDock = useCallback(() => {
    if (dockTimer.current) clearTimeout(dockTimer.current);
    dockTimer.current = null;
    setDockOpen(true);
  }, []);
  const closeDock = useCallback(() => {
    if (dockTimer.current) clearTimeout(dockTimer.current);
    dockTimer.current = setTimeout(() => setDockOpen(false), 180);
  }, []);

  const tabs = useMemo(
    () => (
      <>
        {windows.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`desktop-tab${w.id === activeId ? " active" : ""}`}
            onClick={() => focus(w.id)}
          >
            {w.title}
          </button>
        ))}
      </>
    ),
    [windows, activeId, focus]
  );

  return (
    <WindowsContext.Provider value={api}>
      <div className="desktop">
        <Galaxy onLoad={onGraphLoad} />

        <header className="hero">
          <h1 className="greeting">
            Hello <span className="greeting-name">{USER_NAME}</span>
          </h1>
          <p className="greeting-sub">What are you working on today?</p>
        </header>

        <Clock />
        <Toolbar />
        <ZoomDock />

        <div className="graph-stats" aria-hidden>
          <span className="graph-stats-label">Knowledge graph</span>
          <span className="graph-stats-count">
            {docCount === null ? "…" : `${docCount} document${docCount === 1 ? "" : "s"}`}
          </span>
        </div>

        <ChatDock />

        {api.windows.map((w) => (
          <Window
            key={w.id}
            win={w}
            active={w.id === api.activeId}
            tabs={tabs}
            minIndex={w.layout === "min" ? minOrder.indexOf(w.id) : 0}
            dockOpen={dockOpen}
            onFocus={() => api.focus(w.id)}
            onClose={() => api.close(w.id)}
            onSetLayout={(layout) => api.setLayout(w.id, layout)}
            onRectCommit={(rect) => api.setRect(w.id, rect)}
            onDockEnter={openDock}
            onDockLeave={closeDock}
          >
            <WindowContent win={w} />
          </Window>
        ))}
      </div>
    </WindowsContext.Provider>
  );
}
