// lib/bench/protocol-studio/index.ts — Brique 1.
// Responsabilité unique : rédiger / éditer / VERSIONNER / publier des protocoles
// sourcés. S'appuie sur la primitive `page` (type='protocol'). Aucune autre brique.
import {
  assertEnabled,
  generateObjectFor,
  scaleMasterMix,
  type Db,
  type Protocol,
  type Recipe,
  type ResolvedRecipe,
  type Page,
  type Ws,
  type Id,
} from "@/lib/core";
import { ProtocolDraftSchema, type ProtocolDraft } from "./schema";
import { RT_QPCR_REFERENCE } from "./reference";
import { docToSteps, stepsToDoc } from "./doc";

export { RT_QPCR_REFERENCE } from "./reference";
export type { ProtocolDraft } from "./schema";

type ProtocolContent = Omit<Protocol, "id" | "ws" | "version">;

function draftToContent(draft: ProtocolDraft, status: Protocol["status"] = "draft"): ProtocolContent {
  return {
    title: draft.title,
    status,
    summary: draft.summary,
    materials: draft.materials,
    steps: draft.steps,
    parameters: draft.parameters,
    recipe: draft.recipe,
    sources: draft.sources,
  };
}

function pageToProtocol(page: Page): Protocol {
  const c = page.content as ProtocolContent;
  return { id: page.id, ws: page.ws, version: page.version, ...c };
}

// ── CRUD versionné ──────────────────────────────────────────────────────
export async function createProtocol(db: Db, ws: Ws, draft: ProtocolDraft): Promise<Protocol> {
  assertEnabled("protocolStudio");
  validateDraft(draft);
  const content = draftToContent(draft);
  const page = await db.insertPage({
    ws,
    type: "protocol",
    title: draft.title,
    content,
    draftDoc: stepsToDoc(content.steps),
  });
  return pageToProtocol(page);
}

export async function updateProtocol(
  db: Db,
  id: Id,
  patch: Partial<ProtocolDraft>
): Promise<Protocol> {
  assertEnabled("protocolStudio");
  const cur = await getProtocol(db, id);
  if (!cur) throw new Error(`Protocole introuvable : ${id}`);
  const merged: ProtocolContent = { ...toContent(cur), ...patch };
  const page = await db.newPageVersion(id, { title: merged.title, content: merged, draftDoc: stepsToDoc(merged.steps) });
  return pageToProtocol(page);
}

export async function publishProtocol(db: Db, id: Id): Promise<Protocol> {
  assertEnabled("protocolStudio");
  const cur = await getProtocol(db, id);
  if (!cur) throw new Error(`Protocole introuvable : ${id}`);
  if (cur.sources.length === 0)
    throw new Error("Publication refusée : un protocole publié doit citer au moins une source.");
  const { protocol } = await sealDraft(db, id, { status: "published" });
  return protocol;
}

/** Fige une version IMMUABLE depuis le brouillon (draft_doc) : dérive les étapes,
 *  valide, met le content à jour sur la ligne courante, puis scelle. Renvoie le
 *  numéro de la version figée (celle que le run doit épingler). Le brouillon avance
 *  en une nouvelle version latest mutable. Si le draft_doc est absent (protocole non
 *  encore ouvert dans l'éditeur-document), on retombe sur content.steps. */
export async function sealDraft(
  db: Db,
  id: Id,
  opts?: { status?: Protocol["status"] }
): Promise<{ version: number; protocol: Protocol }> {
  assertEnabled("protocolStudio");
  const page = await db.getPage(id);
  if (!page || page.type !== "protocol") throw new Error(`Protocole introuvable : ${id}`);
  const cur = pageToProtocol(page);
  const steps = page.draftDoc ? docToSteps(page.draftDoc) : cur.steps;
  if (steps.length === 0) throw new Error("Protocole non figeable : aucune étape.");
  const content: ProtocolContent = { ...toContent(cur), steps, ...(opts?.status ? { status: opts.status } : {}) };
  // Garde-fou : la structure figée doit être un ProtocolDraft valide.
  const check = ProtocolDraftSchema.safeParse(content);
  if (!check.success) {
    throw new Error(`Protocole non figeable : ${check.error.issues[0]?.message ?? "structure invalide"}`);
  }
  const frozenVersion = page.version;
  // 1. Rendre la ligne courante (qui va devenir la version figée) exacte.
  await db.updateDraft(id, { title: content.title, content });
  // 2. Sceller : l'ancienne latest devient immuable, une nouvelle latest (brouillon) est créée.
  await db.newPageVersion(id, { title: content.title, content });
  const frozen = await getProtocol(db, id, frozenVersion);
  if (!frozen) throw new Error(`Version figée introuvable : ${id}@v${frozenVersion}`);
  return { version: frozenVersion, protocol: frozen };
}

export async function getProtocol(db: Db, id: Id, version?: number): Promise<Protocol | null> {
  assertEnabled("protocolStudio");
  const page = await db.getPage(id, version);
  return page && page.type === "protocol" ? pageToProtocol(page) : null;
}

export async function listProtocols(
  db: Db,
  ws: Ws,
  filter?: { status?: Protocol["status"] }
): Promise<Protocol[]> {
  assertEnabled("protocolStudio");
  const pages = await db.listPages(ws, { type: "protocol", latestOnly: true });
  let protocols = pages.map(pageToProtocol);
  if (filter?.status) protocols = protocols.filter((p) => p.status === filter.status);
  return protocols;
}

// ── Génération / adaptation par Claude (Sonnet 5) ───────────────────────
const GEN_SYSTEM = `Tu es un assistant de laboratoire précis et sourcé.
Tu produis des protocoles de biologie moléculaire structurés et RÉALISTES.
Règles absolues :
- N'invente jamais une valeur : chaque affirmation notable porte une source (sources[]).
- La recette (master mix) est donnée PAR RÉACTION uniquement. Ne calcule JAMAIS de volume mis à l'échelle : le scaling est fait par du code déterministe, pas par toi.
- Marque critical:true les étapes où une déviation compromet le résultat.
- Sois concret et concis, ton de chercheur senior. Réponds en français.`;

export async function generateProtocol(db: Db, ws: Ws, brief: string): Promise<Protocol> {
  assertEnabled("protocolStudio");
  const draft = await generateObjectFor("protocol", {
    system: GEN_SYSTEM,
    prompt: `Génère un protocole complet et sourcé à partir de cet objectif :\n\n${brief}`,
    schema: ProtocolDraftSchema,
  });
  return createProtocol(db, ws, draft);
}

export async function adaptProtocol(db: Db, id: Id, instruction: string): Promise<Protocol> {
  assertEnabled("protocolStudio");
  const cur = await getProtocol(db, id);
  if (!cur) throw new Error(`Protocole introuvable : ${id}`);
  const draft = await generateObjectFor("protocol", {
    system:
      GEN_SYSTEM +
      `\nTu ADAPTES un protocole existant. Conserve ce qui n'est pas concerné par la demande. Si la demande change le nombre de réactions/échantillons, mets à jour le paramètre parameters[key=n_reactions].default — mais ne calcule aucun volume mis à l'échelle.`,
    prompt: `Protocole actuel (JSON) :\n${JSON.stringify(toContent(cur))}\n\nDemande d'adaptation :\n${instruction}`,
    schema: ProtocolDraftSchema,
  });
  return updateProtocol(db, id, draft);
}

// Variante « depuis un DOCUMENT » : au lieu de générer à partir d'un objectif,
// on EXTRAIT/normalise le protocole décrit dans un document fourni (texte brut,
// possiblement bruité par un OCR). Même schéma, même modèle — system-prompt
// orienté fidélité au document plutôt que génération libre.
const DOC_SYSTEM = `Tu es un assistant de laboratoire précis et sourcé.
Tu EXTRAIS un protocole de biologie depuis un DOCUMENT fourni (texte brut, éventuellement issu d'un OCR imparfait) et tu le normalises en un protocole structuré et RÉALISTE.
Règles absolues :
- Fidélité au document : n'invente pas d'étapes ni de valeurs absentes. Corrige seulement le bruit d'OCR évident.
- La recette (master mix) est donnée PAR RÉACTION uniquement. Ne calcule JAMAIS de volume mis à l'échelle : le scaling est fait par du code déterministe, pas par toi.
- Marque critical:true les étapes où une déviation compromet le résultat.
- sources[] : cite le document source (kind:"sop") et toute référence qu'il contient (DOI/URL).
- Sois concret et concis, ton de chercheur senior. Réponds en français.`;

export async function generateProtocolFromDocument(
  db: Db,
  ws: Ws,
  documentText: string,
  instructions?: string
): Promise<Protocol> {
  assertEnabled("protocolStudio");
  const guidance = instructions?.trim()
    ? `Consignes de l'utilisateur (prioritaires sur la forme du document) :\n${instructions.trim()}\n\n`
    : "";
  const draft = await generateObjectFor("protocol", {
    system: DOC_SYSTEM,
    prompt: `${guidance}Voici le(s) document(s) décrivant le protocole. Extrais-le et normalise-le :\n\n${documentText}`,
    schema: ProtocolDraftSchema,
  });
  return createProtocol(db, ws, draft);
}

export async function seedReferenceProtocol(db: Db, ws: Ws): Promise<Protocol> {
  assertEnabled("protocolStudio");
  return createProtocol(db, ws, RT_QPCR_REFERENCE);
}

// ── Scaling déterministe (aperçu du master mix) ─────────────────────────
/** Résout le master mix pour n réactions. Les nombres viennent de `calc`,
 *  jamais du LLM. `n`/`overagePct` par défaut = paramètres du protocole. */
export function previewScaledRecipe(
  protocol: Protocol,
  n?: number,
  overagePct?: number
): ResolvedRecipe | null {
  if (!protocol.recipe) return null;
  const nReactions = n ?? paramDefault(protocol, "n_reactions", 6);
  const overage = overagePct ?? paramDefault(protocol, "overage_pct", 10);
  return scaleMasterMix(protocol.recipe as Recipe, nReactions, overage);
}

// ── helpers ──────────────────────────────────────────────────────────────
function toContent(p: Protocol): ProtocolContent {
  const { id: _id, ws: _ws, version: _v, ...rest } = p;
  void _id;
  void _ws;
  void _v;
  return rest;
}

function paramDefault(p: Protocol, key: string, fallback: number): number {
  return p.parameters.find((x) => x.key === key)?.default ?? fallback;
}

function validateDraft(draft: ProtocolDraft): void {
  if (!draft.title?.trim()) throw new Error("Protocole sans titre.");
  if (draft.steps.length === 0) throw new Error("Protocole sans étape.");
}
