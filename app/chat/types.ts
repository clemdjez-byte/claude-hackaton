// app/chat/types.ts — types partagés du chat (message, source, conversation).
export type Role = "user" | "assistant";

export type SourceHit = {
  sourceType: string;
  sourceId: string;
  score: number;
  meta?: Record<string, unknown>;
  label?: string; // dérivé côté serveur (deriveSourceLabel)
};

export type ChatMessage = { role: Role; content: string; sources?: SourceHit[] };

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};
