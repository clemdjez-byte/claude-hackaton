"use client";
import { useState, useTransition } from "react";
import { memorySearchAction } from "../actions";
import { Card, Eyebrow, btn } from "../ui";

type Hit = { id: string; type: string; text: string; score: number };

const PRESETS = [
  "runs où l'hybridation a dévié",
  "incubation prolongée",
  "NTC oublié",
];

export function MemorySearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [pending, start] = useTransition();

  function run(query: string) {
    setQ(query);
    start(async () => setHits(await memorySearchAction(query)));
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run(q)}
          placeholder="Montre-moi les runs où…"
          className="flex-1 rounded-lg border border-sy-line bg-sy-cream px-4 py-2.5 text-sm outline-none focus:border-sy-ink"
        />
        <button onClick={() => run(q)} disabled={pending || !q.trim()} className={btn.primary}>
          {pending ? "…" : "Chercher"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => run(p)}
            className="rounded-full border border-sy-line bg-sy-cream-2 px-3 py-1 text-xs text-sy-ink-muted hover:text-sy-ink"
          >
            {p}
          </button>
        ))}
      </div>

      {hits && (
        <div className="mt-6 space-y-3">
          {hits.length === 0 && <p className="text-sm text-sy-ink-muted">Aucun résultat.</p>}
          {hits.map((h) => (
            <Card key={h.id}>
              <div className="flex items-center justify-between">
                <Eyebrow>{h.type} · {h.id}</Eyebrow>
                <span className="font-mono text-xs text-sy-ink-muted">score {h.score}</span>
              </div>
              <p className="mt-2 text-sm text-sy-ink">{h.text}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
