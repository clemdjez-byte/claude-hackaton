"use client";
// Barre "Ask Octopus" du bureau — un VRAI composeur : on tape la question et on
// épingle un outil SANS ouvrir l'assistant. Ce n'est qu'à la validation (Entrée
// ou flèche verte) qu'on dépose la question (composer.submit) et que la fenêtre
// de chat s'ouvre pour y répondre — pratique pour composer sans masquer ses
// documents. Masquée quand une fenêtre chat est déjà ouverte.
import { useEffect, useRef, useState } from "react";
import { useWindowsContext } from "./WindowsContext";
import { useChatComposer } from "@/app/chat/ChatComposerContext";
import ComposerBar from "@/app/chat/ComposerBar";

export function ChatDock() {
  const { windows, open } = useWindowsContext();
  const { submit } = useChatComposer();
  const chatOpen = windows.some((w) => w.kind === "chat");
  const [text, setText] = useState("");
  const [tool, setTool] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ⌘K / Ctrl+K : focus la barre du bureau (taper directement, sans ouvrir l'assistant).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSubmit() {
    const q = text.trim();
    if (!q) return;
    submit(q, tool); // dépose la question + ouvre la fenêtre de chat
    setText("");
    setTool(null);
  }

  return (
    <div className={`dock-anchor${chatOpen ? " hidden" : ""}`}>
      <ComposerBar
        value={text}
        onChange={setText}
        onSubmit={handleSubmit}
        selectedTool={tool}
        onPickTool={setTool}
        placeholder="Ask Octopus…"
        grip
        onOpen={() => open("chat")}
        hintKbd="⌘K"
        inputRef={inputRef}
      />
    </div>
  );
}
