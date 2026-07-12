"use client";

import { useEffect, useRef } from "react";
import type { Win, WinRect, WinLayout } from "./useWindows";

const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;

// Largeur visuelle d'une vignette de fenêtre réduite (empilée en bas à droite).
// La hauteur suit le ratio de la fenêtre : l'aperçu est la fenêtre entière
// (barre + contenu) mise à l'échelle, pas un rendu séparé.
const MIN_CARD_W = 230;

type ResizeDir = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";
const RESIZE_HANDLES: ResizeDir[] = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

// Contrôles de la barre de titre (façon macOS) — SVG inline, 14px.
function MinimizeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 12h14" />
    </svg>
  );
}
function SplitIcon({ side }: { side: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d={side === "left" ? "M10 4.5v15" : "M14 4.5v15"} />
    </svg>
  );
}
function FullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5.5A2.5 2.5 0 0 0 3 5.5V8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16M16 21h2.5a2.5 2.5 0 0 0 2.5-2.5V16" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// Desktop window frame: draggable by its title bar, resizable from any edge or
// corner, fullscreen toggle, close, focus-to-front.
//
// IMPORTANT: drag/resize listeners are attached ONCE (empty deps) and read the
// latest callbacks through refs. Otherwise focus-to-front (onFocus → setState
// → re-render) would re-run the effect mid-drag and reset the local gesture
// state, killing the drag/resize. Positions are written imperatively on
// element.style during the gesture; React only re-applies win.rect once the
// parent commits the final rect via onRectCommit, so it never fights the
// imperative writes mid-gesture.
export function Window({
  win,
  active,
  tabs,
  minIndex,
  dockOpen,
  onFocus,
  onClose,
  onSetLayout,
  onRectCommit,
  onDockEnter,
  onDockLeave,
  children,
}: {
  win: Win;
  active: boolean;
  tabs?: React.ReactNode;
  minIndex: number;
  dockOpen: boolean;
  onFocus: () => void;
  onClose: () => void;
  onSetLayout: (layout: WinLayout) => void;
  onRectCommit: (rect: WinRect) => void;
  onDockEnter: () => void;
  onDockLeave: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const onFocusRef = useRef(onFocus);
  const onRectCommitRef = useRef(onRectCommit);
  useEffect(() => {
    onFocusRef.current = onFocus;
    onRectCommitRef.current = onRectCommit;
  });

  // Drag via the title bar.
  useEffect(() => {
    const w = ref.current;
    const bar = barRef.current;
    if (!w || !bar) return;
    let dragging = false;
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    let ow = 0;
    let oh = 0;
    let curLeft = 0;
    let curTop = 0;
    const down = (e: PointerEvent) => {
      // Focus dispatch pour cette interaction vient déjà de onPointerDown={onFocus}
      // sur la racine .window (bulle native depuis .win-bar) — pas de doublon ici.
      // On ne déplace que les fenêtres flottantes (full / snap gauche/droite
      // sont positionnées par CSS et n'ont pas de rect libre).
      if ((e.target as HTMLElement).closest("button") || !w.classList.contains("float")) return;
      const r = w.getBoundingClientRect();
      ox = r.left;
      oy = r.top;
      ow = r.width;
      oh = r.height;
      curLeft = ox;
      curTop = oy;
      sx = e.clientX;
      sy = e.clientY;
      dragging = true;
      bar.classList.add("dragging");
      bar.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      curLeft = ox + (e.clientX - sx);
      curTop = oy + (e.clientY - sy);
      w.style.left = `${curLeft}px`;
      w.style.top = `${curTop}px`;
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove("dragging");
      onRectCommitRef.current({ left: curLeft, top: curTop, width: ow, height: oh });
    };
    bar.addEventListener("pointerdown", down);
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
    return () => {
      bar.removeEventListener("pointerdown", down);
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
    };
  }, []);

  // Resize from the 8 edge/corner handles. Handles stay mounted even in
  // fullscreen (CSS hides them, see .window.full .rz) so this effect — attached
  // once — never has to re-query the DOM after a fullscreen toggle.
  useEffect(() => {
    const w = ref.current;
    if (!w) return;
    const handles = Array.from(w.querySelectorAll<HTMLElement>(".rz"));
    const cleanups: Array<() => void> = [];
    handles.forEach((h) => {
      const dir = h.dataset.dir ?? "";
      let resizing = false;
      let sx = 0;
      let sy = 0;
      let L = 0;
      let T = 0;
      let Wd = 0;
      let Ht = 0;
      let cur: WinRect = { left: 0, top: 0, width: 0, height: 0 };
      const down = (e: PointerEvent) => {
        e.stopPropagation();
        if (!w.classList.contains("float")) return;
        onFocusRef.current();
        const r = w.getBoundingClientRect();
        L = r.left;
        T = r.top;
        Wd = r.width;
        Ht = r.height;
        sx = e.clientX;
        sy = e.clientY;
        cur = { left: L, top: T, width: Wd, height: Ht };
        resizing = true;
        h.setPointerCapture(e.pointerId);
      };
      const move = (e: PointerEvent) => {
        if (!resizing) return;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        let nL = L;
        let nT = T;
        let nW = Wd;
        let nH = Ht;
        if (dir.includes("e")) nW = Math.max(MIN_WIDTH, Wd + dx);
        if (dir.includes("s")) nH = Math.max(MIN_HEIGHT, Ht + dy);
        if (dir.includes("w")) {
          nW = Math.max(MIN_WIDTH, Wd - dx);
          nL = L + (Wd - nW);
        }
        if (dir.includes("n")) {
          nH = Math.max(MIN_HEIGHT, Ht - dy);
          nT = T + (Ht - nH);
        }
        cur = { left: nL, top: nT, width: nW, height: nH };
        w.style.left = `${nL}px`;
        w.style.top = `${nT}px`;
        w.style.width = `${nW}px`;
        w.style.height = `${nH}px`;
      };
      const up = () => {
        if (!resizing) return;
        resizing = false;
        onRectCommitRef.current(cur);
      };
      h.addEventListener("pointerdown", down);
      h.addEventListener("pointermove", move);
      h.addEventListener("pointerup", up);
      h.addEventListener("pointercancel", up);
      cleanups.push(() => {
        h.removeEventListener("pointerdown", down);
        h.removeEventListener("pointermove", move);
        h.removeEventListener("pointerup", up);
        h.removeEventListener("pointercancel", up);
      });
    });
    return () => cleanups.forEach((fn) => fn());
  }, []);

  const isFloat = win.layout === "float";
  const isFull = win.layout === "full";
  const isMin = win.layout === "min";

  // Vignette réduite : la fenêtre garde sa taille réelle (rect) mais est mise à
  // l'échelle par CSS (--min-k). L'empilement/éventail et le décalage sont
  // pilotés par --min-i / --min-cardh, résolus dans shell.css.
  const minScale = MIN_CARD_W / win.rect.width;
  const style: React.CSSProperties = isMin
    ? ({
        width: win.rect.width,
        height: win.rect.height,
        zIndex: 90 + minIndex,
        "--min-i": minIndex,
        "--min-k": minScale,
        "--min-cardh": `${Math.round(win.rect.height * minScale)}px`,
      } as React.CSSProperties)
    : isFloat
      ? {
          left: win.rect.left,
          top: win.rect.top,
          width: win.rect.width,
          height: win.rect.height,
          zIndex: win.z,
        }
      : { zIndex: win.z };

  return (
    <div
      ref={ref}
      className={`window ${win.layout}${active ? " active" : ""}${isMin && dockOpen ? " dock-open" : ""}`}
      style={style}
      onPointerDown={onFocus}
    >
      <div ref={barRef} className="win-bar">
        <span className="win-title">{win.title}</span>
        {isFull && <div className="win-tablist">{tabs}</div>}
        <div className="win-actions">
          <button type="button" className="win-ctl" onClick={() => onSetLayout("min")} aria-label="Minimize" title="Minimize">
            <MinimizeIcon />
          </button>
          <button
            type="button"
            className={`win-ctl${win.layout === "left" ? " on" : ""}`}
            onClick={() => onSetLayout(win.layout === "left" ? "float" : "left")}
            aria-label="Snap left"
            title="Snap left"
          >
            <SplitIcon side="left" />
          </button>
          <button
            type="button"
            className={`win-ctl${win.layout === "right" ? " on" : ""}`}
            onClick={() => onSetLayout(win.layout === "right" ? "float" : "right")}
            aria-label="Snap right"
            title="Snap right"
          >
            <SplitIcon side="right" />
          </button>
          <button
            type="button"
            className={`win-ctl${isFull ? " on" : ""}`}
            onClick={() => onSetLayout(isFull ? "float" : "full")}
            aria-label="Toggle fullscreen"
            title="Fullscreen"
          >
            <FullscreenIcon />
          </button>
          <button type="button" className="win-ctl close" onClick={onClose} aria-label="Close" title="Close">
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="win-body">{children}</div>
      {isMin && (
        <button
          type="button"
          className="min-hit"
          title={`Restore ${win.title}`}
          aria-label={`Restore ${win.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onSetLayout("float");
            onFocus();
          }}
          onMouseEnter={onDockEnter}
          onMouseLeave={onDockLeave}
        >
          <span className="min-hit-label">{win.title}</span>
        </button>
      )}
      {RESIZE_HANDLES.map((dir) => (
        <div key={dir} className={`rz rz-${dir}`} data-dir={dir} />
      ))}
    </div>
  );
}
