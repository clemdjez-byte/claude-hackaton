// lib/retrieval/knowledge-graph/ontology.ts — source unique de vérité de
// l'ontologie du KG : types de nœuds « noyau », noms de relations « noyau »,
// vocabulaire canonique des ParameterType et normalisation d'alias. Les
// producteurs d'arêtes (couture hôte lib/kg.ts) et l'extracteur ouvert
// (extract.ts + resolve.ts) s'y réfèrent → cohérence garantie. En ontologie
// OUVERTE, l'IA peut créer de nouveaux types/relations hors de ces constantes ;
// `canonicalKey` sert alors à réconcilier les entités par une clé normalisée.
// Module PUR : aucun `db`, aucun LLM, aucun effet de bord.

export type KgNode = { type: string; id: string };

/** Builders de nœuds typés. Les hubs canoniques (parameterType/reagent) ont
 *  pour id une CLÉ normalisée → un seul nœud partagé entre protocoles/runs. */
export const NODE = {
  protocol: (id: string): KgNode => ({ type: "protocol", id }),
  run: (id: string): KgNode => ({ type: "run", id }),
  report: (id: string): KgNode => ({ type: "report", id }),
  outcome: (id: string): KgNode => ({ type: "outcome", id }),
  failureMode: (id: string): KgNode => ({ type: "failure_mode", id }),
  parameterType: (key: string): KgNode => ({ type: "parameter_type", id: key }),
  reagent: (key: string): KgNode => ({ type: "reagent", id: key }),
  cellLine: (key: string): KgNode => ({ type: "cell_line", id: key }),
  publication: (ref: string): KgNode => ({ type: "publication", id: ref }),
} as const;

/** Relations typées (chaînes stables : servent aux requêtes `listEdges`). */
export const REL = {
  instanceOf: "instance_of", // Run → Protocol
  hasValue: "has_value", // Run → ParameterType (attrs {value,unit})
  usesParam: "uses_param", // Protocol → ParameterType
  uses: "uses", // Run|Protocol → Reagent
  resultedIn: "resulted_in", // Run → Outcome
  producedReport: "produced_report", // Run → Report (rattache le rapport à son expérience)
  cites: "cites", // Protocol → Publication
  declares: "declares", // Protocol → FailureMode
  about: "about", // FailureMode → ParameterType
  attributedTo: "attributed_to", // Outcome → FailureMode
} as const;

export type ThresholdOperator = "<" | ">" | "=";

export interface SeedParameterType {
  key: string;
  label: string;
  unit: string;
  aliases: string[];
}

/** Vocabulaire canonique de départ (protocole de marquage). Extensible : en B,
 *  l'extracteur ajoute de nouveaux alias au vocabulaire via upsertParameterType. */
export const PARAMETER_TYPES: SeedParameterType[] = [
  {
    key: "trypsination_time",
    label: "Temps de trypsination",
    unit: "min",
    aliases: ["trypsination", "temps de trypsination", "temps trypsine", "trypsin time"],
  },
  {
    key: "cell_density",
    label: "Densité cellulaire",
    unit: "cells/mL",
    aliases: [
      "densite cellulaire",
      "concentration cellulaire",
      "concentration de cellules",
      "confluence",
      "seeding density",
    ],
  },
  {
    key: "mitotracker_conc",
    label: "Concentration MitoTracker",
    unit: "nM",
    aliases: ["mitotracker", "concentration mitotracker", "mitotracker conc"],
  },
  {
    key: "hoechst_conc",
    label: "Concentration Hoechst",
    unit: "nM",
    aliases: ["hoechst", "concentration hoechst"],
  },
  {
    key: "staining_incubation_time",
    label: "Temps d'incubation du marquage",
    unit: "min",
    aliases: ["incubation marquage", "temps de marquage", "staining time", "temps d'incubation"],
  },
  {
    key: "pfa_exposure_time",
    label: "Temps d'exposition au PFA",
    unit: "min",
    aliases: ["pfa", "temps pfa", "temps de fixation", "fixation pfa", "exposition pfa"],
  },
];

/** Minuscule + sans accents + espaces compactés : base de comparaison des alias. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CANON = new Map<string, string>();
for (const pt of PARAMETER_TYPES) {
  CANON.set(fold(pt.key), pt.key);
  for (const a of pt.aliases) CANON.set(fold(a), pt.key);
}

/** Libellé brut → clé canonique (via clé ou alias), sinon null. */
export function normalizeParamKey(raw: string): string | null {
  return CANON.get(fold(raw)) ?? null;
}

/** `operator` décrit la zone DANGEREUSE d'un FailureMode :
 *  '<' seuil → danger si valeur < seuil ; '>' → danger si valeur > seuil ;
 *  '=' seuil → danger si valeur ≠ seuil (écart à la valeur attendue). */
export function violatesThreshold(
  operator: ThresholdOperator,
  threshold: number,
  value: number
): boolean {
  switch (operator) {
    case "<":
      return value < threshold;
    case ">":
      return value > threshold;
    case "=":
      return value !== threshold;
  }
}

/** Slug canonique : minuscule, sans accents, non-alphanumérique → « _ ». */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Clé canonique d'un réactif (« MitoTracker » → « mitotracker »). */
export function reagentKey(name: string): string {
  return slug(name);
}

/** Clé canonique d'une lignée cellulaire. */
export function cellLineKey(name: string): string {
  return slug(name);
}

/** Clé canonique GÉNÉRIQUE d'une entité de l'ontologie ouverte. Les facettes
 *  chiffrées (parameter/measurement) passent par le vocabulaire canonique des
 *  ParameterType s'il les connaît (pour retomber sur le hub du noyau chiffré),
 *  sinon slug ; toutes les autres facettes (reagent, instrument, operator,
 *  sample, date…) sont simplement sluggées. Deux libellés qui se sluggent pareil
 *  → même nœud (réconciliation de base ; la résolution in-context fait le reste). */
export function canonicalKey(type: string, raw: string): string {
  if (type === "parameter" || type === "measurement") return normalizeParamKey(raw) ?? slug(raw);
  return slug(raw);
}
