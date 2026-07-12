"use client";
// app/shell/Galaxy.tsx — fond décoratif ET navigable du bureau : galaxie 3D de
// points. Fetch /api/galaxy (nœuds + arêtes, chacun avec deux positions 3D :
// `pos` sémantique / `posKg` topologique), rend en canvas 2D pur (aucune
// dépendance, pas de WebGL) via une boucle d'animation qui fait tourner la
// galaxie et projette les points (rotation + perspective, profondeur = taille +
// opacité, aucun glow — hors-marque). Trois modes pilotés par `mode` :
//   - "rag"   : positions sémantiques, arêtes cachées
//   - "ragkg" : positions sémantiques + arêtes du knowledge graph
//   - "kg"    : positions topologiques (le graphe pour lui-même) + arêtes
// Le changement de mode anime un morph (~0,5 s) des positions et un fondu des
// arêtes. Survol = titre + surbrillance ; drag = orbite ; clic = ouvre le doc.
import { useEffect, useRef, useState } from "react";
import { useWindowsContext } from "./WindowsContext";
import type { GEdge, GNode3D, Vec3 } from "./galaxy-layout";

export type GalaxyMode = "rag" | "ragkg" | "kg";
type GalaxyResponse = { nodes: GNode3D[]; edges: GEdge[] };

const NODE_RADIUS: Record<GNode3D["kind"], number> = { protocol: 7, run: 5.5, report: 4 };
// Rayon de détection souris en px écran — plus généreux que le point dessiné.
const HIT_RADIUS = 14;
const AUTO_SPEED = 0.0022; // rad par frame (~60 fps), mis à l'échelle par dt
const TILT = 0.32; // inclinaison X de base (radians)
const MAX_PITCH = 1.2; // borne du pitch au drag (~70°)
const DRAG_THRESHOLD = 4; // px cumulés : au-delà = drag (pas un clic)
const MORPH_MS = 550; // durée du morph entre deux modes

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const cloneVec = (p: Vec3): Vec3 => [p[0], p[1], p[2]];

export function Galaxy({ onLoad, mode }: { onLoad?: (nodeCount: number) => void; mode: GalaxyMode }) {
  const { open } = useWindowsContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<GalaxyResponse | null>(null);

  // Le mode et open sont lus via des refs dans la boucle d'animation → changer
  // de mode (ou l'identité de open) ne reconstruit pas la boucle en cours.
  const modeRef = useRef<GalaxyMode>(mode);
  const openRef = useRef(open);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Fetch une fois au montage — décoratif : un échec laisse la galaxie vide, il
  // ne doit jamais casser le reste du bureau.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/galaxy")
      .then((res) => (res.ok ? (res.json() as Promise<GalaxyResponse>) : Promise.reject(new Error(`Error ${res.status}`))))
      .then((body) => {
        if (!cancelled) {
          setData(body);
          onLoad?.(body.nodes.length);
        }
      })
      .catch(() => {
        /* best-effort — pas de galaxie plutôt qu'un bureau cassé */
      });
    return () => {
      cancelled = true;
    };
    // onLoad est stable (useCallback côté appelant) ; on ne re-fetch qu'au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boucle d'animation — (re)construite seulement quand les données arrivent.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodeColor: Record<GNode3D["kind"], string> = {
      protocol: cssVar("--oct-forest", "#A11250"),
      run: cssVar("--oct-aqua", "#FF7A2B"),
      report: cssVar("--oct-leaf", "#FFA3C1"),
    };
    const labelColor = cssVar("--foreground", "#1E1E1E");

    const nodes = data.nodes;
    const posRag = nodes.map((n) => n.pos);
    const posKg = nodes.map((n) => n.posKg);
    const targetFor = (m: GalaxyMode) => (m === "kg" ? posKg : posRag);
    const edgeTargetFor = (m: GalaxyMode) => (m === "rag" ? 0 : 1);

    // État caméra / interaction.
    let yaw = 0;
    let pitch = 0;
    let autoRotate = true;
    let hovered: GNode3D | null = null;
    let isDragging = false;
    let dragMoved = 0;
    let pressHit: GNode3D | null = null;
    let lastX = 0;
    let lastY = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let scale = 1;
    let f = 1;
    let raf = 0;
    let lastTs = 0;

    // État du morph (positions + fondu des arêtes) entre deux modes.
    let activeMode: GalaxyMode = modeRef.current;
    const basePos: Vec3[] = targetFor(activeMode).map(cloneVec);
    let fromPos: Vec3[] = basePos.map(cloneVec);
    let toPos: Vec3[] = basePos.map(cloneVec);
    let morphT = 1;
    let edgeAlpha = edgeTargetFor(activeMode);
    let edgeFrom = edgeAlpha;
    let edgeTo = edgeAlpha;

    function computeScale() {
      scale = 0.36 * Math.min(width, height);
      f = 3.0 * scale; // focale : garde f - z > 0 sur tout le cube
    }

    const zSpan = () => scale * 1.8; // amplitude approx. de z après rotation

    function project(p: Vec3): { px: number; py: number; z: number; t: number } {
      const x0 = p[0] * scale;
      const y0 = p[1] * scale;
      const z0 = p[2] * scale;
      // rotation Y (yaw)
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const x1 = x0 * cy + z0 * sy;
      const z1 = -x0 * sy + z0 * cy;
      // rotation X (tilt + pitch)
      const ang = TILT + pitch;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const y2 = y0 * ca - z1 * sa;
      const z2 = y0 * sa + z1 * ca;
      const persp = f / (f - z2);
      const zs = zSpan();
      const t = Math.max(0, Math.min(1, (z2 + zs) / (2 * zs)));
      return { px: width / 2 + x1 * persp, py: height / 2 + y2 * persp, z: z2, t };
    }

    function frame(ts: number) {
      const dt = lastTs ? Math.min(64, ts - lastTs) : 16;
      lastTs = ts;

      // Détection de changement de mode → démarre un morph.
      const m = modeRef.current;
      if (m !== activeMode) {
        fromPos = basePos.map(cloneVec);
        toPos = targetFor(m).map(cloneVec);
        morphT = 0;
        edgeFrom = edgeAlpha;
        edgeTo = edgeTargetFor(m);
        activeMode = m;
      }
      if (morphT < 1) {
        morphT = Math.min(1, morphT + dt / MORPH_MS);
        const e = smoothstep(morphT);
        for (let i = 0; i < basePos.length; i++) {
          basePos[i][0] = fromPos[i][0] + (toPos[i][0] - fromPos[i][0]) * e;
          basePos[i][1] = fromPos[i][1] + (toPos[i][1] - fromPos[i][1]) * e;
          basePos[i][2] = fromPos[i][2] + (toPos[i][2] - fromPos[i][2]) * e;
        }
        edgeAlpha = edgeFrom + (edgeTo - edgeFrom) * e;
      }

      if (autoRotate && !isDragging && !hovered) yaw += AUTO_SPEED * (dt / 16.67);

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);

      // Projeter tous les nœuds une fois par frame.
      const proj = nodes.map((n, i) => ({ n, ...project(basePos[i]) }));
      const byId = new Map(nodes.map((n, i) => [n.id, proj[i]]));

      // Arêtes d'abord (sous les points), très pâles, modulées par profondeur.
      if (edgeAlpha > 0.001) {
        ctx!.lineWidth = 1;
        for (const e of data!.edges) {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) continue;
          const tAvg = (a.t + b.t) / 2;
          ctx!.strokeStyle = `rgba(30, 30, 30, ${edgeAlpha * 0.08 * (0.5 + 0.5 * tAvg)})`;
          ctx!.beginPath();
          ctx!.moveTo(a.px, a.py);
          ctx!.lineTo(b.px, b.py);
          ctx!.stroke();
        }
      }

      // Points du plus lointain au plus proche (peintre).
      const ordered = proj.slice().sort((p, q) => p.z - q.z);
      for (const p of ordered) {
        const isHovered = hovered?.id === p.n.id;
        const r = NODE_RADIUS[p.n.kind] * (0.6 + 0.8 * p.t) * (isHovered ? 1.6 : 1);
        let alpha = 0.4 + 0.5 * p.t;
        if (isHovered) alpha = Math.min(1, alpha + 0.25);
        ctx!.beginPath();
        ctx!.arc(p.px, p.py, r, 0, Math.PI * 2);
        ctx!.fillStyle = nodeColor[p.n.kind];
        ctx!.globalAlpha = alpha;
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }

      // Label du nœud survolé, par-dessus tout.
      if (hovered) {
        const h = byId.get(hovered.id);
        if (h) {
          const r = NODE_RADIUS[hovered.kind] * (0.6 + 0.8 * h.t) * 1.6;
          ctx!.font = "500 13px system-ui, sans-serif";
          ctx!.fillStyle = labelColor;
          ctx!.fillText(hovered.label, h.px + r + 8, h.py + 4);
        }
      }

      raf = requestAnimationFrame(frame);
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      computeScale();
    }

    function nodeAt(clientX: number, clientY: number): GNode3D | null {
      const rect = canvas!.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      let best: GNode3D | null = null;
      let bestDist = HIT_RADIUS;
      for (let i = 0; i < nodes.length; i++) {
        const { px, py } = project(basePos[i]);
        const d = Math.hypot(px - x, py - y);
        if (d < bestDist) {
          bestDist = d;
          best = nodes[i];
        }
      }
      return best;
    }

    function onDown(e: MouseEvent) {
      isDragging = true;
      autoRotate = false;
      dragMoved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      pressHit = nodeAt(e.clientX, e.clientY); // figé à l'instant du clic
    }

    function onMove(e: MouseEvent) {
      if (isDragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        dragMoved += Math.abs(dx) + Math.abs(dy);
        yaw += dx * 0.01;
        pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch + dy * 0.01));
        return;
      }
      const hit = nodeAt(e.clientX, e.clientY);
      if (hit?.id !== hovered?.id) {
        hovered = hit;
        canvas!.style.cursor = hit ? "pointer" : "default";
      }
    }

    function onUp() {
      isDragging = false;
      autoRotate = true;
    }

    function onClick(e: MouseEvent) {
      if (dragMoved >= DRAG_THRESHOLD) return; // fin de drag, pas une ouverture
      const hit = pressHit ?? nodeAt(e.clientX, e.clientY);
      if (hit) openRef.current(hit.kind, hit.params);
    }

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("click", onClick);
    };
  }, [data]);

  return <canvas ref={canvasRef} className="galaxy" />;
}
