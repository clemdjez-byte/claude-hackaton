// features/protocol-studio/index.ts — Brique 1.
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
  const page = await db.insertPage({
    ws,
    type: "protocol",
    title: draft.title,
    content: draftToContent(draft),
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
  const page = await db.newPageVersion(id, { title: merged.title, content: merged });
  return pageToProtocol(page);
}

export async function publishProtocol(db: Db, id: Id): Promise<Protocol> {
  assertEnabled("protocolStudio");
  const cur = await getProtocol(db, id);
  if (!cur) throw new Error(`Protocole introuvable : ${id}`);
  if (cur.sources.length === 0)
    throw new Error("Publication refusée : un protocole publié doit citer au moins une source.");
  const content: ProtocolContent = { ...toContent(cur), status: "published" };
  const page = await db.newPageVersion(id, { content });
  return pageToProtocol(page);
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
