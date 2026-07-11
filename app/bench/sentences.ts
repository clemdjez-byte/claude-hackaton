// Découpe un flux de texte en phrases complètes pour la lecture vocale au fil de
// l'eau. Le copilote streame sa réponse ; on lit chaque phrase dès qu'elle est
// terminée, sans attendre la suivante. Une phrase se clôt sur . ! ? … SUIVI d'un
// espace ou d'un retour ligne (une ponctuation en toute fin de buffer est gardée :
// le prochain morceau du flux peut la prolonger, ex. « 1. » → « 1.5 »).

const CLOSERS = new Set([".", "!", "?", "…"]);

export function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i];
    if (!CLOSERS.has(c)) continue;
    const next = buffer[i + 1];
    // Ponctuation en fin de buffer : on attend le prochain morceau (ne pas couper).
    if (next !== " " && next !== "\n") continue;
    const sentence = buffer.slice(start, i + 1).trim();
    if (sentence) sentences.push(sentence);
    start = i + 1;
  }
  return { sentences, rest: buffer.slice(start) };
}
