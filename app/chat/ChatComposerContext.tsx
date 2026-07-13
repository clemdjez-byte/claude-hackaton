"use client";
// Pont entre la barre du bureau (ChatDock) et la fenêtre de chat. On tape dans la
// barre du bureau SANS ouvrir l'assistant ; à l'envoi, on dépose une question
// « en attente » et on ouvre la fenêtre — le ChatClient la consomme et lance la
// réponse. Objectif : composer une question (et épingler un outil) tout en
// gardant ses documents visibles ; l'assistant ne s'ouvre qu'à la validation.
import { createContext, useContext } from "react";

export type PendingChat = { text: string; tool: string | null; token: number };

export type ChatComposer = {
  pending: PendingChat | null;
  /** Dépose une question à envoyer + ouvre la fenêtre de chat. */
  submit: (text: string, tool: string | null) => void;
  /** À appeler par le ChatClient une fois la question consommée. */
  consume: () => void;
};

const NOOP: ChatComposer = { pending: null, submit: () => {}, consume: () => {} };

export const ChatComposerContext = createContext<ChatComposer>(NOOP);

export function useChatComposer(): ChatComposer {
  return useContext(ChatComposerContext);
}
