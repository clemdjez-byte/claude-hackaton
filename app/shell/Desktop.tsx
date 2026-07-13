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
import { GalaxyControlContext, type GalaxyMode, type FocusSource, type FocusRequest } from "./GalaxyControlContext";

// Prénom affiché dans le greeting. En dur pour l'instant (mono-utilisateur) —
// à brancher sur la session quand l'auth existera.
const USER_NAME = "Clément";

export function Desktop() {
  const api = useWindows();
  const { windows, activeId, setLayout } = api;
  const [docCount, setDocCount] = useState<number | null>(null);
  const onGraphLoad = useCallback((n: number) => setDocCount(n), []);
  const [galaxyMode, setGalaxyMode] = useState<GalaxyMode>("ragkg");

  // Pilotage de la galaxie par le chat : « projecteur » sur les sources citées.
  const [galaxyFocus, setGalaxyFocus] = useState<FocusRequest | null>(null);
  const focusToken = useRef(0);
  const setFocus = useCallback((sources: FocusSource[], nodeIds: string[] = []) => {
    focusToken.current += 1;
    setGalaxyFocus({ sources, nodeIds, token: focusToken.current });
  }, []);
  const galaxyControl = useMemo(
    () => ({ mode: galaxyMode, setMode: setGalaxyMode, focus: galaxyFocus, setFocus }),
    [galaxyMode, galaxyFocus, setFocus]
  );

  // Pile des fenêtres réduites (bas droite), déployée en éventail au survol.
  // Ordre stable = ordre du tableau windows (pas le z), pour que la pile ne se
  // réarrange pas quand on survole. Le timer évite le clignotement quand la
  // souris passe d'une vignette à l'autre.
  const minOrder = windows.filter((w) => w.layout === "min").map((w) => w.id);
  // Une fenêtre en plein écran fait passer le dock des réduites en bande basse
  // (elles sont alors cachées derrière le plein écran, accessibles par onglets).
  const hasFull = windows.some((w) => w.layout === "full");
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

  // Onglets affichés dans la barre d'une fenêtre en plein écran. Cliquer bascule
  // vers cette page EN PLEIN ÉCRAN (setLayout("full") passe aussi au premier
  // plan) : c'est ce qui permet d'atteindre une page réduite, sinon cachée
  // derrière le plein écran, en un clic depuis les onglets.
  const tabs = useMemo(
    () => (
      <>
        {windows.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`desktop-tab${w.id === activeId ? " active" : ""}`}
            onClick={() => setLayout(w.id, "full")}
          >
            {w.title}
          </button>
        ))}
      </>
    ),
    [windows, activeId, setLayout]
  );

  return (
    <WindowsContext.Provider value={api}>
      <GalaxyControlContext.Provider value={galaxyControl}>
      <div className="desktop">
        <Galaxy onLoad={onGraphLoad} mode={galaxyMode} />

        <header className="hero">
          <h1 className="greeting">
            Hello <span className="greeting-name">{USER_NAME}</span>
          </h1>
          <p className="greeting-sub">What are you working on today?</p>
        </header>

        <Clock />
        <Toolbar />
        <ZoomDock mode={galaxyMode} onChange={setGalaxyMode} />

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
            hasFull={hasFull}
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
      </GalaxyControlContext.Provider>
    </WindowsContext.Provider>
  );
}
