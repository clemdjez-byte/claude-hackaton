"use client";
// app/shell/Galaxy.tsx — fond décoratif ET navigable du bureau : galaxie 3D.
// Deux populations (documents porteurs d'embedding ; entités d'ontologie du
// knowledge graph) et trois lentilles pilotées par `mode` :
//   - "rag"   : documents seuls, positionnés par embedding (nuage sémantique)
//   - "kg"    : ontologie seule (entités + relations typées), layout topologique
//   - "ragkg" : les deux — documents à leur place sémantique + ontologie tissée
// Changer de mode anime un morph des positions ET un fondu (reveal) des nœuds
// qui apparaissent/disparaissent. Rendu canvas 2D pur (aucune dépendance) :
// rotation + perspective, profondeur = taille + opacité, aucun glow (hors-marque).
// Molette / deux doigts = zoom. Survol = titre ; drag = orbite ; clic = ouvre le
// document (les entités d'ontologie ne sont pas ouvrables).
import { useEffect, useRef, useState } from "react";
import { useWindowsContext } from "./WindowsContext";
import { useGalaxyControl, type GalaxyMode, type FocusRequest } from "./GalaxyControlContext";
import type { GEdge, GNode3D, Vec3 } from "./galaxy-layout";

export type { GalaxyMode } from "./GalaxyControlContext";
type GalaxyResponse = { nodes: GNode3D[]; edges: GEdge[] };

const HIT_RADIUS = 14;
const AUTO_SPEED = 0.0022;
const TILT = 0.32;
const MAX_PITCH = 1.2;
const DRAG_THRESHOLD = 4;
const MORPH_MS = 600;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;

// Les rapports sont les hubs d'expériences (un run est représenté par son
// rapport) → plus gros ; les protocoles un peu plus encore ; l'ontologie petite.
const DOC_RADIUS: Record<string, number> = { report: 6, protocol: 7 };
const ENTITY_RADIUS = 3.2;
// Le knowledge graph (entités d'ontologie) est une SEULE famille de couleur —
// des teintes de vert/teal — pour se lire comme un tout. Les documents tranchent :
// rapports en rose, protocoles en orange (cf. docColor plus bas), runs en vert
// profond car ce sont les hubs des expériences DANS le graphe.
const ENTITY_COLOR: Record<string, string> = {
  parameter_type: "#1FB958",
  parameter: "#2DBE9E",
  measurement: "#3FA98A",
  reagent: "#14B8A6",
  outcome: "#5BC88A",
  failure_mode: "#7CA82C",
  publication: "#2F8F6B",
  operator: "#8FBF7A",
  date: "#A9C58C",
  cell_line: "#3CB371",
  instrument: "#4FB0A0",
  equipment: "#57A773",
  sample: "#6FC28A",
  material: "#88B04B",
};
const DEFAULT_COLOR = "#6BAE7F";
// Couleur d'illumination du « projecteur » du chat : un jaune très brillant qui
// tranche sur toutes les teintes (rose/orange des docs, vert/teal du KG).
const FOCUS_COLOR = "#FFD60A";

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const cloneVec = (p: Vec3): Vec3 => [p[0], p[1], p[2]];
function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
const lerpVec = (a: Vec3, b: Vec3, e: number): Vec3 => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];

export function Galaxy({ onLoad, mode }: { onLoad?: (docCount: number) => void; mode: GalaxyMode }) {
  const { open } = useWindowsContext();
  const { focus } = useGalaxyControl();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<GalaxyResponse | null>(null);

  const modeRef = useRef<GalaxyMode>(mode);
  const openRef = useRef(open);
  const focusRef = useRef<FocusRequest | null>(focus);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  // Fetch une fois au montage — décoratif : un échec laisse la galaxie vide.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/galaxy")
      .then((res) => (res.ok ? (res.json() as Promise<GalaxyResponse>) : Promise.reject(new Error(`Error ${res.status}`))))
      .then((body) => {
        if (!cancelled) {
          setData(body);
          onLoad?.(body.nodes.filter((n) => n.isDoc).length);
        }
      })
      .catch(() => {
        /* best-effort — pas de galaxie plutôt qu'un bureau cassé */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boucle d'animation — (re)construite seulement quand les données arrivent.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const docColor: Record<string, string> = {
      report: "#FF7FA6", // rose — le rapport EST l'expérience (hub)
      protocol: "#FF7A2B", // orange
    };
    const labelColor = cssVar("--foreground", "#1E1E1E");
    const colorFor = (n: GNode3D) => (n.isDoc ? docColor[n.type] ?? DEFAULT_COLOR : ENTITY_COLOR[n.type] ?? DEFAULT_COLOR);
    const radiusFor = (n: GNode3D) => (n.isDoc ? DOC_RADIUS[n.type] ?? 4 : ENTITY_RADIUS);

    const nodes = data.nodes;
    // Position cible d'un nœud dans un mode. RAG = embedding (documents) ;
    // KG+RAG = layout du graphe par les forces (tous les nœuds).
    const targetPos = (n: GNode3D, m: GalaxyMode): Vec3 =>
      m === "rag" ? n.pos ?? n.posBoth : n.posBoth;
    // Visibilité : RAG = documents seuls (à leur embedding) ; KG+RAG = tout.
    const visible = (n: GNode3D, m: GalaxyMode): boolean =>
      m === "rag" ? n.isDoc && n.pos != null : true;

    // État caméra / interaction.
    let yaw = 0;
    let pitch = 0;
    let zoom = 1;
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
    let raf = 0;
    let lastTs = 0;

    // Morph : positions + reveal (fondu) par nœud, + fondu global des arêtes.
    let activeMode: GalaxyMode = modeRef.current;
    const basePos: Vec3[] = nodes.map((n) => cloneVec(targetPos(n, activeMode)));
    const reveal: number[] = nodes.map((n) => (visible(n, activeMode) ? 1 : 0));
    let fromPos: Vec3[] = basePos.map(cloneVec);
    let toPos: Vec3[] = basePos.map(cloneVec);
    let fromReveal = reveal.slice();
    let toReveal = reveal.slice();
    let morphT = 1;
    let edgeAlpha = activeMode === "rag" ? 0 : 1;
    let edgeFrom = edgeAlpha;
    let edgeTo = edgeAlpha;

    // Focus « projecteur » piloté par le chat : les documents cités s'allument
    // fort, les entités du knowledge graph mobilisées s'allument en doux, le reste
    // s'estompe, et la caméra pivote pour amener le tout face à l'écran.
    const nodeIndexById = new Map(nodes.map((n, i) => [n.id, i]));
    let docIds = new Set<string>();
    let entityIds = new Set<string>();
    let hasFocus = false;
    let yawTarget = 0;
    let lastFocusToken = focusRef.current?.token ?? -1; // ne pas rejouer un focus déjà présent au montage

    /** Résout une demande de focus vers deux ensembles d'ids de nœuds galaxie :
     *  - docIds : les documents cités (un run est retrouvé via son rapport,
     *    params.runId) ;
     *  - entityIds : les entités KG mobilisées (clés `type:id` directes), hors
     *    documents déjà retenus. Les ids inconnus de la galaxie sont ignorés. */
    function resolveFocus(req: FocusRequest): { docIds: Set<string>; entityIds: Set<string> } {
      const docs = new Set<string>();
      for (const s of req.sources) {
        if (s.sourceType === "protocol") {
          const key = `protocol:${s.sourceId}`;
          if (nodeIndexById.has(key)) docs.add(key);
          continue;
        }
        const runId = s.runId ?? (s.sourceType === "run" ? s.sourceId : undefined);
        if (!runId) continue;
        const n = nodes.find((nd) => nd.params?.runId === runId);
        if (n) docs.add(n.id);
      }
      const entities = new Set<string>();
      for (const id of req.nodeIds) {
        if (!docs.has(id) && nodeIndexById.has(id)) entities.add(id);
      }
      return { docIds: docs, entityIds: entities };
    }

    function computeScale() {
      scale = 0.42 * Math.min(width, height);
    }

    function project(p: Vec3): { px: number; py: number; z: number; t: number } {
      const s = scale * zoom;
      const f = 3 * s; // focale : garde f - z > 0 sur tout le cube
      const x0 = p[0] * s;
      const y0 = p[1] * s;
      const z0 = p[2] * s;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const x1 = x0 * cy + z0 * sy;
      const z1 = -x0 * sy + z0 * cy;
      const ang = TILT + pitch;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const y2 = y0 * ca - z1 * sa;
      const z2 = y0 * sa + z1 * ca;
      const persp = f / (f - z2);
      const zs = s * 1.05; // amplitude de z ≈ rayon (sphère unité) → profondeur pleine
      const t = Math.max(0, Math.min(1, (z2 + zs) / (2 * zs)));
      return { px: width / 2 + x1 * persp, py: height / 2 + y2 * persp, z: z2, t };
    }

    function frame(ts: number) {
      const dt = lastTs ? Math.min(64, ts - lastTs) : 16;
      lastTs = ts;

      const m = modeRef.current;
      if (m !== activeMode) {
        fromPos = basePos.map(cloneVec);
        toPos = nodes.map((n) => cloneVec(targetPos(n, m)));
        fromReveal = reveal.slice();
        toReveal = nodes.map((n) => (visible(n, m) ? 1 : 0));
        edgeFrom = edgeAlpha;
        edgeTo = m === "rag" ? 0 : 1;
        morphT = 0;
        activeMode = m;
      }
      if (morphT < 1) {
        morphT = Math.min(1, morphT + dt / MORPH_MS);
        const e = smoothstep(morphT);
        for (let i = 0; i < nodes.length; i++) {
          basePos[i] = lerpVec(fromPos[i], toPos[i], e);
          reveal[i] = fromReveal[i] + (toReveal[i] - fromReveal[i]) * e;
        }
        edgeAlpha = edgeFrom + (edgeTo - edgeFrom) * e;
      }

      // Nouvelle demande de focus du chat ? Résous les cibles + vise la caméra.
      const fReq = focusRef.current;
      if ((fReq?.token ?? -1) !== lastFocusToken) {
        lastFocusToken = fReq?.token ?? -1;
        if (fReq && (fReq.sources.length || fReq.nodeIds.length)) {
          const r = resolveFocus(fReq);
          docIds = r.docIds;
          entityIds = r.entityIds;
        } else {
          docIds = new Set();
          entityIds = new Set();
        }
        hasFocus = docIds.size + entityIds.size > 0;
        if (hasFocus) {
          // La caméra vise les documents en priorité (les entités KG gravitent autour).
          const aim = docIds.size ? docIds : entityIds;
          let bx = 0, bz = 0, cnt = 0;
          for (const id of aim) {
            const i = nodeIndexById.get(id);
            if (i == null) continue;
            bx += basePos[i][0];
            bz += basePos[i][2];
            cnt++;
          }
          if (cnt > 0) {
            yawTarget = -Math.atan2(bx / cnt, bz / cnt); // amène le barycentre face à l'écran
            autoRotate = false;
          }
        }
      }

      if (autoRotate && !isDragging && !hovered) yaw += AUTO_SPEED * (dt / 16.67);
      else if (hasFocus && !isDragging) {
        let d = yawTarget - yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d)); // plus court chemin angulaire
        yaw += d * 0.08;
      }

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);

      const proj = nodes.map((n, i) => ({ n, i, ...project(basePos[i]) }));
      const byId = new Map(proj.map((p) => [p.n.id, p]));

      // Arêtes d'abord — dégradé entre les couleurs des deux extrémités (le KG
      // étant vert, elles se lisent en teintes de vert), modulé par profondeur et
      // reveal.
      if (edgeAlpha > 0.001) {
        const lit = (id: string) => hasFocus && (docIds.has(id) || entityIds.has(id));
        // Passe 1 : arêtes normales (en dégradé), estompées si un focus est actif.
        // On saute celles du sous-graphe illuminé : elles sont tracées en jaune juste après.
        ctx!.lineWidth = 1.1;
        for (const e of data!.edges) {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) continue;
          const rv = Math.min(reveal[a.i], reveal[b.i]);
          if (rv < 0.02) continue;
          if (lit(a.n.id) && lit(b.n.id)) continue; // → passe 2 (jaune)
          const tAvg = (a.t + b.t) / 2;
          const dim = hasFocus ? 0.22 : 1; // fond en retrait quand le projecteur est allumé
          const alpha = edgeAlpha * rv * 0.3 * (0.45 + 0.55 * tAvg) * dim;
          const grad = ctx!.createLinearGradient(a.px, a.py, b.px, b.py);
          grad.addColorStop(0, hexToRgba(colorFor(a.n), alpha));
          grad.addColorStop(1, hexToRgba(colorFor(b.n), alpha));
          ctx!.strokeStyle = grad;
          ctx!.beginPath();
          ctx!.moveTo(a.px, a.py);
          ctx!.lineTo(b.px, b.py);
          ctx!.stroke();
        }
        // Passe 2 : arêtes reliant deux nœuds allumés → jaune brillant, par-dessus.
        if (hasFocus) {
          ctx!.lineWidth = 1.7;
          for (const e of data!.edges) {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b || !lit(a.n.id) || !lit(b.n.id)) continue;
            const rv = Math.min(reveal[a.i], reveal[b.i]);
            if (rv < 0.02) continue;
            const tAvg = (a.t + b.t) / 2;
            const alpha = edgeAlpha * rv * (0.5 + 0.4 * tAvg);
            ctx!.strokeStyle = hexToRgba(FOCUS_COLOR, alpha);
            ctx!.beginPath();
            ctx!.moveTo(a.px, a.py);
            ctx!.lineTo(b.px, b.py);
            ctx!.stroke();
          }
        }
      }

      // Points du plus lointain au plus proche (peintre).
      const pulse = 0.5 + 0.5 * Math.sin(ts / 280); // battement du halo de focus
      const ordered = proj.slice().sort((p, q) => p.z - q.z);
      for (const p of ordered) {
        const rv = reveal[p.i];
        if (rv < 0.02) continue;
        const isHovered = hovered?.id === p.n.id;
        const isDocT = hasFocus && docIds.has(p.n.id); // document cité (halo fort)
        const isEntT = hasFocus && entityIds.has(p.n.id); // entité KG mobilisée (halo doux)
        const targeted = isDocT || isEntT;
        const boost = isDocT ? 1.5 : isEntT ? 1.25 : 1;
        const r = radiusFor(p.n) * (0.6 + 0.8 * p.t) * (isHovered ? 1.6 : 1) * boost;
        let alpha = (0.4 + 0.5 * p.t) * rv;
        if (hasFocus && !targeted) alpha *= 0.28; // estompe le reste
        if (isHovered) alpha = Math.min(1, alpha + 0.25);
        if (targeted) alpha = 1; // un nœud allumé brille à pleine opacité
        // Un nœud allumé change de couleur (jaune brillant) au lieu de sa teinte.
        const fill = targeted ? FOCUS_COLOR : colorFor(p.n);
        // Glow jaune pulsant derrière un nœud allumé (plus large pour un document).
        if (targeted) {
          ctx!.beginPath();
          ctx!.arc(p.px, p.py, r + (isDocT ? 8 : 5) + pulse * 4, 0, Math.PI * 2);
          ctx!.fillStyle = FOCUS_COLOR;
          ctx!.globalAlpha = (isDocT ? 0.35 : 0.26) * rv;
          ctx!.fill();
        }
        ctx!.beginPath();
        ctx!.arc(p.px, p.py, r, 0, Math.PI * 2);
        ctx!.fillStyle = fill;
        ctx!.globalAlpha = alpha;
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }

      // Labels permanents des documents cités (les entités KG restent sans label
      // pour ne pas surcharger — leur halo suffit à les faire ressortir).
      if (hasFocus) {
        ctx!.font = "500 12px system-ui, sans-serif";
        ctx!.fillStyle = labelColor;
        for (const p of ordered) {
          if (!docIds.has(p.n.id) || reveal[p.i] < 0.2) continue;
          const r = radiusFor(p.n) * (0.6 + 0.8 * p.t) * 1.5;
          ctx!.fillText(p.n.label, p.px + r + 6, p.py + 4);
        }
      }

      // Label du nœud survolé, par-dessus tout.
      if (hovered) {
        const h = byId.get(hovered.id);
        if (h && reveal[h.i] > 0.2) {
          const r = radiusFor(hovered) * (0.6 + 0.8 * h.t) * 1.6;
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
        if (reveal[i] < 0.5) continue; // seulement les nœuds visibles
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
      pressHit = nodeAt(e.clientX, e.clientY);
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
        // Main seulement sur un document ouvrable (les entités d'ontologie se
        // survolent pour lire leur libellé mais ne s'ouvrent pas).
        canvas!.style.cursor = hit?.openable ? "pointer" : "default";
      }
    }

    function onUp() {
      isDragging = false;
      autoRotate = true;
    }

    function onClick(e: MouseEvent) {
      if (dragMoved >= DRAG_THRESHOLD) return; // fin de drag, pas une ouverture
      const hit = pressHit ?? nodeAt(e.clientX, e.clientY);
      if (hit?.openable) openRef.current(hit.type as Parameters<typeof openRef.current>[0], hit.params);
    }

    // Zoom molette / deux doigts (trackpad) / pinch (ctrl+molette) → facteur zoom.
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * Math.exp(-e.deltaY * 0.0015)));
    }

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [data]);

  return <canvas ref={canvasRef} className="galaxy" />;
}
