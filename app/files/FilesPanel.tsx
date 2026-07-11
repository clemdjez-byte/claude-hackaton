"use client";

// Panneau explorateur de fichiers — fetch au montage sur /api/files, deux
// sections (Reports / Protocols), chaque item ouvre la page en fenêtre.
// Un rapport s'ouvre par runId (cf. ReportPanel/getReport), pas par son
// propre id de page — le meta le porte déjà (voir app/api/files/route.ts).
import { useEffect, useState } from "react";
import { useWindowsContext } from "@/app/shell/WindowsContext";

type PageMeta = { id: string; title: string; createdAt: string; type: string; runId?: string };
type FilesResponse = { reports: PageMeta[]; protocols: PageMeta[] };

// Date ISO figée (stockée) → affichage compact et déterministe (pas de tz).
function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export default function FilesPanel() {
  const { open } = useWindowsContext();
  const [data, setData] = useState<FilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/files")
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json() as Promise<FilesResponse>;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load files.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-muted">Loading…</div>;

  return (
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full space-y-8">
      <header className="fade-in">
        <p className="eyebrow mb-3">Files</p>
        <h1 className="text-3xl font-semibold tracking-tight">Reports & protocols</h1>
        <p className="text-base text-muted mt-3 max-w-xl" style={{ lineHeight: 1.6 }}>
          Every page written to this lab — generated reports and saved protocols. Open one to
          view it in a window.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Reports</h2>
        {data.reports.length === 0 ? (
          <p className="text-muted text-sm">No report yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.reports.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={!r.runId}
                onClick={() => r.runId && open("report", { runId: r.runId })}
                className="card card-hover block p-5 fade-up text-left w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <h3 className="font-medium leading-snug">{r.title}</h3>
                <p className="receipt mt-2">{when(r.createdAt)}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Protocols</h2>
        {data.protocols.length === 0 ? (
          <p className="text-muted text-sm">No protocol yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.protocols.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => open("protocol", { protocolId: p.id })}
                className="card card-hover block p-5 fade-up text-left w-full"
              >
                <h3 className="font-medium leading-snug">{p.title}</h3>
                <p className="receipt mt-2">{when(p.createdAt)}</p>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
