"use server";

// Server actions du Bench — partie « Protocol Studio ». Chaque action résout
// le contexte de la brique (getBenchSession), appelle une fonction de brique
// avec le store, puis revalide/redirige vers les chemins standalone. Les
// nombres viennent du calcul déterministe, jamais du LLM. Les actions liées
// aux runs (démarrage à part) arrivent avec la console de run (Task 4) ;
// startRunAction est déjà là car la fiche protocole la consomme (bouton
// « Activate at the bench »).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { startRun, generateProtocol, adaptProtocol, publishProtocol, sealDraft } from "@/lib/live-experiment";
import { getBenchSession, WS } from "@/lib/session";

function protocolPath(protocolId: string) {
  return `/bench/protocols/${protocolId}`;
}

// ── Protocoles (bibliothèque) ─────────────────────────────────────────────

/** Crée un protocole depuis une description libre (brief) et ouvre sa fiche. */
export async function generateProtocolAction(brief: string): Promise<void> {
  const { store } = getBenchSession();
  const protocol = await generateProtocol(store, WS, brief);
  redirect(protocolPath(protocol.id));
}

/** Adapte un protocole existant via une instruction en langage naturel
 *  (nouvelle version, même id logique). */
export async function adaptProtocolAction(protocolId: string, instruction: string): Promise<void> {
  const { store } = getBenchSession();
  await adaptProtocol(store, protocolId, instruction);
  revalidatePath(protocolPath(protocolId));
}

/** Publie un protocole (refuse sans source, côté brique). */
export async function publishProtocolAction(protocolId: string): Promise<void> {
  const { store } = getBenchSession();
  await publishProtocol(store, protocolId);
  revalidatePath(protocolPath(protocolId));
}

/** Fige une version immuable depuis le brouillon (draft_doc), sans publier. */
export async function sealDraftAction(protocolId: string): Promise<void> {
  const { store } = getBenchSession();
  await sealDraft(store, protocolId);
  revalidatePath(protocolPath(protocolId));
}

/** Fige une version depuis le brouillon puis démarre un run dessus (épingle
 *  la version FIGÉE, pas le brouillon mutable). */
export async function startRunAction(protocolId: string, n: number, overage: number): Promise<void> {
  const { store, ctx } = getBenchSession();
  const { version } = await sealDraft(store, protocolId);
  const runCtx = await startRun(store, WS, {
    operator: ctx.userId,
    protocolId,
    protocolVersion: version, // épingle la version FIGÉE, pas le brouillon mutable
    params: { n_reactions: n, overage_pct: overage },
  });
  redirect(`/bench/run/${runCtx.run.id}`);
}
