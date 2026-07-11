"use client";
// Le bureau : monte l'état des fenêtres, le contexte qui l'expose, le fond
// navigable (Galaxy), la pilule d'outils, la cartouche chat, et empile les
// fenêtres ouvertes par-dessus le tout.
import { useMemo } from "react";
import { useWindows } from "./useWindows";
import { WindowsContext } from "./WindowsContext";
import { Window } from "./Window";
import { WindowContent } from "./WindowContent";
import { Toolbar } from "./Toolbar";
import { ChatDock } from "./ChatDock";
import { Galaxy } from "./Galaxy";

export function Desktop() {
  const api = useWindows();
  const { windows, activeId, focus } = api;

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
        <Galaxy />
        <div className="hero">
          <p className="eyebrow">Octopus — wet lab OS</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            From protocol to auditable report, by voice.
          </h1>
        </div>
        <Toolbar />
        <ChatDock />
        {api.windows.map((w) => (
          <Window
            key={w.id}
            win={w}
            active={w.id === api.activeId}
            tabs={tabs}
            onFocus={() => api.focus(w.id)}
            onClose={() => api.close(w.id)}
            onFullscreen={() => api.toggleFullscreen(w.id)}
            onRectCommit={(rect) => api.setRect(w.id, rect)}
          >
            <WindowContent win={w} />
          </Window>
        ))}
      </div>
    </WindowsContext.Provider>
  );
}
