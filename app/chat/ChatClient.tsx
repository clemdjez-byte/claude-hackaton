"use client";
// Chat "Ask your lab" — sidebar d'historique (conversations persistées en
// localStorage) + une conversation active. Copilote agentique : l'IA appelle
// des outils (ToolSteps), la galaxie s'illumine sur les entités mobilisées
// (useGalaxyControl) et un mini-graphe résume le sous-graphe (GraphMini). Le
// rendu des réponses — markdown propre + citations numérotées — est délégué à
// AnswerBody. Lecteur NDJSON maison (même découpe que la voix). Le streaming
// vise la conversation capturée au départ, même si l'utilisateur en change.
import { useEffect, useRef, useState } from "react";
import { useGalaxyControl, type FocusSource } from "@/app/shell/GalaxyControlContext";
import { ToolSteps, type ToolStep } from "./ToolSteps";
import { GraphMini, type GraphData, type Triple, type CrossProtocol } from "./GraphMini";
import { useConversations } from "./useConversations";
import ConversationSidebar from "./ConversationSidebar";
import AnswerBody from "./AnswerBody";
import ToolsMenu from "./ToolsMenu";
import { TOOL_LABELS } from "./toolCatalog";
import type { ChatMessage, SourceHit } from "./types";

const SUGGESTIONS = [
  // Ciblées mais riches : chacune mobilise le graphe et/ou la lecture d'un rapport,
  // sans pousser l'agent à tout explorer (réponses en ~30–60 s).
  "Which failure mode recurs across the most protocols, and what's the mechanism?",
  "Compare quizartinib and gilteritinib potency on MOLM-14, and flag the resistance mechanism behind any failure.",
  "Based on the documented failures, what should I check before my next dose-response run?",
];

function dropEmptyAssistantTail(list: ChatMessage[]): ChatMessage[] {
  const last = list[list.length - 1];
  if (last && last.role === "assistant" && !last.content) return list.slice(0, -1);
  return list;
}

export default function ChatClient() {
  const { setFocus, setMode } = useGalaxyControl();
  const { conversations, activeId, active, create, select, remove, updateMessages } = useConversations();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateMsg, setConsolidateMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = active?.messages ?? [];

  // La galaxie suit la conversation : éteinte à l'ouverture et à la fermeture du
  // chat, pour ne pas laisser traîner le focus d'une conversation précédente.
  useEffect(() => {
    setFocus([], []);
    return () => setFocus([], []);
  }, [setFocus]);

  // …et remise à zéro quand on bascule de conversation active (la prochaine
  // réponse la rallumera). On efface aussi l'erreur : elle appartenait à la
  // conversation qu'on vient de quitter, pas à celle qu'on affiche.
  useEffect(() => {
    setFocus([], []);
    setError(null);
  }, [activeId, setFocus]);

  // Dédoublonnage du knowledge graph à la demande : fusionne les concepts en
  // double pour que les questions transverses relient bien les protocoles. Sûr
  // à relancer.
  async function consolidate() {
    if (consolidating) return;
    setConsolidating(true);
    setConsolidateMsg(null);
    try {
      const res = await fetch("/api/kg/consolidate", { method: "POST" });
      const body = (await res.json()) as { merges?: { merged: string[] }[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `status ${res.status}`);
      const groups = body.merges?.length ?? 0;
      const absorbed = body.merges?.reduce((s, m) => s + m.merged.length, 0) ?? 0;
      setConsolidateMsg(
        groups === 0
          ? "Graph already clean — no duplicate concepts found."
          : `Merged ${absorbed} duplicate node${absorbed > 1 ? "s" : ""} into ${groups} concept${groups > 1 ? "s" : ""}.`
      );
    } catch (e) {
      setConsolidateMsg(e instanceof Error ? e.message : "Consolidation failed.");
    } finally {
      setConsolidating(false);
    }
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    setInput("");

    // Cible : conversation active, ou nouvelle si aucune. On garde l'id sous la
    // main pour que le streaming vise CETTE conversation même si l'utilisateur
    // en sélectionne une autre entre-temps.
    let convId = activeId;
    let base: ChatMessage[] = [];
    if (!convId) convId = create();
    else base = messages; // convId === activeId ici → messages = active.messages

    const history: ChatMessage[] = [...base, { role: "user", content: question }];
    updateMessages(convId, () => [...history, { role: "assistant", content: "", sources: [], steps: [] }]);
    setBusy(true);

    // Focus de la galaxie accumulé sur toute la réponse : les documents cités
    // (event `sources`) ET les entités KG mobilisées (event `graph`). Les deux
    // événements arrivent séparément → on rappelle setFocus avec l'union courante.
    let focusSources: FocusSource[] = [];
    let focusNodeIds: string[] = [];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) throw new Error(`status ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const raw = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!raw) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(raw);
          } catch {
            continue; // ligne coupée entre deux reads : on l'a déjà bufferisée
          }
          if (ev.type === "sources") {
            const hits = Array.isArray(ev.hits) ? (ev.hits as SourceHit[]) : [];
            updateMessages(convId, (ms) => {
              const next = [...ms];
              const i = next.length - 1;
              next[i] = { ...next[i], sources: hits };
              return next;
            });
            // Braque le « projecteur » de la galaxie sur les sources citées
            // (en gardant les entités KG déjà reçues via l'event `graph`).
            focusSources = hits.map((h) => ({
              sourceType: h.sourceType,
              sourceId: h.sourceId,
              runId: typeof h.meta?.runId === "string" ? (h.meta.runId as string) : undefined,
            }));
            setFocus(focusSources, focusNodeIds);
          } else if (ev.type === "graph") {
            // Le serveur envoie les faits chiffrés (facts.crossProtocol) + les
            // triplets ouverts + les labels : de quoi dessiner le sous-graphe.
            const facts = (ev.facts ?? {}) as { crossProtocol?: CrossProtocol[] };
            const graph: GraphData = {
              crossProtocol: Array.isArray(facts.crossProtocol) ? facts.crossProtocol : [],
              triples: Array.isArray(ev.triples) ? (ev.triples as Triple[]) : [],
              labels: (ev.labels ?? {}) as Record<string, string>,
            };
            updateMessages(convId, (ms) => {
              const next = [...ms];
              const i = next.length - 1;
              next[i] = { ...next[i], graph };
              return next;
            });
            // Allume aussi les entités du knowledge graph mobilisées : chaque
            // extrémité des triplets est un nœud `type:id` de la galaxie.
            focusNodeIds = [
              ...new Set(
                graph.triples.flatMap((t) => [`${t.fromType}:${t.fromId}`, `${t.toType}:${t.toId}`])
              ),
            ];
            setFocus(focusSources, focusNodeIds);
            // La réponse mobilise le graphe (recoupement inter-protocoles) →
            // révèle les relations en basculant sur la lentille tissée.
            if (graph.crossProtocol.length > 0) setMode("ragkg");
          } else if (ev.type === "tool_call") {
            const step: ToolStep = { name: String(ev.name ?? "tool"), args: ev.args as Record<string, unknown> };
            updateMessages(convId, (ms) => {
              const next = [...ms];
              const i = next.length - 1;
              next[i] = { ...next[i], steps: [...(next[i].steps ?? []), step] };
              return next;
            });
          } else if (ev.type === "tool_result") {
            const name = String(ev.name ?? "tool");
            const data = (ev.data ?? {}) as Record<string, unknown>;
            updateMessages(convId, (ms) => {
              const next = [...ms];
              const i = next.length - 1;
              const steps = [...(next[i].steps ?? [])];
              // Attache le résultat au dernier appel de même nom encore sans résultat.
              for (let j = steps.length - 1; j >= 0; j--) {
                if (steps[j].name === name && steps[j].result === undefined) {
                  steps[j] = { ...steps[j], result: data };
                  break;
                }
              }
              next[i] = { ...next[i], steps };
              return next;
            });
          } else if (ev.type === "text_chunk") {
            const delta = String(ev.delta ?? "");
            updateMessages(convId, (ms) => {
              const next = [...ms];
              const i = next.length - 1;
              next[i] = { ...next[i], content: next[i].content + delta };
              return next;
            });
          } else if (ev.type === "error") {
            setError(String(ev.message ?? "Chat error."));
            updateMessages(convId, dropEmptyAssistantTail);
          }
        }
      }
    } catch {
      setError("Connection to the lab copilot failed. Check the server and try again.");
      updateMessages(convId, dropEmptyAssistantTail);
    } finally {
      setBusy(false);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={select}
        onCreate={create}
        onRemove={remove}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      />

      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5">
        <header className="fade-in mb-3 flex shrink-0 items-start justify-between gap-3">
          <p className="text-xs text-muted">
            Answers are grounded in your protocols, runs, evidence, and reports — with sources.
          </p>
          <button
            type="button"
            className="chip shrink-0"
            onClick={consolidate}
            disabled={consolidating}
            title="Merge duplicate concepts in the knowledge graph so cross-protocol questions link up"
          >
            {consolidating ? "Consolidating…" : "Consolidate graph"}
          </button>
        </header>
        {consolidateMsg && <p className="mb-2 shrink-0 text-xs text-muted">{consolidateMsg}</p>}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 fade-up">
              {SUGGESTIONS.map((q) => (
                <button key={q} type="button" className="chip" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex fade-up ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "user" ? (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-accent px-4 py-3 text-sm text-white">
                  {m.content}
                </div>
              ) : (
                <div className="card max-w-[85%] rounded-2xl px-4 py-3 text-sm">
                  {!!m.steps?.length && <ToolSteps steps={m.steps} />}
                  {m.content ? (
                    <AnswerBody content={m.content} sources={m.sources} />
                  ) : busy && i === messages.length - 1 ? (
                    "…"
                  ) : (
                    ""
                  )}
                  {m.graph && <GraphMini data={m.graph} />}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="card mt-4 shrink-0 border-danger/40 bg-danger/5 p-3 text-sm text-danger">{error}</div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-3 flex shrink-0 gap-2"
        >
          <input
            className="input-field flex-1 px-4 py-2.5 text-sm"
            placeholder="Ask about a protocol, a run, a deviation…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
          <button type="submit" className="btn-accent shrink-0" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
