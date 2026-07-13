// app/chat/sourceLabel.ts
// Libellé lisible d'une source. Pur, partagé : le serveur le dérive du texte
// indexé du hit ; le client l'affiche, avec un repli quand l'id cité n'a pas de
// hit correspondant.

/** Première ligne significative du texte, nettoyée du markdown et tronquée. */
export function deriveSourceLabel(text: string, max = 60): string {
  const firstLine =
    text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const clean = firstLine
    .replace(/^#+\s*/, "")            // titres markdown
    .replace(/\*\*|__|\*|_|`/g, "")   // gras / italique / code inline
    .trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

/** Repli sans texte : "Run · run_dbc894". */
export function fallbackLabel(sourceType: string, sourceId: string): string {
  const cap = sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
  const short = sourceId.length > 10 ? sourceId.slice(0, 10) : sourceId;
  return `${cap} · ${short}`;
}
