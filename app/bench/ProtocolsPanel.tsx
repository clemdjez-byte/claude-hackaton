"use client";

// Panneau bibliothèque de protocoles — fetch au montage sur
// /api/bench/protocols (amorçage du protocole de référence côté endpoint si
// la bibliothèque est vide), puis délègue le rendu à ProtocolsClient.
import { useEffect, useState } from "react";
import type { Protocol } from "@/lib/core/types";
import ProtocolsClient from "./ProtocolsClient";

export default function ProtocolsPanel() {
  const [protocols, setProtocols] = useState<Protocol[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bench/protocols")
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json() as Promise<{ protocols: Protocol[] }>;
      })
      .then((body) => {
        if (!cancelled) setProtocols(body.protocols);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load protocols.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!protocols) return <div className="p-6 text-sm text-muted">Loading…</div>;

  return <ProtocolsClient protocols={protocols} />;
}
