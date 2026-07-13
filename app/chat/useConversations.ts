"use client";
// app/chat/useConversations.ts
// Conversations persistées en localStorage : liste + conversation active, avec
// transitions pures (testables) pour le titre auto et la sélection après
// suppression. Un seul objet d'état {list, activeId} pour éviter les closures
// périmées pendant le streaming.
import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, Conversation } from "./types";

const KEY = "octopus.chat.conversations";

/** Titre auto = première question de l'utilisateur, tronquée. */
export function titleFromMessages(messages: ChatMessage[], max = 40): string {
  const text = messages.find((m) => m.role === "user")?.content.trim() ?? "";
  if (!text) return "New discussion";
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

/** Active à retenir après suppression de `removedId`. `list` = état AVANT
 *  suppression. Supprimer une conv non active ne change rien ; supprimer
 *  l'active retient la voisine précédente (ou la première restante), ou null. */
export function nextActiveId(list: Conversation[], removedId: string, activeId: string): string | null {
  if (removedId !== activeId) return activeId;
  const idx = list.findIndex((c) => c.id === removedId);
  const remaining = list.filter((c) => c.id !== removedId);
  if (remaining.length === 0) return null;
  return (remaining[idx - 1] ?? remaining[0]).id;
}

type State = { list: Conversation[]; activeId: string | null };

function load(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Conversation[]) : [];
  } catch {
    return [];
  }
}

function save(list: Conversation[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota plein / stockage désactivé : on n'échoue pas l'UI */
  }
}

/** Recalcule titre + updatedAt d'une conversation dont les messages changent. */
function withMessages(c: Conversation, messages: ChatMessage[]): Conversation {
  return {
    ...c,
    messages,
    updatedAt: Date.now(),
    title: c.title === "New discussion" ? titleFromMessages(messages) : c.title,
  };
}

export function useConversations() {
  const [state, setState] = useState<State>({ list: [], activeId: null });
  const [ready, setReady] = useState(false);

  // Hydratation client-only (évite tout mismatch SSR).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const list = load();
      setState({ list, activeId: list[0]?.id ?? null });
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persistance après hydratation.
  useEffect(() => {
    if (ready) save(state.list);
  }, [state.list, ready]);

  const create = useCallback((): string => {
    const id = crypto.randomUUID();
    const conv: Conversation = { id, title: "New discussion", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setState((s) => ({ list: [conv, ...s.list], activeId: id }));
    return id;
  }, []);

  const select = useCallback((id: string) => {
    setState((s) => ({ ...s, activeId: id }));
  }, []);

  const remove = useCallback((id: string) => {
    setState((s) => {
      if (!s.list.some((c) => c.id === id)) return s; // id déjà absent : no-op
      return {
        list: s.list.filter((c) => c.id !== id),
        activeId: s.activeId === null ? null : nextActiveId(s.list, id, s.activeId),
      };
    });
  }, []);

  const updateMessages = useCallback((id: string, fn: (prev: ChatMessage[]) => ChatMessage[]) => {
    setState((s) => ({
      ...s,
      list: s.list.map((c) => (c.id === id ? withMessages(c, fn(c.messages)) : c)),
    }));
  }, []);

  const active = state.list.find((c) => c.id === state.activeId) ?? null;

  return { conversations: state.list, activeId: state.activeId, active, ready, create, select, remove, updateMessages };
}
