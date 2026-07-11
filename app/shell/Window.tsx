"use client";

import { useEffect, useRef } from "react";
import type { Win, WinRect } from "./useWindows";

const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;

type ResizeDir = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";
const RESIZE_HANDLES: ResizeDir[] = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

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
  onFocus,
  onClose,
  onFullscreen,
  onRectCommit,
  children,
}: {
  win: Win;
  active: boolean;
  tabs?: React.ReactNode;
  onFocus: () => void;
  onClose: () => void;
  onFullscreen: () => void;
  onRectCommit: (rect: WinRect) => void;
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
      onFocusRef.current();
      if ((e.target as HTMLElement).closest("button") || w.classList.contains("full")) return;
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
        if (w.classList.contains("full")) return;
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

  const isFull = win.layout === "full";

  return (
    <div
      ref={ref}
      className={`window${isFull ? " full" : ""}${active ? " active" : ""}`}
      style={
        isFull
          ? { zIndex: win.z }
          : {
              left: win.rect.left,
              top: win.rect.top,
              width: win.rect.width,
              height: win.rect.height,
              zIndex: win.z,
            }
      }
      onPointerDown={onFocus}
    >
      <div ref={barRef} className="win-bar">
        <span className="win-title">{win.title}</span>
        {isFull && <div className="win-tablist">{tabs}</div>}
        <div className="win-actions">
          <button type="button" className="tbtn" onClick={onFullscreen} aria-label="Toggle fullscreen">
            ⤢
          </button>
          <button type="button" className="tbtn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </div>
      <div className="win-body">{children}</div>
      {RESIZE_HANDLES.map((dir) => (
        <div key={dir} className={`rz rz-${dir}`} data-dir={dir} />
      ))}
    </div>
  );
}
