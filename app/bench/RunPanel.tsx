"use client";

// Panneau console de run — fetch au montage sur /api/bench/run/[id]
// (contexte de run + preuves + URLs d'attachement), puis délègue le rendu à
// RunConsole. `reload` remplace le router.refresh() de l'ancien modèle
// serveur : chaque mutation (étape, capture, upload, voix) refetch ce
// contexte pour rester la source de vérité affichée.
import { useCallback, useEffect, useState } from "react";
import type { Evidence } from "@/lib/core";
import type { RunContext } from "@/lib/bench";
import RunConsole from "./RunConsole";

type RunData = { runContext: RunContext; evidence: Evidence[]; attachmentUrls: Record<string, string> };

export default function RunPanel({ runId }: { runId: string }) {
  const [data, setData] = useState<RunData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch pur (pas de setState dedans) : réutilisable au montage et après
  // chaque mutation, sans déclencher la règle set-state-in-effect.
  const fetchRun = useCallback(async (): Promise<RunData> => {
    const res = await fetch(`/api/bench/run/${runId}`);
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(b.error ?? `Error ${res.status}`);
    }
    return (await res.json()) as RunData;
  }, [runId]);

  useEffect(() => {
    let cancelled = false;
    fetchRun()
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load run.");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchRun]);

  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-muted">Loading…</div>;

  return (
    <RunConsole
      runContext={data.runContext}
      evidence={data.evidence}
      attachmentUrls={data.attachmentUrls}
      reload={() => fetchRun().then(setData).catch(() => {})}
    />
  );
}
