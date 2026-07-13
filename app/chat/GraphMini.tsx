"use client";
// app/chat/GraphMini.tsx — rend VISIBLE le raisonnement du knowledge graph sous
// une réponse du chat. Deux étages :
//   1. une bannière « facteur d'échec commun » quand le graphe a relié un même
//      paramètre à des échecs dans plusieurs protocoles (le moment « seul le KG
//      sait ça ») ;
//   2. un petit sous-graphe (SVG, layout circulaire déterministe) des relations
//      typées mobilisées pour répondre — même palette que la galaxie.
import { useMemo } from "react";

export type Triple = { relation: string; fromType: string; fromId: string; toType: string; toId: string };
export type CrossProtocol = { paramTypeKey: string; protocolIds: string[]; mechanism: string };
export type GraphData = { crossProtocol: CrossProtocol[]; triples: Triple[]; labels: Record<string, string> };

const MAX_NODES = 14;
const MAX_EDGE_LABELS = 10; // au-delà, on cache les libellés de relation (illisible)
const W = 360;
const H = 220;
const CX = W / 2;
const CY = H / 2;
const R = 82;

function colorFor(type: string): string {
  if (type === "report") return "#FF7FA6"; // rose — un run/rapport (hub d'expérience)
  if (type === "protocol") return "#FF7A2B"; // orange
  return "#14B8A6"; // teal — entité d'ontologie
}

function humanize(id: string): string {
  if (/[./]/.test(id)) return id;
  const s = id.replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
}

function clip(s: string, n = 16): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function GraphMini({ data }: { data: GraphData }) {
  const layout = useMemo(() => {
    const keys: string[] = [];
    const seen = new Set<string>();
    const push = (k: string) => {
      if (!seen.has(k) && keys.length < MAX_NODES) {
        seen.add(k);
        keys.push(k);
      }
    };
    for (const t of data.triples) {
      push(`${t.fromType}:${t.fromId}`);
      push(`${t.toType}:${t.toId}`);
    }
    const pos = new Map<string, { x: number; y: number }>();
    keys.forEach((k, i) => {
      const a = (i / keys.length) * Math.PI * 2 - Math.PI / 2;
      pos.set(k, { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) });
    });
    const edges = data.triples.filter(
      (t) => pos.has(`${t.fromType}:${t.fromId}`) && pos.has(`${t.toType}:${t.toId}`)
    );
    return { keys, pos, edges };
  }, [data]);

  const labelOf = (key: string) => data.labels[key] ?? humanize(key.slice(key.indexOf(":") + 1));
  const typeOf = (key: string) => key.slice(0, key.indexOf(":"));
  const showEdgeLabels = layout.edges.length <= MAX_EDGE_LABELS;

  if (layout.keys.length === 0 && data.crossProtocol.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <p className="mb-1.5 text-[11px] font-medium text-muted">Knowledge graph — how the answer connects</p>

      {data.crossProtocol.map((c, i) => (
        <div
          key={i}
          className="mb-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-[11px] leading-snug"
        >
          <span aria-hidden>⚡ </span>
          <strong>{humanize(c.paramTypeKey)}</strong> is a shared failure factor across{" "}
          {c.protocolIds.length} protocols — {c.mechanism}
        </div>
      ))}

      {layout.keys.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }} role="img" aria-label="knowledge subgraph">
          {layout.edges.map((t, i) => {
            const a = layout.pos.get(`${t.fromType}:${t.fromId}`)!;
            const b = layout.pos.get(`${t.toType}:${t.toId}`)!;
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#14B8A6" strokeOpacity={0.28} strokeWidth={1} />
                {showEdgeLabels && (
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 1}
                    fontSize={7}
                    fill="currentColor"
                    opacity={0.4}
                    textAnchor="middle"
                  >
                    {t.relation}
                  </text>
                )}
              </g>
            );
          })}
          {layout.keys.map((k) => {
            const p = layout.pos.get(k)!;
            const onRight = p.x >= CX;
            return (
              <g key={k}>
                <circle cx={p.x} cy={p.y} r={4} fill={colorFor(typeOf(k))} />
                <text
                  x={p.x + (onRight ? 7 : -7)}
                  y={p.y + 3}
                  fontSize={9}
                  fill="currentColor"
                  opacity={0.75}
                  textAnchor={onRight ? "start" : "end"}
                >
                  {clip(labelOf(k))}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
