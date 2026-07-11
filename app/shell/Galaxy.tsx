"use client";
// app/shell/Galaxy.tsx — fond décoratif ET navigable du bureau. Fetch
// /api/galaxy (nœuds pages/runs + arêtes du graphe de connaissances),
// dispose les nœuds via layoutNodes (déterministe, testé), dessine en canvas
// 2D pur (aucune dépendance externe). Survol = highlight + étiquette ;
// clic = ouvre la fenêtre correspondante via le contexte fenêtres.
import { useEffect, useRef, useState } from "react";
import { useWindowsContext } from "./WindowsContext";
import { layoutNodes, type GNode, type GEdge, type PositionedNode } from "./galaxy-layout";

type GalaxyResponse = { nodes: GNode[]; edges: GEdge[] };

const NODE_RADIUS: Record<GNode["kind"], number> = { protocol: 7, run: 5.5, report: 4 };
// Rayon de détection souris en px écran — plus généreux que le point dessiné
// (les points sont petits, il faut de la marge pour les viser au clic).
const HIT_RADIUS = 14;

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function Galaxy() {
  const { open } = useWindowsContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<GalaxyResponse | null>(null);

  // Fetch une fois au montage — décoratif : un échec laisse simplement la
  // galaxie vide, il ne doit jamais casser le reste du bureau.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/galaxy")
      .then((res) => (res.ok ? (res.json() as Promise<GalaxyResponse>) : Promise.reject(new Error(`Error ${res.status}`))))
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        /* best-effort — pas de galaxie plutôt qu'un bureau cassé */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodeColor: Record<GNode["kind"], string> = {
      protocol: cssVar("--oct-forest", "#0A4F26"),
      run: cssVar("--oct-aqua", "#0F9DAE"),
      report: cssVar("--oct-leaf", "#7FE0A3"),
    };
    const labelColor = cssVar("--foreground", "#1E1E1E");

    const positioned = layoutNodes(data.nodes);
    const byId = new Map(positioned.map((n) => [n.id, n]));

    let hovered: PositionedNode | null = null;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let scale = 1;

    // Rayon max occupé par la disposition (anneau des rapports normalement) →
    // le facteur d'échelle fait tenir la galaxie dans ~85 % du plus petit
    // côté de l'écran, quelle que soit la taille de la fenêtre.
    function computeScale() {
      const maxR = Math.max(1, ...positioned.map((p) => Math.hypot(p.x, p.y)));
      scale = (Math.min(width, height) * 0.42) / maxR;
    }

    function project(n: PositionedNode): { px: number; py: number } {
      return { px: width / 2 + n.x * scale, py: height / 2 + n.y * scale };
    }

    function draw() {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);

      ctx!.strokeStyle = "rgba(30, 30, 30, 0.08)";
      ctx!.lineWidth = 1;
      for (const e of data!.edges) {
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        if (!from || !to) continue;
        const a = project(from);
        const b = project(to);
        ctx!.beginPath();
        ctx!.moveTo(a.px, a.py);
        ctx!.lineTo(b.px, b.py);
        ctx!.stroke();
      }

      for (const n of positioned) {
        const { px, py } = project(n);
        const isHovered = hovered?.id === n.id;
        const r = NODE_RADIUS[n.kind] * (isHovered ? 1.6 : 1);
        ctx!.beginPath();
        ctx!.arc(px, py, r, 0, Math.PI * 2);
        ctx!.fillStyle = nodeColor[n.kind];
        ctx!.globalAlpha = isHovered ? 1 : 0.75;
        ctx!.fill();
        ctx!.globalAlpha = 1;

        if (isHovered) {
          ctx!.font = "500 13px system-ui, sans-serif";
          ctx!.fillStyle = labelColor;
          ctx!.fillText(n.label, px + r + 8, py + 4);
        }
      }
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      computeScale();
      draw();
    }

    function nodeAt(clientX: number, clientY: number): PositionedNode | null {
      const rect = canvas!.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      let best: PositionedNode | null = null;
      let bestDist = HIT_RADIUS;
      for (const n of positioned) {
        const { px, py } = project(n);
        const d = Math.hypot(px - x, py - y);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
      }
      return best;
    }

    function onMove(e: MouseEvent) {
      const hit = nodeAt(e.clientX, e.clientY);
      if (hit?.id !== hovered?.id) {
        hovered = hit;
        canvas!.style.cursor = hit ? "pointer" : "default";
        draw();
      }
    }

    function onClick(e: MouseEvent) {
      const hit = nodeAt(e.clientX, e.clientY);
      if (hit) open(hit.kind, hit.params);
    }

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [data, open]);

  return <canvas ref={canvasRef} className="galaxy" />;
}
