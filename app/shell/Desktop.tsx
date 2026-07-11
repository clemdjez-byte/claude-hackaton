"use client";
// Le bureau : monte l'état des fenêtres, le contexte qui l'expose, la pilule
// d'outils, la cartouche chat, et empile les fenêtres ouvertes par-dessus le
// fond. Le fond animé (Galaxy) arrive Task 9 — le hero fait office de fond
// statique en attendant.
import { useWindows } from "./useWindows";
import { WindowsContext } from "./WindowsContext";
import { Window } from "./Window";
import { WindowContent } from "./WindowContent";
import { Toolbar } from "./Toolbar";
import { ChatDock } from "./ChatDock";
// import { Galaxy } from "./Galaxy"; // Task 9

export function Desktop() {
  const api = useWindows();

  const tabs = (
    <>
      {api.windows.map((w) => (
        <button
          key={w.id}
          type="button"
          className={`desktop-tab${w.id === api.activeId ? " active" : ""}`}
          onClick={() => api.focus(w.id)}
        >
          {w.title}
        </button>
      ))}
    </>
  );

  return (
    <WindowsContext.Provider value={api}>
      <div className={`desktop${api.windows.some((w) => w.layout === "full") ? " has-full" : ""}`}>
        {/* <Galaxy /> — Task 9 */}
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
