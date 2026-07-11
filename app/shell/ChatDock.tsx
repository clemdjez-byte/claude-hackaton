"use client";
// Cartouche "Ask your lab" en bas de l'écran (.entry dans shell.css) — un
// simple bouton qui ouvre la fenêtre chat. Masqué dès qu'une fenêtre chat
// est déjà ouverte (pas de doublon avec la barre de titre de la fenêtre).
import { useWindowsContext } from "./WindowsContext";

function AskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a8 8 0 0 0-8 8 7.9 7.9 0 0 0 1.5 4.7L4 21l5.5-1.4A8 8 0 1 0 12 3Z" />
    </svg>
  );
}

export function ChatDock() {
  const { windows, open } = useWindowsContext();
  const chatOpen = windows.some((w) => w.kind === "chat");
  return (
    <button
      type="button"
      className={`entry${chatOpen ? " entry-hidden" : ""}`}
      onClick={() => open("chat")}
    >
      <AskIcon />
      <span className="flex-1 text-left text-sm text-muted">Ask your lab…</span>
    </button>
  );
}
