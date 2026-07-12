"use client";
// Barre "Ask" en bas de l'écran (.entry dans shell.css) — visuellement un champ,
// mais c'est un bouton qui ouvre la fenêtre chat. Masqué dès qu'une fenêtre chat
// est déjà ouverte (pas de doublon avec la barre de titre de la fenêtre).
// ⌘K / Ctrl+K ouvre aussi le chat depuis n'importe où sur le bureau.
import { useEffect } from "react";
import { useWindowsContext } from "./WindowsContext";

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ChatDock() {
  const { windows, open } = useWindowsContext();
  const chatOpen = windows.some((w) => w.kind === "chat");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open("chat");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <button
      type="button"
      className={`entry${chatOpen ? " entry-hidden" : ""}`}
      onClick={() => open("chat")}
    >
      <span className="entry-grip" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span className="entry-placeholder">Ask Octopus…</span>
      <kbd className="entry-kbd">⌘K</kbd>
      <span className="entry-send" aria-hidden>
        <ArrowIcon />
      </span>
    </button>
  );
}
