// lib/bench/evidence-capture/index.ts — Brique Evidence Capture.
// Responsabilité unique : attacher une preuve (note / photo / mesure / déviation)
// à un step (ou à un run), avec auteur + horodatage. Découplée du reste :
// runId/stepId sont des références OPAQUES — on ne vérifie pas qu'elles existent,
// la brique doit être testable seule.
import {
  assertEnabled,
  type Db,
  type Evidence,
  type EvidenceKind,
  type Id,
  type Ws,
} from "@/lib/core";

// ── Note libre ────────────────────────────────────────────────────────────
/** Attache une note textuelle. Le texte ne peut pas être vide. */
export async function captureNote(
  db: Db,
  runId: Id,
  stepId: string | undefined,
  text: string,
  authorId: Id
): Promise<Evidence> {
  assertEnabled("evidenceCapture");
  const body = text?.trim();
  if (!body) throw new Error("Note vide : une preuve textuelle doit porter un contenu.");
  return db.insertEvidence({ runId, stepId, authorId, kind: "note", body });
}

// ── Mesure chiffrée ───────────────────────────────────────────────────────
/** Attache une mesure. L'unité voyage toujours avec la valeur (invariant labo).
 *  `name` sert uniquement à composer le body lisible ; il n'est pas stocké dans
 *  le champ `measurement` (qui suit strictement le type Evidence). */
export async function captureMeasurement(
  db: Db,
  runId: Id,
  stepId: string | undefined,
  m: { name?: string; value: number; unit: string; instrument?: string },
  authorId: Id
): Promise<Evidence> {
  assertEnabled("evidenceCapture");
  if (!Number.isFinite(m.value)) throw new Error("Mesure invalide : valeur non numérique.");
  if (!m.unit?.trim()) throw new Error("Mesure sans unité : une quantité porte toujours son unité.");
  const measurement = { value: m.value, unit: m.unit, instrument: m.instrument };
  const body = m.name?.trim()
    ? `${m.name.trim()}: ${m.value} ${m.unit}`
    : `${m.value} ${m.unit}`;
  return db.insertEvidence({ runId, stepId, authorId, kind: "measurement", measurement, body });
}

// ── Déviation au protocole ────────────────────────────────────────────────
/** Enregistre un écart entre l'attendu et le réalisé. La sévérité est contrainte
 *  par le type ; on la re-valide à l'exécution par prudence. */
export async function captureDeviation(
  db: Db,
  runId: Id,
  stepId: string | undefined,
  d: { expected: string; actual: string; reason?: string; severity: "minor" | "major" | "critical" },
  authorId: Id
): Promise<Evidence> {
  assertEnabled("evidenceCapture");
  if (!d.expected?.trim()) throw new Error("Déviation sans « attendu ».");
  if (!d.actual?.trim()) throw new Error("Déviation sans « réalisé ».");
  if (!["minor", "major", "critical"].includes(d.severity))
    throw new Error(`Sévérité invalide : ${d.severity}.`);
  return db.insertEvidence({ runId, stepId, authorId, kind: "deviation", deviation: d });
}

// ── Photo (binaire → fichier, puis preuve qui le référence) ───────────────
/** Persiste d'abord le binaire dans `fichier`, puis crée la preuve `photo` qui
 *  pointe dessus. `caption` (optionnelle) devient le body. */
export async function capturePhoto(
  db: Db,
  ws: Ws,
  runId: Id,
  stepId: string | undefined,
  file: { bytes: Buffer; mime: string; sha256: string; storageKey?: string },
  authorId: Id,
  caption?: string
): Promise<Evidence> {
  assertEnabled("evidenceCapture");
  if (!file.sha256?.trim()) throw new Error("Photo sans empreinte sha256.");
  if (!file.mime?.trim()) throw new Error("Photo sans type MIME.");
  const fichier = await db.insertFichier({
    ws,
    storageKey: file.storageKey ?? `photo_${file.sha256.slice(0, 12)}`,
    mime: file.mime,
    sha256: file.sha256,
    bytes: file.bytes,
  });
  return db.insertEvidence({
    runId,
    stepId,
    authorId,
    kind: "photo",
    fileId: fichier.id,
    body: caption?.trim() || undefined,
  });
}

// ── Photo par référence (stockage externe, pas de table fichier) ──────────
/** Variante de `capturePhoto` pour les hôtes dont le binaire vit AILLEURS
 *  (ex. Sylvy : bucket de stockage, `insertFichier` dormant). La preuve `photo`
 *  référence la clé de stockage via `source` — le cœur ne voit jamais le bucket. */
export async function capturePhotoRef(
  db: Db,
  runId: Id,
  stepId: string | undefined,
  ref: { storageKey: string; label?: string },
  authorId: Id,
  caption?: string
): Promise<Evidence> {
  assertEnabled("evidenceCapture");
  if (!ref.storageKey?.trim()) throw new Error("Photo sans clé de stockage.");
  return db.insertEvidence({
    runId,
    stepId,
    authorId,
    kind: "photo",
    body: caption?.trim() || undefined,
    source: { kind: "url", ref: ref.storageKey, label: ref.label },
  });
}

// ── Fichier de données par référence (CSV, Excel, PDF… d'un instrument) ────
/** Attache un FICHIER DE DONNÉES au run (même tuyauterie que `capturePhotoRef` :
 *  le binaire vit dans le bucket, la preuve `data` référence la clé de stockage).
 *  Vocation : récupérer la donnée brute d'un outil/instrument. `label` = nom du
 *  fichier (affiché + téléchargement) ; `caption` (optionnelle) devient le body. */
export async function captureDataFile(
  db: Db,
  runId: Id,
  stepId: string | undefined,
  ref: { storageKey: string; label?: string },
  authorId: Id,
  caption?: string
): Promise<Evidence> {
  assertEnabled("evidenceCapture");
  if (!ref.storageKey?.trim()) throw new Error("Fichier de données sans clé de stockage.");
  return db.insertEvidence({
    runId,
    stepId,
    authorId,
    kind: "data",
    body: caption?.trim() || ref.label,
    source: { kind: "url", ref: ref.storageKey, label: ref.label },
  });
}

// ── Suppression ───────────────────────────────────────────────────────────
/** Supprime une preuve. Renvoie la preuve supprimée (ou null si absente) pour
 *  que l'hôte puisse nettoyer un éventuel binaire de stockage (photo / data). */
export async function deleteEvidence(db: Db, id: Id): Promise<Evidence | null> {
  assertEnabled("evidenceCapture");
  const ev = await db.getEvidence(id);
  if (!ev) return null;
  await db.deleteEvidence(id);
  return ev;
}

// ── Lecture filtrée ───────────────────────────────────────────────────────
/** Liste les preuves d'un run, filtrables par step et par nature. */
export async function listEvidence(
  db: Db,
  runId: Id,
  opts?: { stepId?: string; kind?: EvidenceKind }
): Promise<Evidence[]> {
  assertEnabled("evidenceCapture");
  return db.listEvidence(runId, opts);
}
