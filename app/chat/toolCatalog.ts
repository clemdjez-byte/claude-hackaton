// app/chat/toolCatalog.ts — métadonnées CLIENT des outils du copilote (aucun
// import serveur). Sert deux surfaces : le fil des étapes (ToolSteps, libellés)
// et le menu « Tools » (activation manuelle). La source de vérité des outils
// eux-mêmes reste lib/chat/tools.ts côté serveur ; ici on ne décrit que le nom,
// le libellé, la catégorie et un indice d'usage.

export type ToolCategory = "Search & read" | "Knowledge graph" | "Calculation" | "Comparison" | "Tables & stats";

export type ToolMeta = {
  name: string;
  label: string;
  category: ToolCategory;
  hint: string;
};

export const TOOL_CATALOG: ToolMeta[] = [
  // Search & read
  { name: "search_memory", label: "Search memory", category: "Search & read", hint: "Semantic search across protocols, runs, evidence, reports" },
  { name: "read_report", label: "Read full report", category: "Search & read", hint: "Read a run's complete signed report" },
  { name: "list_protocols", label: "List protocols", category: "Search & read", hint: "All protocols with version and status" },
  { name: "list_runs", label: "List runs", category: "Search & read", hint: "Runs with verdict — filter by success/failure/partial" },
  { name: "list_measurements", label: "List measurements", category: "Search & read", hint: "Raw measurements of a run (name × value × unit)" },
  // Knowledge graph
  { name: "traverse_graph", label: "Traverse knowledge graph", category: "Knowledge graph", hint: "Follow typed relations outward from an entity" },
  // Calculation (deterministic)
  { name: "scale_recipe", label: "Scale recipe", category: "Calculation", hint: "Scale a master mix to N reactions (exact volumes)" },
  { name: "dilute", label: "Dilution (C1·V1 = C2·V2)", category: "Calculation", hint: "Stock + diluent volumes for a target concentration" },
  { name: "convert_units", label: "Convert units", category: "Calculation", hint: "Volume / mass / molarity between compatible units" },
  { name: "molarity_calc", label: "Molarity (mass ↔ conc ↔ volume)", category: "Calculation", hint: "Solve m = C·V·MW for a stock preparation" },
  // Comparison
  { name: "compare_runs", label: "Compare runs", category: "Comparison", hint: "Runs side by side; flags what differs" },
  { name: "check_parameter_risk", label: "Check parameter risk", category: "Comparison", hint: "Warn if a value violates a documented failure mode" },
  // Tables & stats
  { name: "cross_tab_ic50", label: "Metric table (line × drug)", category: "Tables & stats", hint: "Grid of IC50 (or any metric) by cell line and drug" },
  { name: "summarize_metric", label: "Summarize a metric", category: "Tables & stats", hint: "n, mean, median, sd, min, max on a filtered set" },
  { name: "aggregate_runs", label: "Aggregate runs", category: "Tables & stats", hint: "Success rate / counts grouped by protocol, line, drug…" },
];

/** name → libellé lisible, pour le fil des étapes d'outils. */
export const TOOL_LABELS: Record<string, string> = Object.fromEntries(
  TOOL_CATALOG.map((t) => [t.name, t.label])
);

/** Ordre d'affichage des catégories dans le menu. */
export const TOOL_CATEGORIES: ToolCategory[] = [
  "Search & read",
  "Knowledge graph",
  "Calculation",
  "Comparison",
  "Tables & stats",
];
