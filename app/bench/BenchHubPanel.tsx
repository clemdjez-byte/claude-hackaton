"use client";

// Panneau Bench — deux vues internes :
//  · "hub"  : menu d'entrée (Protocols, Live experiment) + modules à venir.
//  · "runs" : le tableau de bord des runs (en cours + passés), atteint depuis
//             la carte "Live experiment". Retour via "← Back to bench".
// Fetch au montage sur /api/bench/runs (mêmes appels store que l'ancien
// app/bench/page.tsx), navigation entre fenêtres via useWindowsContext().
import { useCallback, useEffect, useState, useTransition } from "react";
import { useWindowsContext } from "@/app/shell/WindowsContext";
import type { RunOverview } from "@/lib/bench";
import { pauseRunAction, resumeRunAction } from "./actions";

type PastRun = RunOverview & { hasReport: boolean };
type RunsResponse = { inProgress: RunOverview[]; past: PastRun[] };

// Date ISO figée (stockée) → affichage compact et déterministe (pas de tz).
function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function ArrowRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function RunCard({
  o,
  hasReport = false,
  pending,
  onOpenRun,
  onOpenReport,
  onToggle,
}: {
  o: RunOverview;
  hasReport?: boolean;
  pending: boolean;
  onOpenRun: () => void;
  onOpenReport: () => void;
  onToggle: () => void;
}) {
  const live = o.run.status === "active" || o.run.status === "paused";
  return (
    <div className="card card-hover p-5 fade-up space-y-3">
      <button type="button" onClick={onOpenRun} className="block text-left w-full">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-medium leading-snug">{o.protocolTitle}</h3>
          <span className={`pill shrink-0 ${o.run.status === "active" ? "accent" : ""}`}>
            {o.run.status}
          </span>
        </div>
        <p className="receipt mt-2">
          {o.stepsDone}/{o.stepsTotal} steps · started {when(o.run.startedAt)}
        </p>
      </button>
      {live && (
        <button type="button" disabled={pending} onClick={onToggle} className="chip disabled:opacity-50">
          {o.run.status === "active" ? "Pause" : "Resume"}
        </button>
      )}
      {hasReport && (
        <button type="button" onClick={onOpenReport} className="chip inline-block">
          View report →
        </button>
      )}
    </div>
  );
}

export default function BenchHubPanel() {
  const { open } = useWindowsContext();
  const [view, setView] = useState<"hub" | "runs">("hub");
  const [data, setData] = useState<RunsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fetchRuns = useCallback(async (): Promise<RunsResponse> => {
    const res = await fetch("/api/bench/runs");
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return (await res.json()) as RunsResponse;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchRuns()
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load runs.");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchRuns]);

  function toggle(o: RunOverview) {
    start(async () => {
      if (o.run.status === "active") await pauseRunAction(o.run.id);
      else await resumeRunAction(o.run.id);
      setData(await fetchRuns());
    });
  }

  // ---------- Vue "runs" : Live experiment ----------
  if (view === "runs") {
    return (
      <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full space-y-8">
        <button
          type="button"
          onClick={() => setView("hub")}
          className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-foreground transition-colors fade-in"
        >
          ← Back to bench
        </button>

        <header className="fade-in">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight">Runs in progress</h1>
            </div>
            <button type="button" onClick={() => open("protocols")} className="btn-accent shrink-0 mt-1">
              New experiment →
            </button>
          </div>
        </header>

        {error && <p className="text-sm text-danger">{error}</p>}
        {!data && !error && <p className="text-sm text-muted">Loading…</p>}

        {data && (
          <section className="space-y-3">
            {data.inProgress.length === 0 ? (
              <div className="card p-6 fade-up">
                <p className="text-muted text-sm">
                  Nothing running yet. Pick a protocol in your library and activate it.
                </p>
                <button type="button" onClick={() => open("protocols")} className="btn-accent inline-block mt-4">
                  Open protocols →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.inProgress.map((o) => (
                  <RunCard
                    key={o.run.id}
                    o={o}
                    pending={pending}
                    onOpenRun={() => open("run", { runId: o.run.id })}
                    onOpenReport={() => open("report", { runId: o.run.id })}
                    onToggle={() => toggle(o)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {data && data.past.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">Past runs</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.past.map((o) => (
                <RunCard
                  key={o.run.id}
                  o={o}
                  hasReport={o.hasReport}
                  pending={pending}
                  onOpenRun={() => open("run", { runId: o.run.id })}
                  onOpenReport={() => open("report", { runId: o.run.id })}
                  onToggle={() => toggle(o)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ---------- Vue "hub" : menu d'entrée ----------
  const activeCount = data?.inProgress.length ?? 0;
  return (
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full space-y-8">
      <h1 className="text-4xl font-semibold tracking-tight fade-in">Bench</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 fade-up">
        <button type="button" onClick={() => open("protocols")} className="bench-tile">
          <span className="bench-tile-title">Protocols</span>
          <ArrowRight />
        </button>
        <button type="button" onClick={() => setView("runs")} className="bench-tile">
          <span className="bench-tile-title">
            Live experiment
            {activeCount > 0 && <span className="bench-tile-badge">{activeCount}</span>}
          </span>
          <ArrowRight />
        </button>
      </div>

      <div className="card p-6 fade-up">
        <p className="eyebrow mb-4">Coming soon</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 max-w-md">
          {["Samples", "Chemicals", "Machines"].map((m) => (
            <span key={m} className="flex items-center gap-3 text-base">
              <span className="bench-soon-dot" />
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
