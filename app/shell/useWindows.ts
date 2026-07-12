"use client";
// useWindows — état des fenêtres du desktop shell (float/full, pile de z-index,
// dédup par id). Logique pure isolée dans reduceWindows/initialWindows (testable
// sans DOM) ; useWindows() n'est qu'un habillage useReducer + callbacks stables.
import { useCallback, useReducer } from "react";

export type WindowKind =
  | "chat"
  | "files"
  | "bench-hub"
  | "protocols"
  | "protocol"
  | "run"
  | "report"
  | "settings"
  | "import";

export type WinRect = { left: number; top: number; width: number; height: number };

export type Win = {
  id: string;
  kind: WindowKind;
  title: string;
  params?: Record<string, string>;
  rect: WinRect;
  z: number;
  layout: "float" | "full";
};

/** id déterministe : kind + params triés par clé, pour dédup ("report:runId=run_1"). */
export function windowId(kind: WindowKind, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return kind;
  const key = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return `${kind}:${key}`;
}

const DEFAULT_TITLES: Record<WindowKind, string> = {
  chat: "Ask your lab",
  files: "Files",
  "bench-hub": "Bench",
  protocols: "Protocols",
  protocol: "Protocol",
  run: "Run",
  report: "Report",
  settings: "Settings",
  import: "New protocol",
};

function stackedRect(n: number): WinRect {
  const off = (n % 6) * 34;
  return { left: 220 + off, top: 90 + off, width: 760, height: 620 };
}

export type WindowsState = { windows: Win[]; nextZ: number; openCount: number };

export type WindowsAction =
  | { type: "open"; kind: WindowKind; params?: Record<string, string>; title?: string }
  | { type: "close"; id: string }
  | { type: "focus"; id: string }
  | { type: "toggleFullscreen"; id: string }
  | { type: "setTitle"; id: string; title: string }
  | { type: "setRect"; id: string; rect: WinRect };

export function initialWindows(): WindowsState {
  return { windows: [], nextZ: 20, openCount: 0 };
}

export function reduceWindows(state: WindowsState, action: WindowsAction): WindowsState {
  switch (action.type) {
    case "open": {
      const id = windowId(action.kind, action.params);
      const z = state.nextZ + 1;
      const existing = state.windows.find((w) => w.id === id);
      if (existing) {
        return {
          ...state,
          nextZ: z,
          windows: state.windows.map((w) => (w.id === id ? { ...w, z } : w)),
        };
      }
      const win: Win = {
        id,
        kind: action.kind,
        title: action.title ?? DEFAULT_TITLES[action.kind],
        params: action.params,
        rect: stackedRect(state.openCount),
        z,
        layout: "float",
      };
      return { nextZ: z, openCount: state.openCount + 1, windows: [...state.windows, win] };
    }
    case "close":
      return { ...state, windows: state.windows.filter((w) => w.id !== action.id) };
    case "focus": {
      const z = state.nextZ + 1;
      return {
        ...state,
        nextZ: z,
        windows: state.windows.map((w) => (w.id === action.id ? { ...w, z } : w)),
      };
    }
    case "toggleFullscreen": {
      const z = state.nextZ + 1;
      return {
        ...state,
        nextZ: z,
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, layout: w.layout === "full" ? "float" : "full", z } : w
        ),
      };
    }
    case "setTitle":
      return {
        ...state,
        windows: state.windows.map((w) => (w.id === action.id ? { ...w, title: action.title } : w)),
      };
    case "setRect":
      return {
        ...state,
        windows: state.windows.map((w) => (w.id === action.id ? { ...w, rect: action.rect } : w)),
      };
    default:
      return state;
  }
}

export type WindowsApi = {
  windows: Win[];
  activeId: string | null;
  open: (kind: WindowKind, params?: Record<string, string>, title?: string) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  toggleFullscreen: (id: string) => void;
  setTitle: (id: string, title: string) => void;
  setRect: (id: string, rect: WinRect) => void;
};

export function useWindows(): WindowsApi {
  const [state, dispatch] = useReducer(reduceWindows, undefined, initialWindows);

  const open = useCallback(
    (kind: WindowKind, params?: Record<string, string>, title?: string) =>
      dispatch({ type: "open", kind, params, title }),
    []
  );
  const close = useCallback((id: string) => dispatch({ type: "close", id }), []);
  const focus = useCallback((id: string) => dispatch({ type: "focus", id }), []);
  const toggleFullscreen = useCallback((id: string) => dispatch({ type: "toggleFullscreen", id }), []);
  const setTitle = useCallback((id: string, title: string) => dispatch({ type: "setTitle", id, title }), []);
  const setRect = useCallback((id: string, rect: WinRect) => dispatch({ type: "setRect", id, rect }), []);

  const activeId = state.windows.length
    ? state.windows.reduce((a, b) => (a.z >= b.z ? a : b)).id
    : null;

  return { windows: state.windows, activeId, open, close, focus, toggleFullscreen, setTitle, setRect };
}
