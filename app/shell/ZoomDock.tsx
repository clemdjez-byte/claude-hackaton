"use client";
// Dock vertical droit — sélecteur de lentille de la galaxie. Trois vues de la
// MÊME donnée : RAG = nuage de points (positions par embedding, sans liens),
// RAG + KG = points ET traits (sémantique + arêtes du knowledge graph), KG =
// traits (structure du graphe, positions par la topologie). Pilote la prop
// `mode` de <Galaxy>, qui anime un morph des positions au changement.
import type { ReactNode } from "react";
import type { GalaxyMode } from "./Galaxy";

// Nuage de points seuls (RAG).
function PointsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="6" cy="7" r="1.7" />
      <circle cx="13" cy="5" r="1.7" />
      <circle cx="18" cy="10" r="1.7" />
      <circle cx="8" cy="15" r="1.7" />
      <circle cx="16" cy="17" r="1.7" />
    </svg>
  );
}

// Points ET traits (RAG + KG) : nœuds pleins reliés par des arêtes fines.
function BothIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7L17 6M7 7L13 17M17 6L13 17" />
      <circle cx="7" cy="7" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="6" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="13" cy="17" r="2.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const OPTIONS: { mode: GalaxyMode; label: string; title: string; icon: ReactNode }[] = [
  { mode: "rag", label: "RAG", title: "Nuage de points — documents positionnés par leur embedding, sans les liens", icon: <PointsIcon /> },
  { mode: "ragkg", label: "KG", title: "Knowledge graph — documents + ontologie + relations, forme organique", icon: <BothIcon /> },
];

export function ZoomDock({ mode, onChange }: { mode: GalaxyMode; onChange: (m: GalaxyMode) => void }) {
  return (
    <nav className="zoomdock" role="radiogroup" aria-label="Vue de la galaxie">
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          role="radio"
          aria-checked={mode === o.mode}
          title={o.title}
          className={`zmode${mode === o.mode ? " active" : ""}`}
          onClick={() => onChange(o.mode)}
        >
          {o.icon}
          <span className="zmode-label">{o.label}</span>
        </button>
      ))}
    </nav>
  );
}
