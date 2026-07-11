"use client";

// Panneau hub Bench — fusion de l'ancien conteneur et du tableau de bord live :
// un seul repère, les runs (en cours et passés). Fetch au montage sur
// /api/bench/runs (mêmes appels store que l'ancien app/bench/page.tsx),
// navigation entre fenêtres via useWindowsContext() au lieu de <Link>.
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
  const [data, setData] = useState<RunsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Fetch pur (pas de setState dedans) : réutilisable au montage et après
  // une mutation (toggle), sans déclencher la règle set-state-in-effect.
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

  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-muted">Loading…</div>;

  return (
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full space-y-8">
      <header className="fade-in">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-3">Bench</p>
            <h1 className="text-3xl font-semibold tracking-tight">Runs at the bench</h1>
          </div>
          <button type="button" onClick={() => open("protocols")} className="btn-accent shrink-0 mt-1">
            Protocols →
          </button>
        </div>
        <p className="text-base text-muted mt-3 max-w-xl" style={{ lineHeight: 1.6 }}>
          Every experiment currently running, plus what already wrapped up. Open one to keep
          going, or activate a protocol from the library to start a new run.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">In progress</h2>
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

      {data.past.length > 0 && (
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
