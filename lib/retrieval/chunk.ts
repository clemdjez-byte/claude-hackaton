// lib/retrieval/chunk.ts — découpage de texte en morceaux (« chunks »), zéro
// dépendance. Un document court (≤ size) reste UN seul chunk (protocoles, runs,
// evidence : inchangés). Seuls les longs rapports produisent plusieurs chunks,
// ce qui les rend beaucoup mieux retrouvables (chaque passage a son propre
// vecteur au lieu d'un point moyen noyé).

export interface Chunk {
  text: string;
  index: number;
  count: number;
}

const SIZE = 1200; // ~300 tokens : bon compromis précision / contexte
const OVERLAP = 150; // chevauchement pour ne pas perdre le sens aux frontières

export function chunkText(text: string, opts: { size?: number; overlap?: number } = {}): Chunk[] {
  const size = opts.size ?? SIZE;
  const overlap = opts.overlap ?? OVERLAP;
  const clean = text.trim();
  if (clean.length <= size) return [{ text: clean, index: 0, count: 1 }];

  // Regroupe les paragraphes gloutonnement jusqu'à `size` (garde les unités
  // sémantiques ensemble) ; un paragraphe seul plus long que `size` est coupé
  // « dur » par caractères, avec chevauchement.
  const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) pieces.push(buf);
    buf = "";
  };
  for (const para of paras) {
    if (para.length > size) {
      flush();
      const step = Math.max(1, size - overlap);
      for (let i = 0; i < para.length; i += step) pieces.push(para.slice(i, i + size));
      continue;
    }
    if (buf && buf.length + 2 + para.length > size) flush();
    buf = buf ? `${buf}\n\n${para}` : para;
  }
  flush();

  const count = pieces.length;
  return pieces.map((t, index) => ({ text: t, index, count }));
}
