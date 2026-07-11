import { describe, it, expect, beforeAll } from "vitest";
import { createDb } from "../../adapters.standalone";
import { seedReferenceProtocol } from "../protocol-studio";
import { workflowFromProtocol, validateWorkflow, createWorkflow, listWorkflows } from "./index";

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_WORKFLOW_BUILDER = "true";
});

describe("Workflow Builder", () => {
  it("crée un workflow à partir d'un protocole et le valide (refs épinglées OK)", async () => {
    const d = createDb(":memory:");
    const proto = await seedReferenceProtocol(d, "lab1");
    const wf = await workflowFromProtocol(d, "lab1", proto.id, proto.version, "RT-qPCR run");
    expect(wf.nodes[0].protocolVersion).toBe(1);
    const res = await validateWorkflow(d, wf.id);
    expect(res.ok).toBe(true);
    expect(res.issues).toHaveLength(0);
    d.close();
  });

  it("signale un nœud pointant vers un protocole inexistant", async () => {
    const d = createDb(":memory:");
    const wf = await createWorkflow(d, "lab1", {
      title: "cassé",
      nodes: [{ id: "n1", protocolId: "pg_absent", protocolVersion: 1, label: "x" }],
    });
    const res = await validateWorkflow(d, wf.id);
    expect(res.ok).toBe(false);
    expect(res.issues[0]).toMatch(/introuvable/);
    d.close();
  });

  it("liste les workflows du lab", async () => {
    const d = createDb(":memory:");
    const proto = await seedReferenceProtocol(d, "lab1");
    await workflowFromProtocol(d, "lab1", proto.id, proto.version);
    const list = await listWorkflows(d, "lab1");
    expect(list.length).toBe(1);
    d.close();
  });
});
