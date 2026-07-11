// Lecture thin pour BenchHubPanel — mêmes appels store que l'ancien
// app/bench/page.tsx (server component) : les runs en cours (actifs + en
// pause) et les runs passés (complétés + abandonnés), avec pour chaque run
// passé la présence effective d'un rapport (un run complété avant Task 6
// peut ne pas en avoir — on vérifie plutôt que de supposer).
import { getBenchSession, WS } from "@/lib/session";
import { listRunsOverview, getReport } from "@/lib/bench";

export const runtime = "nodejs";

export async function GET() {
  const { store } = getBenchSession();

  const [active, paused, completed, aborted] = await Promise.all([
    listRunsOverview(store, WS, { status: "active" }),
    listRunsOverview(store, WS, { status: "paused" }),
    listRunsOverview(store, WS, { status: "completed" }),
    listRunsOverview(store, WS, { status: "aborted" }),
  ]);
  const inProgress = [...active, ...paused].sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt));
  const pastRaw = [...completed, ...aborted].sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt));
  const past = await Promise.all(
    pastRaw.map(async (o) => ({ ...o, hasReport: (await getReport(store, o.run.id)) !== null }))
  );

  return Response.json({ inProgress, past });
}
