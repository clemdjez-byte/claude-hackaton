// lib/bench/protocol-studio/doc.ts — sérialiseurs PURS entre le document Tiptap
// (surface d'édition) et les étapes structurées (épine exécutable). Aucun runtime
// Tiptap ici : on lit/écrit du JSON nu. docToSteps est load-bearing : il produit
// la structure que la console de run consomme → validé par ProtocolStepSchema.
import type { ProtocolStep } from "@/lib/core/types";
import { ProtocolStepSchema } from "./schema";
import { PROTOCOL_STEP_NODE } from "./node-contract";

export { PROTOCOL_STEP_NODE };

type TiptapNode = { type?: string; attrs?: Record<string, unknown>; content?: TiptapNode[]; text?: string };
type TiptapDoc = { type?: string; content?: TiptapNode[] };

/** Concatène le texte d'un sous-arbre Tiptap, en séparant les blocs par un saut de ligne. */
function richTextToPlain(nodes: TiptapNode[] = []): string {
  const parts: string[] = [];
  for (const n of nodes) {
    if (n.type === "text") parts.push(n.text ?? "");
    else if (n.content) parts.push(richTextToPlain(n.content));
    if (n.type === "paragraph" || n.type === "heading") parts.push("\n");
  }
  return parts.join("").replace(/\n+$/g, "").trim();
}

export function docToSteps(doc: unknown): ProtocolStep[] {
  const nodes = (doc as TiptapDoc)?.content ?? [];
  const steps: ProtocolStep[] = [];
  let index = 0;
  for (const n of nodes) {
    if (n.type !== PROTOCOL_STEP_NODE) continue; // prose libre ignorée
    const a = n.attrs ?? {};
    const title = String(a.title ?? "").trim();
    if (!title) throw new Error(`Étape ${index + 1} : titre manquant.`);
    const raw: Record<string, unknown> = {
      index,
      title,
      instruction: richTextToPlain(n.content),
    };
    if (a.durationSec != null) raw.durationSec = a.durationSec;
    if (a.temperature != null) raw.temperature = a.temperature;
    if (a.critical) raw.critical = true;
    const parsed = ProtocolStepSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Étape ${index + 1} invalide : ${parsed.error.issues[0]?.message ?? "structure incorrecte"}`);
    }
    steps.push(parsed.data);
    index++;
  }
  return steps;
}

export function stepsToDoc(steps: ProtocolStep[]): { type: "doc"; content: unknown[] } {
  return {
    type: "doc",
    content: steps.map((s) => ({
      type: PROTOCOL_STEP_NODE,
      attrs: {
        index: s.index,
        title: s.title,
        durationSec: s.durationSec ?? null,
        temperature: s.temperature ?? null,
        critical: s.critical ?? false,
      },
      content: [
        { type: "paragraph", content: s.instruction ? [{ type: "text", text: s.instruction }] : [] },
      ],
    })),
  };
}
