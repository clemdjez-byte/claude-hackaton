#!/usr/bin/env node
// scripts/mcp-server.ts — serveur MCP unifié d'Octopus.
// Expose les 15 outils LECTURE SEULE du chat « Ask your lab » (lib/chat/tools.ts)
// à n'importe quel Claude (Code / Desktop / Life Sciences) via MCP (stdio).
// Il RÉUTILISE buildChatTools() : un seul endroit de vérité, jamais désynchronisé
// — un 16e outil ajouté au chat apparaît ici automatiquement.
//
// Lancé via `tsx --env-file-if-exists=.env.local scripts/mcp-server.ts` (mêmes
// alias @/ et même .env.local que les scripts seed-*, cf. package.json).
//
// Choix technique : on ne passe JAMAIS de « raw shape » Zod au SDK MCP (la racine
// est en Zod v4, le SDK attend historiquement du Zod v3). On convertit chaque
// schéma en JSON Schema pur via z.toJSONSchema() → totalement découplé de Zod.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getBenchSession } from "@/lib/session";
import { buildChatTools } from "@/lib/chat/tools";

const { store, ctx } = getBenchSession();
// buildChatTools renvoie des outils AI-SDK (inputSchema = FlexibleSchema, en
// pratique un ZodObject — cf. isZod à l'exécution). On aplatit le type pour
// itérer/exécuter uniformément ; la nature réelle du schéma est vérifiée au runtime.
const tools = buildChatTools({ db: store, ws: ctx.ws }) as unknown as Record<
  string,
  { description?: string; inputSchema?: unknown; execute: (args: unknown, opts: unknown) => Promise<unknown> }
>;

/** Un schéma d'outil AI-SDK est-il une instance Zod (a .parse / .safeParse) ? */
function isZod(schema: unknown): schema is z.ZodType {
  return (
    !!schema &&
    typeof (schema as { parse?: unknown }).parse === "function" &&
    typeof (schema as { safeParse?: unknown }).safeParse === "function"
  );
}

/** Schéma Zod (v4) → JSON Schema pur pour l'annonce MCP.
 *  `io: "input"` → les champs à valeur par défaut sont annoncés OPTIONNELS à
 *  l'appelant (le défaut est ensuite appliqué à l'exécution via .parse). */
function toJsonSchema(schema: unknown): Record<string, unknown> {
  if (isZod(schema)) return z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  // Filet : AI-SDK exposerait déjà un JSON Schema.
  const wrapped = schema as { jsonSchema?: Record<string, unknown> } | undefined;
  return wrapped?.jsonSchema ?? { type: "object" };
}

const toolList = Object.entries(tools).map(([name, t]) => ({
  name,
  description: t.description ?? name,
  inputSchema: toJsonSchema(t.inputSchema),
}));

// Guide d'usage renvoyé à Claude à l'initialisation (réponses traçables).
const INSTRUCTIONS = [
  "Octopus is a signed electronic lab notebook for AML / FLT3-ITD research.",
  "These tools are READ-ONLY: they observe the lab, never modify it.",
  "Always cite the run id (run_xxxx) or protocol id you base an answer on.",
  "Before recommending a parameter value, call check_parameter_risk.",
  "Use traverse_graph and compare_runs to explain why past runs failed.",
].join(" ");

const server = new Server(
  { name: "octopus", version: "2.0.0" },
  { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const t = tools[req.params.name];
  if (!t) {
    return { isError: true, content: [{ type: "text" as const, text: `Unknown tool: ${req.params.name}` }] };
  }
  try {
    // Valider avec le schéma Zod applique aussi les valeurs par défaut (ex. k=5)
    // que les arguments MCP bruts ne portent pas.
    const input = isZod(t.inputSchema) ? t.inputSchema.parse(req.params.arguments ?? {}) : req.params.arguments ?? {};
    const out = await t.execute(input, { toolCallId: req.params.name, messages: [] });
    return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text" as const, text: `Tool ${req.params.name} failed: ${msg}` }] };
  }
});

async function main() {
  // ── Mode diagnostic (hors Claude) : `… scripts/mcp-server.ts --probe`
  // Liste les outils, imprime le 1er JSON Schema, et exécute list_protocols pour
  // prouver que la chaîne buildChatTools → execute fonctionne. N'ouvre pas le stdio.
  if (process.argv.includes("--probe")) {
    console.error(`octopus-mcp probe — ${toolList.length} tools:`);
    for (const t of toolList) console.error(`  • ${t.name}`);
    console.error("\nfirst tool JSON Schema:\n" + JSON.stringify(toolList[0]?.inputSchema, null, 2));
    const lp = await tools.list_protocols.execute({}, { toolCallId: "probe", messages: [] });
    console.error("\nlist_protocols →\n" + JSON.stringify(lp, null, 2).slice(0, 600));
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`octopus-mcp ready (stdio) — ${toolList.length} tools`);
}

main().catch((err) => {
  console.error("octopus-mcp fatal:", err);
  process.exit(1);
});
