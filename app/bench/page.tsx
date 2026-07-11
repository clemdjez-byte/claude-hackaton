// Hub Bench — fusion de l'ancien conteneur (app/projects/[id]/bench/page.tsx)
// et du tableau de bord Live experiment (.../live-experiment/page.tsx) : un
// seul repère, la bibliothèque de protocoles + les runs (en cours et passés).
// Pas de segment [id] projet, pas de gate lab (ws fixe, cf. lib/session.ts).
import Link from "next/link";
import { getReport, listRunsOverview } from "@/lib/live-experiment";
import type { RunOverview } from "@/lib/live-experiment";
import { getBenchSession, WS } from "@/lib/session";
import { pauseRunAction, resumeRunAction } from "./actions";

export const dynamic = "force-dynamic";

// Date ISO figée (stockée) → affichage compact et déterministe (pas de tz).
function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function RunCard({ o, hasReport = false }: { o: RunOverview; hasReport?: boolean }) {
  const live = o.run.status === "active" || o.run.status === "paused";
  return (
    <div className="card card-hover p-5 fade-up space-y-3">
      <Link href={`/bench/run/${o.run.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-medium leading-snug">{o.protocolTitle}</h3>
          <span className={`pill shrink-0 ${o.run.status === "active" ? "accent" : ""}`}>
            {o.run.status}
          </span>
        </div>
        <p className="receipt mt-2">
          {o.stepsDone}/{o.stepsTotal} steps · started {when(o.run.startedAt)}
        </p>
      </Link>
      {live && (
        <form action={(o.run.status === "active" ? pauseRunAction : resumeRunAction).bind(null, o.run.id)}>
          <button type="submit" className="chip">
            {o.run.status === "active" ? "Pause" : "Resume"}
          </button>
        </form>
      )}
      {hasReport && (
        <Link href={`/bench/report/${o.run.id}`} className="chip inline-block">
          View report →
        </Link>
      )}
    </div>
  );
}

export default async function BenchPage() {
  const { store } = getBenchSession();

  const [active, paused, completed, aborted] = await Promise.all([
    listRunsOverview(store, WS, { status: "active" }),
    listRunsOverview(store, WS, { status: "paused" }),
    listRunsOverview(store, WS, { status: "completed" }),
    listRunsOverview(store, WS, { status: "aborted" }),
  ]);
  const inProgress = [...active, ...paused].sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt));
  const past = [...completed, ...aborted].sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt));

  // Un run complété a un rapport SAUF s'il a été complété avant l'existence de
  // cette fonctionnalité (Task 6) — on vérifie plutôt que de supposer, pour ne
  // jamais afficher un lien mort.
  const reportedRunIds = new Set(
    (
      await Promise.all(
        completed.map(async (o) => ((await getReport(store, o.run.id)) ? o.run.id : null))
      )
    ).filter((id): id is string => id !== null)
  );

  return (
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full space-y-8">
      <header className="fade-in">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-3">Bench</p>
            <h1 className="text-3xl font-semibold tracking-tight">Runs at the bench</h1>
          </div>
          <Link href="/bench/protocols" className="btn-accent shrink-0 mt-1">
            Protocols →
          </Link>
        </div>
        <p className="text-base text-muted mt-3 max-w-xl" style={{ lineHeight: 1.6 }}>
          Every experiment currently running, plus what already wrapped up. Open one to keep
          going, or activate a protocol from the library to start a new run.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">In progress</h2>
        {inProgress.length === 0 ? (
          <div className="card p-6 fade-up">
            <p className="text-muted text-sm">
              Nothing running yet. Pick a protocol in your library and activate it.
            </p>
            <Link href="/bench/protocols" className="btn-accent inline-block mt-4">
              Open protocols →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {inProgress.map((o) => (
              <RunCard key={o.run.id} o={o} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Past runs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {past.map((o) => (
              <RunCard key={o.run.id} o={o} hasReport={reportedRunIds.has(o.run.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
