"use client";
// Chat "Ask your lab" — composant NEUF, volontairement minimal (pas le chat
// Sylvy complet) : pas de useChat, pas de persistance de fil, un lecteur
// NDJSON maison (même découpe que RunConsole côté voix). L'historique vit en
// mémoire côté client et voyage dans chaque requête (YAGNI démo).
import Link from "next/link";
import { useRef, useState } from "react";

type Role = "user" | "assistant";
type SourceHit = { sourceType: string; sourceId: string; score: number; meta?: Record<string, unknown> };
type ChatMessage = { role: Role; content: string; sources?: SourceHit[] };

const SUGGESTIONS = [
  "What went wrong in the last run?",
  "Compare the last two runs.",
  "Which deviations should I care about?",
];

/** Page qui existe pour ce type de source, si l'id nécessaire est connu. */
function sourceHref(hit: SourceHit): string | null {
  const runId = typeof hit.meta?.runId === "string" ? hit.meta.runId : null;
  switch (hit.sourceType) {
    case "protocol":
      return `/bench/protocols/${hit.sourceId}`;
    case "run":
      return `/bench/run/${hit.sourceId}`;
    case "report":
      return runId ? `/bench/report/${runId}` : null;
    case "evidence":
      return runId ? `/bench/run/${runId}` : null;
    default:
      return null;
  }
}

function SourceChip({ hit }: { hit: SourceHit }) {
  const href = sourceHref(hit);
  const label = `${hit.sourceType}:${hit.sourceId.slice(0, 8)}`;
  const title = `score ${hit.score.toFixed(2)}`;
  if (!href) {
    return (
      <span className="pill opacity-60" title={`${title} — no page for this source`}>
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className="pill accent" title={title}>
      {label}
    </Link>
  );
}

export default function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    setMessages([...history, { role: "assistant", content: "", sources: [] }]);
    setBusy(true);

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
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-10 sm:px-6">
      <header className="fade-in mb-6">
        <p className="eyebrow">Ask your lab</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Lab copilot</h1>
        <p className="mt-1 text-sm text-muted">
          Answers are grounded in your protocols, runs, evidence, and reports — with sources.
        </p>
      </header>

      <div className="flex-1 space-y-4">
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
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
                m.role === "user" ? "bg-accent text-white" : "card"
              }`}
            >
              {m.content || (busy && i === messages.length - 1 ? "…" : "")}
              {m.role === "assistant" && !!m.sources?.length && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
                  {m.sources.map((h, j) => (
                    <SourceChip key={`${h.sourceType}:${h.sourceId}:${j}`} hit={h} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <div className="card mt-4 border-danger/40 bg-danger/5 p-3 text-sm text-danger">{error}</div>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-4 flex gap-2"
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
