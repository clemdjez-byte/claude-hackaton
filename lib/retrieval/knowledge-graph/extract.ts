// lib/retrieval/knowledge-graph/extract.ts — extraction IA du KG. Deux registres :
//  1) NOYAU CHIFFRÉ (extractProtocolOntology / extractRunOntology) : structure ce
//     que le déterministe ne contient pas — ParameterTypes, réactifs, lignées,
//     FailureModes (numériques cachés dans les ⚠️ ET qualitatifs) + le verdict du
//     run. Alimente le raisonnement seuils/verdicts/recoupements de query.ts.
//  2) ONTOLOGIE OUVERTE (extractOpenGraph) : l'IA crée de NOUVEAUX types de nœuds
//     et de relations, bornés à des facettes OBJECTIVES (jamais d'interprétation).
// Dans les deux cas le LLM ne fait QUE de l'extraction textuelle (aucun calcul de
// nombre) et fail-closed : sans clé, renvoie des listes vides. Le peuplement
// déterministe restant (CITES, liens run↔protocole) vit dans la couture lib/kg.ts.
import { z } from "zod";
import { generateObjectFor, hasLlmKey, type Protocol } from "@/lib/core";
import type { Evidence, Run, ThresholdOperator, Verdict } from "@/lib/core";
import { htmlToText, type StoredReport } from "@/lib/bench/auto-report";
import { PARAMETER_TYPES, normalizeParamKey, reagentKey, cellLineKey, type SeedParameterType } from "./ontology";

export interface ExtractedFailureMode {
  paramTypeKey?: string;
  trigger?: string;
  operator?: ThresholdOperator;
  threshold?: number;
  unit?: string;
  verdict: Verdict;
  mechanism: string;
}
export interface ExtractedOntology {
  parameterTypes: SeedParameterType[];
  reagents: string[];
  cellLines: string[];
  failureModes: ExtractedFailureMode[];
}

const ProtocolSchema = z.object({
  parameterTypes: z.array(z.object({
    key: z.string(), label: z.string(), unit: z.string(), aliases: z.array(z.string()).default([]),
  })),
  reagents: z.array(z.string()).default([]),
  cellLines: z.array(z.string()).default([]),
  failureModes: z.array(z.object({
    paramLabel: z.string().nullable().default(null), // libellé param (numérique) ou null (qualitatif)
    trigger: z.string().nullable().default(null),    // condition qualitative
    operator: z.enum(["<", ">", "="]).nullable().default(null),
    threshold: z.number().nullable().default(null),
    unit: z.string().nullable().default(null),
    verdict: z.enum(["success", "failure", "partial"]),
    mechanism: z.string(),
  })),
});

const PROTOCOL_SYSTEM = `Tu extrais l'ontologie STRUCTURÉE d'un protocole de laboratoire écrit en texte libre.
Tu ne calcules ni n'inventes AUCUN nombre : tu recopies les seuils écrits (souvent dans des « ⚠️ »).
Extrait :
- parameterTypes : chaque paramètre mis en jeu (nom lisible + unité) ;
- reagents / cellLines : réactifs et lignées cellulaires mentionnés (noms lisibles) ;
- failureModes : chaque règle cause→effet. Numérique → renseigne paramLabel + operator + threshold + unit.
  Qualitative (pas de seuil chiffré) → renseigne trigger, laisse paramLabel/operator/threshold/unit à null.
N'invente pas de failureMode sans base explicite dans le texte.`;

function protocolText(p: Protocol): string {
  return [p.title, p.summary ?? "", ...p.steps.map((s) => `- ${s.title} : ${s.instruction}`)].join("\n");
}

/** Extrait ParameterTypes + réactifs + lignées + FailureModes d'un protocole.
 *  Fail-closed sans clé LLM. */
export async function extractProtocolOntology(protocol: Protocol): Promise<ExtractedOntology> {
  if (!hasLlmKey()) return { parameterTypes: [], reagents: [], cellLines: [], failureModes: [] };

  const raw = await generateObjectFor("protocol", {
    system: PROTOCOL_SYSTEM,
    prompt: protocolText(protocol),
    schema: ProtocolSchema,
  });

  // FailureModes : numériques (paramLabel normalisable) ou qualitatifs (trigger).
  const failureModes: ExtractedFailureMode[] = [];
  for (const fm of raw.failureModes) {
    if (fm.trigger && !fm.paramLabel) {
      failureModes.push({ trigger: fm.trigger, verdict: fm.verdict, mechanism: fm.mechanism });
      continue;
    }
    const key = fm.paramLabel ? normalizeParamKey(fm.paramLabel) : null;
    if (key && fm.operator != null && fm.threshold != null && fm.unit != null) {
      failureModes.push({
        paramTypeKey: key, operator: fm.operator, threshold: fm.threshold,
        unit: fm.unit, verdict: fm.verdict, mechanism: fm.mechanism,
      });
    }
  }

  // ParameterTypes : repart du vocabulaire canonique, fusionne les alias reconnus.
  const known = new Map(PARAMETER_TYPES.map((p) => [p.key, { ...p, aliases: [...p.aliases] }]));
  for (const pt of raw.parameterTypes) {
    const key = normalizeParamKey(pt.key) ?? normalizeParamKey(pt.label);
    if (!key) continue;
    const entry = known.get(key);
    if (entry) for (const a of pt.aliases) if (!entry.aliases.includes(a)) entry.aliases.push(a);
  }

  return {
    parameterTypes: [...known.values()],
    reagents: [...new Set(raw.reagents.map(reagentKey))],
    cellLines: [...new Set(raw.cellLines.map(cellLineKey))],
    failureModes,
  };
}

// ── extractRunOntology — structure un run TERMINÉ (rapport + preuves) ───────
// Passe distincte de extractProtocolOntology : ici on ne lit PAS un texte libre
// de protocole mais les FAITS déjà capturés d'un run (mesures d'evidence, notes
// du chercheur, rapport auto-généré). Mêmes garde-fous : aucun nombre inventé
// (tout est recopié des faits), et les « causes » ne sont QUE celles écrites
// par le chercheur (jamais une hypothèse du LLM). Fail-closed sans clé.

export interface RunExtraction {
  paramValues: Array<{ key: string; value: number; unit: string }>;
  reagents: string[];
  cellLines: string[];
  causes: Array<{ trigger?: string; paramTypeKey?: string; mechanism: string; verdict: Verdict }>;
  verdict: Verdict | null; // verdict du run LU dans le rapport (null s'il n'y est pas écrit)
}

const RunSchema = z.object({
  // Verdict scientifique du run, UNIQUEMENT s'il est écrit dans le rapport
  // (« échec : pas de bandes », « réussi »…). null si le texte ne le dit pas.
  verdict: z.enum(["success", "failure", "partial"]).nullable().default(null),
  paramValues: z.array(z.object({ paramLabel: z.string(), value: z.number(), unit: z.string() })).default([]),
  reagents: z.array(z.string()).default([]),
  cellLines: z.array(z.string()).default([]),
  causes: z.array(z.object({
    paramLabel: z.string().nullable().default(null),
    trigger: z.string().nullable().default(null),
    mechanism: z.string(),
    verdict: z.enum(["success", "failure", "partial"]),
  })).default([]),
});

const RUN_SYSTEM = `Tu STRUCTURES un run de laboratoire déjà réalisé, à partir des FAITS fournis. Règles absolues :
- N'utilise QUE des nombres présents dans les FAITS (mesures, notes). N'en calcule ni n'en invente AUCUN.
- verdict : le résultat scientifique du run UNIQUEMENT s'il est écrit dans le rapport (success / failure / partial). Si le texte ne dit rien du résultat, renvoie verdict: null. Ne le DÉDUIS pas.
- paramValues : les valeurs de paramètres réellement appliquées, lues dans les faits (paramLabel lisible + value + unit).
- reagents / cellLines : réactifs et lignées effectivement utilisés, mentionnés dans les faits.
- causes : UNIQUEMENT les causes que LE CHERCHEUR a écrites (ses notes, la raison d'une déviation, la raison du verdict).
  N'AJOUTE AUCUNE hypothèse de ton cru. Si le chercheur n'a écrit aucune cause, renvoie causes: [].`;

/** Assemble les FAITS du run à donner au modèle : preuves structurées d'abord (ancrage
 *  des chiffres), puis les sections textuelles du rapport. */
function runFacts(report: StoredReport | null, evidence: Evidence[]): string {
  const lines: string[] = ["## Preuves"];
  for (const e of evidence) {
    if (e.kind === "measurement" && e.measurement)
      lines.push(`- mesure: ${e.body ?? ""} = ${e.measurement.value} ${e.measurement.unit}`);
    else if (e.kind === "note") lines.push(`- note (chercheur): ${e.body ?? ""}`);
    else if (e.kind === "deviation" && e.deviation)
      lines.push(`- déviation (chercheur): prévu « ${e.deviation.expected} », réalisé « ${e.deviation.actual} »${e.deviation.reason ? ` — raison: ${e.deviation.reason}` : ""}`);
  }
  if (report) {
    // Le rapport du user est un document HTML éditable ({html}), pas des sections
    // structurées : on l'aplatit en texte lisible pour donner le contexte au modèle.
    lines.push("## Rapport", htmlToText(report.html));
  }
  return lines.join("\n");
}

/** Extrait paramValues + réactifs + lignées + causes (écrites par le chercheur) d'un
 *  run terminé. Fail-closed sans clé LLM. */
export async function extractRunOntology(
  run: Run,
  protocol: Protocol,
  report: StoredReport | null,
  evidence: Evidence[]
): Promise<RunExtraction> {
  if (!hasLlmKey()) return { paramValues: [], reagents: [], cellLines: [], causes: [], verdict: null };

  const raw = await generateObjectFor("report", {
    system: RUN_SYSTEM,
    prompt: `PROTOCOLE : ${protocol.title}\n\nFAITS DU RUN :\n${runFacts(report, evidence)}`,
    schema: RunSchema,
  });

  const paramValues = raw.paramValues
    .map((pv) => ({ key: normalizeParamKey(pv.paramLabel) ?? pv.paramLabel, value: pv.value, unit: pv.unit }));

  const causes = raw.causes.map((c) => {
    const key = c.paramLabel ? normalizeParamKey(c.paramLabel) ?? undefined : undefined;
    return key
      ? { paramTypeKey: key, mechanism: c.mechanism, verdict: c.verdict }
      : { trigger: c.trigger ?? c.mechanism, mechanism: c.mechanism, verdict: c.verdict };
  });

  return {
    paramValues,
    reagents: [...new Set(raw.reagents.map(reagentKey))],
    cellLines: [...new Set(raw.cellLines.map(cellLineKey))],
    causes,
    verdict: raw.verdict,
  };
}

// ── extractOpenGraph — ontologie OUVERTE (entités objectives + triplets) ─────
// L'IA crée de NOUVEAUX types de nœuds et relations, mais bornés à des facettes
// OBJECTIVES (enum ci-dessous) : jamais un nœud d'interprétation. Sert au texte
// d'un protocole comme au rapport signé d'un run. La sortie est réconciliée puis
// écrite par resolve.ts. Fail-closed sans clé LLM.

/** Facettes de nœud autorisées : uniquement des catégories OBJECTIVES. Toute
 *  facette d'interprétation est volontairement absente (verrou anti-hypothèse). */
const OpenGraphSchema = z.object({
  entities: z.array(z.object({
    id: z.string(), // id temporaire local ("e1"…) référencé par les triplets
    type: z.enum([
      "material", "reagent", "cell_line", "sample", "equipment", "instrument",
      "parameter", "measurement", "date", "operator", "protocol", "run",
      "outcome", "publication",
    ]),
    label: z.string(),
    aliases: z.array(z.string()).default([]),
    value: z.number().nullable().default(null), // chiffre RECOPIÉ (parameter/measurement)
    unit: z.string().nullable().default(null),
  })).default([]),
  triplets: z.array(z.object({
    subject: z.string(), relation: z.string(), object: z.string(), // ids d'entités ; relation snake_case libre
  })).default([]),
});
export type OpenGraph = z.infer<typeof OpenGraphSchema>;

/** Entité déjà connue du registre, montrée à l'IA pour qu'elle la réutilise. */
export interface KnownEntity { type: string; key: string; label: string; aliases: string[] }

const OPEN_SYSTEM = `Tu construis un GRAPHE DE CONNAISSANCES à partir d'un texte de laboratoire (protocole ou rapport de run).
Tu extrais UNIQUEMENT des éléments FACTUELS et OBJECTIFS présents dans le texte, sous forme d'ENTITÉS + de LIENS (triplets).

ENTITÉS — chacune : un id temporaire local (e1, e2…), un type (facette), un label lisible, des alias éventuels.
- Facettes autorisées : material, reagent, cell_line, sample, equipment, instrument, parameter, measurement, date, operator, protocol, run, outcome, publication.
- Valeur chiffrée (parameter/measurement) : renseigne value + unit TELS QU'ÉCRITS. Ne calcule ni n'invente AUCUN nombre.
- INTERDIT : créer une entité d'INTERPRÉTATION (cause probable, hypothèse, recommandation, tendance, risque, conclusion personnelle). Si ce n'est pas un objet/fait concret nommé dans le texte, ne le crée pas.

TRIPLETS — des liens FACTUELS ÉNONCÉS entre deux entités (par leur id) : { subject, relation, object }.
- relation : un verbe court en snake_case (uses, measured, performed_by, performed_on, cites, derived_from, has_value…).
- N'infère AUCUN lien causal non écrit. Les causes/mécanismes ne sont repris que si le chercheur les a ÉCRITS.

RÉUTILISATION : si le texte désigne une entité listée dans ENTITÉS CONNUES, reprends son label exact (ne crée pas un doublon).
Si le texte ne contient aucun fait exploitable, renvoie des listes vides.`;

function knownBlock(known: KnownEntity[]): string {
  if (!known.length) return "";
  const lines = known.map(
    (e) => `- [${e.type}] ${e.label}${e.aliases.length ? ` (alias: ${e.aliases.join(", ")})` : ""}`
  );
  return `ENTITÉS CONNUES (réutilise-les si le texte les désigne) :\n${lines.join("\n")}\n\n`;
}

/** Extrait un graphe ouvert (entités objectives + triplets) d'un texte libre.
 *  `task` route le modèle ("protocol"→Sonnet, "report"→Opus). Fail-closed. */
export async function extractOpenGraph(
  text: string,
  known: KnownEntity[],
  task: "protocol" | "report"
): Promise<OpenGraph> {
  if (!hasLlmKey()) return { entities: [], triplets: [] };
  return generateObjectFor(task, {
    system: OPEN_SYSTEM,
    prompt: `${knownBlock(known)}TEXTE :\n${text}`,
    schema: OpenGraphSchema,
  });
}

/** Graphe ouvert d'un protocole (texte des étapes). Réutilise `protocolText`. */
export function extractProtocolOpenGraph(protocol: Protocol, known: KnownEntity[]): Promise<OpenGraph> {
  return extractOpenGraph(protocolText(protocol), known, "protocol");
}

/** Graphe ouvert d'un run terminé (rapport + preuves). Réutilise `runFacts`. */
export function extractRunOpenGraph(
  protocol: Protocol,
  report: StoredReport | null,
  evidence: Evidence[],
  known: KnownEntity[]
): Promise<OpenGraph> {
  return extractOpenGraph(`PROTOCOLE : ${protocol.title}\n\nFAITS DU RUN :\n${runFacts(report, evidence)}`, known, "report");
}
