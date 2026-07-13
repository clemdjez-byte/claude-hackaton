// app/chat/types.ts — types partagés du chat (message, source, conversation).
// steps/graph proviennent du copilote agentique (appels d'outils + mini-graphe) :
// le type message est unifié pour que les conversations persistées les portent.
import type { ToolStep } from "./ToolSteps";
import type { GraphData } from "./GraphMini";

export type Role = "user" | "assistant";

export type SourceHit = {
  sourceType: string;
  sourceId: string;
  score: number;
  meta?: Record<string, unknown>;
  label?: string; // dérivé côté serveur (deriveSourceLabel)
};

export type ChatMessage = {
  role: Role;
  content: string;
  sources?: SourceHit[];
  steps?: ToolStep[]; // étapes d'outils du copilote agentique
  graph?: GraphData; // sous-graphe KG mobilisé par la réponse
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};
