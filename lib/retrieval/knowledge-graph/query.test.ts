// lib/live-experiment/features/knowledge-graph/query.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "@/lib/core";
import { link } from "./index";
import { NODE, REL } from "./ontology";
import { collectGraphFacts, renderGraphFacts, collectGenericFacts, renderGenericFacts, loadLabels, collectGraphBlock, hitsToAnchors } from "./query";
import type { Db } from "@/lib/core";

beforeEach(() => { process.env.FEATURE_KNOWLEDGE_GRAPH = "true"; });

// Construit un mini-graphe : protocole p1, run r1 échec (trypsination 2min) attribué à fm1.
async function seedGraph(db: Db) {
  const fm = await db.insertFailureMode({
    ws: "demo", protocolId: "p1", paramTypeKey: "trypsination_time",
    operator: "<", threshold: 3, unit: "min", verdict: "failure",
    mechanism: "cellules restent adhérentes",
  });
  const oc = await db.insertOutcome({ ws: "demo", runId: "r1", verdict: "failure" });
  await link(db, "demo", NODE.run("r1"), REL.instanceOf, NODE.protocol("p1"));
  await link(db, "demo", NODE.run("r1"), REL.hasValue, NODE.parameterType("trypsination_time"), { attrs: { value: 2, unit: "min" } });
  await link(db, "demo", NODE.run("r1"), REL.resultedIn, NODE.outcome(oc.id));
  await link(db, "demo", NODE.outcome(oc.id), REL.attributedTo, NODE.failureMode(fm.id), { attrs: { observed: 2, unit: "min" } });
  return { fm, oc };
}

describe("query", () => {
  it("collecte les faits d'un protocole ancre", async () => {
    const db = createDb(":memory:");
    await seedGraph(db);
    const facts = await collectGraphFacts(db, "demo", [NODE.protocol("p1")]);
    expect(facts.runs.length).toBe(1);
    const rf = facts.runs[0];
    expect(rf.runId).toBe("r1");
    expect(rf.verdict).toBe("failure");
    expect(rf.params.find((p) => p.key === "trypsination_time")?.value).toBe(2);
    expect(rf.attributions[0].mechanism).toBe("cellules restent adhérentes");
    expect(rf.attributions[0].observed).toBe(2);
    db.close();
  });

  it("collecte depuis un run ancre (remonte au protocole)", async () => {
    const db = createDb(":memory:");
    await seedGraph(db);
    const facts = await collectGraphFacts(db, "demo", [NODE.run("r1")]);
    expect(facts.runs.map((r) => r.runId)).toContain("r1");
    db.close();
  });

  it("rend un bloc texte avec tags [type:id] et chiffres", async () => {
    const db = createDb(":memory:");
    await seedGraph(db);
    const facts = await collectGraphFacts(db, "demo", [NODE.protocol("p1")]);
    const text = renderGraphFacts(facts);
    expect(text).toContain("[run:r1]");
    expect(text).toContain("trypsination_time");
    expect(text).toContain("2");
    db.close();
  });

  it("détecte un facteur d'échec partagé entre protocoles", async () => {
    const db = createDb(":memory:");
    await seedGraph(db); // p1 échoue sur trypsination_time
    // p2 échoue aussi sur trypsination_time
    const fm2 = await db.insertFailureMode({
      ws: "demo", protocolId: "p2", paramTypeKey: "trypsination_time",
      operator: "<", threshold: 3, unit: "min", verdict: "failure", mechanism: "idem",
    });
    const oc2 = await db.insertOutcome({ ws: "demo", runId: "r2", verdict: "failure" });
    await link(db, "demo", NODE.run("r2"), REL.instanceOf, NODE.protocol("p2"));
    await link(db, "demo", NODE.run("r2"), REL.resultedIn, NODE.outcome(oc2.id));
    await link(db, "demo", NODE.outcome(oc2.id), REL.attributedTo, NODE.failureMode(fm2.id), { attrs: { observed: 1, unit: "min" } });

    const facts = await collectGraphFacts(db, "demo", [NODE.protocol("p1"), NODE.protocol("p2")]);
    const cross = facts.crossProtocol.find((c) => c.paramTypeKey === "trypsination_time");
    expect(cross).toBeDefined();
    expect(new Set(cross!.protocolIds)).toEqual(new Set(["p1", "p2"]));
    db.close();
  });

  it("rend une attribution qualitative (trigger, sans seuil)", async () => {
    const db = createDb(":memory:");
    const fm = await db.insertFailureMode({ ws: "demo", protocolId: "p1", verdict: "failure", mechanism: "stress", trigger: "PBS au lieu du milieu" });
    const oc = await db.insertOutcome({ ws: "demo", runId: "r9", verdict: "failure" });
    await link(db, "demo", NODE.run("r9"), REL.instanceOf, NODE.protocol("p1"));
    await link(db, "demo", NODE.run("r9"), REL.resultedIn, NODE.outcome(oc.id));
    await link(db, "demo", NODE.outcome(oc.id), REL.attributedTo, NODE.failureMode(fm.id), { attrs: { mechanism: "stress" } });
    const facts = await collectGraphFacts(db, "demo", [NODE.protocol("p1")]);
    const text = renderGraphFacts(facts);
    expect(text).toContain("PBS au lieu du milieu");
    expect(text).toContain("stress");
    expect(text).not.toContain("viole le seuil"); // pas de formulation numérique
    db.close();
  });
});

describe("voie générique (ontologie ouverte)", () => {
  it("rend une arête ouverte depuis une ancre, avec label, et EXCLUT les relations noyau", async () => {
    const db = createDb(":memory:");
    await seedGraph(db); // pose instance_of / has_value / resulted_in / attributed_to (noyau)
    // Arête ouverte : le run r1 a été réalisé sur un instrument (nœud kg_node).
    await db.upsertKgEntity({ ws: "demo", type: "instrument", key: "confocal_zeiss", label: "Confocal Zeiss", aliases: [] });
    await link(db, "demo", NODE.run("r1"), "performed_on", { type: "instrument", id: "confocal_zeiss" }, { provenance: "extracted", confidence: 0.8 });

    const generic = await collectGenericFacts(db, "demo", [NODE.run("r1")]);
    const relations = generic.map((e) => e.relation);
    expect(relations).toContain("performed_on");
    // Les relations du noyau chiffré ne doivent PAS ressortir ici (pas de doublon).
    expect(relations).not.toContain(REL.instanceOf);
    expect(relations).not.toContain(REL.hasValue);
    expect(relations).not.toContain(REL.attributedTo);

    const labels = await loadLabels(db, "demo");
    const text = renderGenericFacts(generic, labels);
    expect(text).toContain("performed_on");
    expect(text).toContain("[instrument:confocal_zeiss]");
    expect(text).toContain("Confocal Zeiss"); // label injecté
    db.close();
  });

  it("écarte une arête sous le seuil de confiance", async () => {
    const db = createDb(":memory:");
    await link(db, "demo", NODE.run("r1"), "weak_link", { type: "operator", id: "x" }, { provenance: "extracted", confidence: 0.2 });
    const generic = await collectGenericFacts(db, "demo", [NODE.run("r1")]);
    expect(generic.map((e) => e.relation)).not.toContain("weak_link");
    db.close();
  });
});

describe("hitsToAnchors", () => {
  it("mappe runs/protocoles en ancres directes, rattache rapport/preuve à leur run, dédup et ignore le reste", () => {
    const anchors = hitsToAnchors([
      { sourceType: "run", sourceId: "r1" },
      { sourceType: "protocol", sourceId: "p1" },
      { sourceType: "report", sourceId: "rep1", meta: { runId: "r2" } },
      { sourceType: "evidence", sourceId: "ev1", meta: { runId: "r1" } }, // → run r1 : dédupliqué
      { sourceType: "report", sourceId: "rep2" }, // pas de meta.runId → ignoré
      { sourceType: "note", sourceId: "n1" }, // type non ancrable → ignoré
    ]);
    expect(anchors).toEqual([
      { type: "run", id: "r1" },
      { type: "protocol", id: "p1" },
      { type: "run", id: "r2" },
    ]);
  });
});

describe("collectGraphBlock", () => {
  it("fusionne noyau chiffré + triplets ouverts dans graphBlock et expose facts/generic/labels", async () => {
    const db = createDb(":memory:");
    await seedGraph(db);
    await db.upsertKgEntity({ ws: "demo", type: "instrument", key: "confocal_zeiss", label: "Confocal Zeiss", aliases: [] });
    await link(db, "demo", NODE.run("r1"), "performed_on", { type: "instrument", id: "confocal_zeiss" }, { provenance: "extracted", confidence: 0.8 });

    const { graphBlock, facts, generic, labels } = await collectGraphBlock(db, "demo", [NODE.run("r1")]);
    expect(facts.runs.map((r) => r.runId)).toContain("r1");
    expect(graphBlock).toContain("[run:r1]"); // noyau chiffré rendu
    expect(graphBlock).toContain("performed_on"); // triplet ouvert fusionné dans le même bloc
    expect(generic.map((e) => e.relation)).toContain("performed_on");
    expect(labels.get("instrument:confocal_zeiss")).toBe("Confocal Zeiss");
    db.close();
  });

  it("renvoie un graphBlock vide quand l'ancre n'a aucun fait (repli des appelants)", async () => {
    const db = createDb(":memory:");
    const { graphBlock, facts } = await collectGraphBlock(db, "demo", [NODE.run("absent")]);
    expect(graphBlock).toBe("");
    expect(facts.runs).toHaveLength(0);
    db.close();
  });
});
