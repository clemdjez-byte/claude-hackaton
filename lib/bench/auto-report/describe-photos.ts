// lib/bench/auto-report/describe-photos.ts — description vision des photos.
// À la génération du rapport, chaque photo du run reçoit une courte description
// factuelle (LLM vision) embarquée dans le HTML (attribut data-description) :
// elle aide un LLM qui relit le rapport à savoir ce que montre la photo.
// Best-effort intégral : sans clé, sans bytes, ou sur échec d'appel → pas de
// description, jamais d'exception (le rapport se génère toujours).
import { generateText } from "ai";
import { hasLlmKey, modelFor, type Db, type Evidence, type Id } from "@/lib/core";

const PROMPT = `You describe a laboratory photo so a language model reading the
experimental report later understands what it shows. Write 1-2 short English
sentences, strictly factual: visible equipment, samples, labels, bands, readable
text or values. No interpretation, no conclusion, no numbers you cannot read in
the image.`;

/** id d'evidence → description courte. Map vide sans clé LLM ; chaque photo
 *  échoue en silence (fichier manquant, image trop lourde, erreur API…). */
export async function describePhotos(
  db: Db,
  photos: Array<{ evidence: Evidence; stepTitle?: string }>
): Promise<Map<Id, string>> {
  const out = new Map<Id, string>();
  if (photos.length === 0 || !hasLlmKey()) return out;
  await Promise.all(
    photos.map(async ({ evidence, stepTitle }) => {
      try {
        // Deux chemins de capture : brique capturePhoto → fileId ; console de
        // run (capturePhotoRef) → source.ref = id du fichier.
        const fileId = evidence.fileId ?? evidence.source?.ref;
        if (!fileId) return;
        const [bytes, fichier] = await Promise.all([
          db.getFichierBytes(fileId),
          db.getFichier(fileId),
        ]);
        // Référence vers un stockage externe (pas de bytes locaux) → on passe.
        if (!bytes || !fichier) return;
        const caption = evidence.body ?? evidence.source?.label;
        const context = [caption && `Caption: ${caption}`, stepTitle && `Protocol step: ${stepTitle}`]
          .filter(Boolean)
          .join("\n");
        const { text } = await generateText({
          model: modelFor("protocol"),
          prompt: [
            {
              role: "user",
              content: [
                { type: "text", text: `${PROMPT}\n\n${context || "No caption."}` },
                { type: "image", image: bytes, mediaType: fichier.mime },
              ],
            },
          ],
        });
        // Valeur d'attribut HTML : monoligne.
        const clean = text.trim().replace(/\s+/g, " ");
        if (clean) out.set(evidence.id, clean);
      } catch {
        // best-effort — la photo reste sans description
      }
    })
  );
  return out;
}
