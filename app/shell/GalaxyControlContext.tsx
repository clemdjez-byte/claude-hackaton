"use client";
// Contexte de pilotage de la galaxie — permet au chat (ou à tout composant sous
// <Desktop>) de commander le fond navigable : changer de lentille (mode) et
// « braquer le projecteur » sur les sources citées dans une réponse (focus).
// Valeur par défaut = no-op : un consommateur monté hors provider ne casse pas.
import { createContext, useContext } from "react";

export type GalaxyMode = "rag" | "ragkg";

/** Une source citée par le chat, telle quelle. Galaxy résout elle-même la
 *  correspondance vers ses nœuds (un run est représenté par son rapport). */
export type FocusSource = { sourceType: string; sourceId: string; runId?: string };

/** Une demande de focus : les documents cités (sources, halo fort + label) ET les
 *  entités du knowledge graph mobilisées (nodeIds `type:id`, halo doux). Le token
 *  change à chaque demande → re-déclenche l'effet même si le contenu est identique. */
export type FocusRequest = { sources: FocusSource[]; nodeIds: string[]; token: number };

export type GalaxyControl = {
  mode: GalaxyMode;
  setMode: (m: GalaxyMode) => void;
  focus: FocusRequest | null;
  setFocus: (sources: FocusSource[], nodeIds?: string[]) => void;
};

const NOOP: GalaxyControl = {
  mode: "ragkg",
  setMode: () => {},
  focus: null,
  setFocus: () => {},
};

export const GalaxyControlContext = createContext<GalaxyControl>(NOOP);

export function useGalaxyControl(): GalaxyControl {
  return useContext(GalaxyControlContext);
}
