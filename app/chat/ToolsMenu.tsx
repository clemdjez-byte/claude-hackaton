"use client";
// Menu « Tools » (à gauche de la barre de chat) — active MANUELLEMENT un outil,
// à la manière d'un / dans Claude Code. Par défaut c'est l'agent qui choisit ses
// outils ; ici l'utilisateur en épingle un pour le prochain message. Liste
// scrollable, groupée par catégorie (source : toolCatalog).
import { TOOL_CATALOG, TOOL_CATEGORIES } from "./toolCatalog";

export default function ToolsMenu({
  selected,
  onPick,
  onClose,
}: {
  selected: string | null;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Ferme au clic en dehors du menu. */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="card absolute bottom-full left-0 z-50 mb-2 max-h-80 w-72 overflow-y-auto p-2 shadow-xl">
        <p className="px-2 pb-1 text-[11px] text-muted">
          Pick a tool to force it for the next message. Otherwise the agent chooses.
        </p>
        {TOOL_CATEGORIES.map((cat) => {
          const items = TOOL_CATALOG.filter((t) => t.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat} className="mb-1.5 last:mb-0">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{cat}</p>
              {items.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => {
                    onPick(t.name);
                    onClose();
                  }}
                  className={`block w-full rounded-lg px-2 py-1.5 text-left hover:bg-accent/10 ${
                    selected === t.name ? "bg-accent/10" : ""
                  }`}
                >
                  <span className="text-xs font-medium">{t.label}</span>
                  <span className="block text-[10px] text-muted">{t.hint}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
