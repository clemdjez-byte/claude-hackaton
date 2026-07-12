// lib/bench/workflow-builder/index.ts — Brique 2.
// Responsabilité unique : composer des protocoles en template exécutable (DAG),
// en ÉPINGLANT les versions. S'appuie sur la primitive `page` (type='workflow').
import {
  assertEnabled,
  type Db,
  type Id,
  type Page,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
  type Ws,
} from "@/lib/core";
import { getProtocol } from "../protocol-studio";

type WorkflowContent = Omit<Workflow, "id" | "ws" | "version">;

function pageToWorkflow(page: Page): Workflow {
  const c = page.content as WorkflowContent;
  return { id: page.id, ws: page.ws, version: page.version, ...c };
}

export interface NewWorkflow {
  title: string;
  nodes: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export async function createWorkflow(db: Db, ws: Ws, input: NewWorkflow): Promise<Workflow> {
  assertEnabled("workflowBuilder");
  if (input.nodes.length === 0) throw new Error("Un workflow doit avoir au moins un nœud.");
  const content: WorkflowContent = {
    title: input.title,
    nodes: input.nodes,
    edges: input.edges ?? linearEdges(input.nodes),
  };
  const page = await db.insertPage({ ws, type: "workflow", title: input.title, content });
  return pageToWorkflow(page);
}

/** Chemin le plus fréquent en démo : un protocole → un workflow linéaire à un nœud. */
export async function workflowFromProtocol(
  db: Db,
  ws: Ws,
  protocolId: Id,
  protocolVersion: number,
  title?: string
): Promise<Workflow> {
  assertEnabled("workflowBuilder");
  const node: WorkflowNode = {
    id: "n1",
    protocolId,
    protocolVersion,
    label: title ?? "Étape unique",
  };
  return createWorkflow(db, ws, { title: title ?? "Workflow", nodes: [node], edges: [] });
}

export async function updateWorkflow(
  db: Db,
  id: Id,
  patch: Partial<NewWorkflow>
): Promise<Workflow> {
  assertEnabled("workflowBuilder");
  const cur = await getWorkflow(db, id);
  if (!cur) throw new Error(`Workflow introuvable : ${id}`);
  const content: WorkflowContent = {
    title: patch.title ?? cur.title,
    nodes: patch.nodes ?? cur.nodes,
    edges: patch.edges ?? cur.edges,
  };
  const page = await db.newPageVersion(id, { title: content.title, content });
  return pageToWorkflow(page);
}

export async function getWorkflow(db: Db, id: Id, version?: number): Promise<Workflow | null> {
  assertEnabled("workflowBuilder");
  const page = await db.getPage(id, version);
  return page && page.type === "workflow" ? pageToWorkflow(page) : null;
}

export async function listWorkflows(db: Db, ws: Ws): Promise<Workflow[]> {
  assertEnabled("workflowBuilder");
  const pages = await db.listPages(ws, { type: "workflow", latestOnly: true });
  return pages.map(pageToWorkflow);
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

/** Vérifie que chaque nœud pointe vers un protocole@version qui existe. */
export async function validateWorkflow(db: Db, id: Id): Promise<ValidationResult> {
  assertEnabled("workflowBuilder");
  const wf = await getWorkflow(db, id);
  if (!wf) return { ok: false, issues: [`Workflow introuvable : ${id}`] };
  const issues: string[] = [];
  for (const node of wf.nodes) {
    const proto = await getProtocol(db, node.protocolId, node.protocolVersion);
    if (!proto)
      issues.push(
        `Nœud « ${node.label} » : protocole ${node.protocolId}@v${node.protocolVersion} introuvable.`
      );
  }
  const nodeIds = new Set(wf.nodes.map((n) => n.id));
  for (const e of wf.edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to))
      issues.push(`Arête ${e.from}→${e.to} référence un nœud inexistant.`);
  }
  return { ok: issues.length === 0, issues };
}

function linearEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
  return edges;
}
