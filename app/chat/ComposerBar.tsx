"use client";
// Barre de saisie « pilule » partagée par la barre du bureau (ChatDock) et la
// fenêtre de chat, pour qu'elles soient identiques. Contient : la poignée
// optionnelle (3 points), le bouton Tools (menu d'activation manuelle), le champ,
// un raccourci clavier optionnel, et la flèche d'envoi. Purement présentational :
// l'appelant fournit la valeur, l'outil épinglé et le onSubmit.
import { useState, type RefObject } from "react";
import ToolsMenu from "./ToolsMenu";
import { TOOL_LABELS } from "./toolCatalog";

function ToolsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="21" y1="6" x2="14" y2="6" />
      <line x1="10" y1="6" x2="3" y2="6" />
      <line x1="21" y1="12" x2="12" y2="12" />
      <line x1="8" y1="12" x2="3" y2="12" />
      <line x1="21" y1="18" x2="16" y2="18" />
      <line x1="12" y1="18" x2="3" y2="18" />
      <line x1="14" y1="4" x2="14" y2="8" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="16" y1="16" x2="16" y2="20" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// Bulle de discussion : ouvre l'assistant (et son historique) sans taper de question.
function ChatBubbleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export default function ComposerBar({
  value,
  onChange,
  onSubmit,
  selectedTool,
  onPickTool,
  busy = false,
  placeholder = "Ask about a protocol, a run, a deviation…",
  grip = false,
  onOpen,
  hintKbd,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  selectedTool: string | null;
  onPickTool: (name: string | null) => void;
  busy?: boolean;
  placeholder?: string;
  grip?: boolean;
  /** Si fourni, affiche un bouton « ouvrir l'assistant » (ses discussions) sans
   *  avoir à taper une question. Utilisé par la barre du bureau (ChatDock). */
  onOpen?: () => void;
  hintKbd?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  return (
    <form
      className="composer-bar"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {grip && (
        <span className="composer-grip" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      )}

      {onOpen && (
        <button
          type="button"
          className="composer-tools"
          onClick={onOpen}
          title="Open the assistant — your discussions"
          aria-label="Open the assistant"
        >
          <ChatBubbleIcon />
        </button>
      )}

      <div className="relative shrink-0">
        <button
          type="button"
          className={`composer-tools${toolsOpen || selectedTool ? " active" : ""}`}
          onClick={() => setToolsOpen((v) => !v)}
          title="Tools — force a specific tool for the next message"
          aria-label="Tools"
        >
          <ToolsIcon />
        </button>
        {toolsOpen && (
          <ToolsMenu selected={selectedTool} onPick={(name) => onPickTool(name)} onClose={() => setToolsOpen(false)} />
        )}
      </div>

      {selectedTool && (
        <span className="composer-chip">
          <span className="composer-chip-label">{TOOL_LABELS[selectedTool] ?? selectedTool}</span>
          <button type="button" onClick={() => onPickTool(null)} aria-label="Remove pinned tool">
            ✕
          </button>
        </span>
      )}

      <input
        ref={inputRef}
        className="composer-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy}
      />

      {hintKbd && <kbd className="composer-kbd">{hintKbd}</kbd>}

      <button type="submit" className="composer-send" disabled={busy || !value.trim()} aria-label="Send">
        <ArrowIcon />
      </button>
    </form>
  );
}
