"use client";
// Contexte fenêtres — expose l'API useWindows() (open/close/focus/...) à tout
// composant monté sous <Desktop>, sans forer les props (Toolbar, ChatDock,
// et plus tard les panneaux eux-mêmes en ont besoin pour ouvrir d'autres
// fenêtres, ex: un lien "voir le run" depuis un rapport).
import { createContext, useContext } from "react";
import type { WindowsApi } from "./useWindows";

export const WindowsContext = createContext<WindowsApi | null>(null);

export function useWindowsContext(): WindowsApi {
  const ctx = useContext(WindowsContext);
  if (!ctx) throw new Error("useWindowsContext must be used within <WindowsContext.Provider>");
  return ctx;
}
