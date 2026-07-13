// app/chat/citations.ts
// Extraction et numérotation des citations d'une réponse du copilote. Pur (zéro
// React) : testable directement. Le modèle cite [type:id] ; on gère aussi la
// forme courte (ev_xxx) qu'il produit parfois pour les preuves.

export type CitationSourceType = "protocol" | "run" | "report" | "evidence";

export type CitationToken =
  | { kind: "text"; text: string }
  | { kind: "cite"; sourceType: CitationSourceType; sourceId: string };

export type CitationRef = {
  n: number; // numéro affiché (1-based), ordre d'apparition
  sourceType: CitationSourceType;
  sourceId: string;
};

// [type:id]  OU  (ev_xxx)  — une seule passe. Types connus uniquement, pour ne
// pas confondre un [texte entre crochets] quelconque avec une citation.
const TAG = /\[(protocol|run|report|evidence):([A-Za-z0-9_-]+)\]|\((ev_[A-Za-z0-9]+)\)/g;

export function citeKey(sourceType: string, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

/** Découpe une chaîne en tokens texte / citation, ordre conservé. */
export function tokenizeCitations(text: string): CitationToken[] {
  const tokens: CitationToken[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    const start = m.index ?? 0;
    if (start > last) tokens.push({ kind: "text", text: text.slice(last, start) });
    if (m[1]) tokens.push({ kind: "cite", sourceType: m[1] as CitationSourceType, sourceId: m[2] });
    else tokens.push({ kind: "cite", sourceType: "evidence", sourceId: m[3] });
    last = start + m[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", text: text.slice(last) });
  return tokens;
}

/** Scanne tout le texte, attribue un numéro à chaque source unique. */
export function numberCitations(text: string): { refs: CitationRef[]; keyToN: Map<string, number> } {
  const keyToN = new Map<string, number>();
  const refs: CitationRef[] = [];
  for (const tok of tokenizeCitations(text)) {
    if (tok.kind !== "cite") continue;
    const key = citeKey(tok.sourceType, tok.sourceId);
    if (keyToN.has(key)) continue;
    const n = refs.length + 1;
    keyToN.set(key, n);
    refs.push({ n, sourceType: tok.sourceType, sourceId: tok.sourceId });
  }
  return { refs, keyToN };
}
