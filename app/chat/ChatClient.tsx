"use client";
// Chat "Ask your lab" — composant volontairement minimal : pas de useChat,
// pas de persistance de fil, un lecteur NDJSON maison (même découpe que
// RunConsole côté voix). L'historique vit en mémoire côté client et voyage
// dans chaque requête (YAGNI démo).
import { useRef, useState } from "react";
import { useWindowsContext } from "@/app/shell/WindowsContext";
import type { WindowKind } from "@/app/shell/useWindows";
import { ToolSteps, type ToolStep } from "./ToolSteps";
import { GraphMini, type GraphData, type Triple, type CrossProtocol } from "./GraphMini";
import { useGalaxyControl, type FocusSource } from "@/app/shell/GalaxyControlContext";

type Role = "user" | "assistant";
type SourceHit = { sourceType: string; sourceId: string; score: number; meta?: Record<string, unknown> };
type ChatMessage = {
  role: Role;
  content: string;
  sources?: SourceHit[];
  steps?: ToolStep[];
  graph?: GraphData;
};

const SUGGESTIONS = [
  // Ciblées mais riches : chacune mobilise le graphe et/ou la lecture d'un rapport,
  // sans pousser l'agent à tout explorer (réponses en ~30–60 s).
  "Which failure mode recurs across the most protocols, and what's the mechanism?",
  "Compare quizartinib and gilteritinib potency on MOLM-14, and flag the resistance mechanism behind any failure.",
  "Based on the documented failures, what should I check before my next dose-response run?",
];

/** Fenêtre à ouvrir pour ce type de source, si l'id nécessaire est connu. */
function sourceWindow(hit: SourceHit): { kind: WindowKind; params: Record<string, string> } | null {
  const runId = typeof hit.meta?.runId === "string" ? hit.meta.runId : null;
  switch (hit.sourceType) {
    case "protocol":
      return { kind: "protocol", params: { protocolId: hit.sourceId } };
    case "run":
      return { kind: "run", params: { runId: hit.sourceId } };
    case "report":
      return runId ? { kind: "report", params: { runId } } : null;
    case "evidence":
      return runId ? { kind: "run", params: { runId } } : null;
    default:
      return null;
  }
}

function SourceChip({ hit }: { hit: SourceHit }) {
  const { open } = useWindowsContext();
  const target = sourceWindow(hit);
  const label = `${hit.sourceType}:${hit.sourceId.slice(0, 8)}`;
  const title = `score ${hit.score.toFixed(2)}`;
  if (!target) {
    return (
      <span className="pill opacity-60" title={`${title} — no page for this source`}>
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => open(target.kind, target.params)}
      className="pill accent"
      title={title}
    >
      {label}
    </button>
  );
}

export default function ChatClient() {
  const { setFocus, setMode } = useGalaxyControl();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateMsg, setConsolidateMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Dédoublonnage du knowledge graph à la demande : fusionne les concepts en
  // double (« dose de quizartinib » ⟷ « quizartinib concentration ») pour que
  // les questions transverses relient bien les protocoles. Sûr à relancer.
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

  function dropEmptyAssistantTail(list: ChatMessage[]): ChatMessage[] {
    const last = list[list.length - 1];
    if (last && last.role === "assistant" && !last.content) return list.slice(0, -1);
    return list;
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    setInput("");
    const history: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "", sources: [], steps: [] }]);
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
            continue; // ligne coupée entre deux reads : on l'a déjà bufferisée, on ignore un parse raté isolé
          }
          if (ev.type === "sources") {
            const hits = Array.isArray(ev.hits) ? (ev.hits as SourceHit[]) : [];
            setMessages((ms) => {
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
            setMessages((ms) => {
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
            setMessages((ms) => {
              const next = [...ms];
              const i = next.length - 1;
              next[i] = { ...next[i], steps: [...(next[i].steps ?? []), step] };
              return next;
            });
          } else if (ev.type === "tool_result") {
            const name = String(ev.name ?? "tool");
            const data = (ev.data ?? {}) as Record<string, unknown>;
            setMessages((ms) => {
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
            setMessages((ms) => {
              const next = [...ms];
              const i = next.length - 1;
              next[i] = { ...next[i], content: next[i].content + delta };
              return next;
            });
          } else if (ev.type === "error") {
            setError(String(ev.message ?? "Chat error."));
            setMessages((ms) => dropEmptyAssistantTail(ms));
          }
        }
      }
    } catch {
      setError("Connection to the lab copilot failed. Check the server and try again.");
      setMessages((ms) => dropEmptyAssistantTail(ms));
    } finally {
      setBusy(false);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 sm:px-5">
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
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                m.role === "user" ? "bg-accent text-white" : "card"
              }`}
            >
              {m.role === "assistant" && !!m.steps?.length && <ToolSteps steps={m.steps} />}
              <span className="whitespace-pre-wrap">
                {m.content || (busy && i === messages.length - 1 ? "…" : "")}
              </span>
              {m.role === "assistant" && !!m.sources?.length && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
                  {m.sources.map((h, j) => (
                    <SourceChip key={`${h.sourceType}:${h.sourceId}:${j}`} hit={h} />
                  ))}
                </div>
              )}
              {m.role === "assistant" && m.graph && <GraphMini data={m.graph} />}
            </div>
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
  );
}
