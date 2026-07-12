"use client";

// Panneau fiche protocole — fetch au montage sur /api/bench/protocol/[id]
// (protocole + draft_doc, avec backfill lazy côté endpoint), puis délègue le
// rendu à ProtocolDocEditor.
import { useEffect, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { Protocol } from "@/lib/core/types";
import ProtocolDocEditor from "./ProtocolDocEditor";

type ProtocolData = { protocol: Protocol; initialDoc: JSONContent };

export default function ProtocolPanel({ pageId }: { pageId: string }) {
  const [data, setData] = useState<ProtocolData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bench/protocol/${pageId}`)
      .then(async (res) => {
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `Error ${res.status}`);
        }
        return res.json() as Promise<ProtocolData>;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load protocol.");
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-muted">Loading…</div>;

  return <ProtocolDocEditor protocol={data.protocol} initialDoc={data.initialDoc} />;
}
