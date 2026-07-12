import { describe, it, expect, beforeAll } from "vitest";
import { type Db } from "@/lib/core";
import { createDb } from "@/lib/core/sqlite";
import {
  seedReferenceProtocol,
  getProtocol,
  listProtocols,
  publishProtocol,
  updateProtocol,
  previewScaledRecipe,
  createProtocol,
  sealDraft,
} from "./index";
import { docToSteps } from "./doc";
import { RT_QPCR_REFERENCE } from "./reference";

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
});

function db(): Db {
  return createDb(":memory:");
}

describe("Protocol Studio", () => {
  it("sème le protocole RT-qPCR de référence, sourcé", async () => {
    const d = db();
    const p = await seedReferenceProtocol(d, "lab1");
    expect(p.version).toBe(1);
    expect(p.status).toBe("draft");
    expect(p.sources.length).toBeGreaterThan(0);
    expect(p.recipe?.components.some((c) => c.perWell)).toBe(true); // le template
    d.close();
  });

  it("previewScaledRecipe reproduit les chiffres déterministes (24 réactions)", async () => {
    const d = db();
    const p = await seedReferenceProtocol(d, "lab1");
    const scaled = previewScaledRecipe(p, 24, 10)!;
    const byName = Object.fromEntries(scaled.components.map((c) => [c.name, c.total.value]));
    expect(byName["Master mix 2×"]).toBe(264.0);
    expect(byName["Eau nuclease-free"]).toBe(184.8);
    expect(scaled.sharedTotal.value).toBe(475.2);
    d.close();
  });

  it("utilise les paramètres par défaut du protocole quand n non fourni (6 réactions)", async () => {
    const d = db();
    const p = await seedReferenceProtocol(d, "lab1");
    const scaled = previewScaledRecipe(p)!; // n_reactions default = 6, overage 10
    expect(scaled.sharedTotal.value).toBe(118.8);
    d.close();
  });

  it("versionne à l'update et refuse la publication sans source", async () => {
    const d = db();
    const p = await seedReferenceProtocol(d, "lab1");
    const v2 = await updateProtocol(d, p.id, { title: "RT-qPCR (adapté)" });
    expect(v2.version).toBe(2);
    expect(v2.title).toBe("RT-qPCR (adapté)");
    const pub = await publishProtocol(d, p.id);
    expect(pub.status).toBe("published");
    // publishProtocol passe désormais par sealDraft : il renvoie la version FIGÉE
    // (l'ancienne latest, v2), pas le nouveau brouillon mutable qui avance à v3.
    expect(pub.version).toBe(2);
    d.close();
  });

  it("liste les protocoles du lab (dernière version)", async () => {
    const d = db();
    await seedReferenceProtocol(d, "lab1");
    await seedReferenceProtocol(d, "lab1");
    const list = await listProtocols(d, "lab1");
    expect(list.length).toBe(2);
    d.close();
  });

  it("getProtocol respecte le flag (désactivé → throw)", async () => {
    const d = db();
    process.env.FEATURE_PROTOCOL_STUDIO = "";
    await expect(getProtocol(d, "pg_x")).rejects.toThrow();
    process.env.FEATURE_PROTOCOL_STUDIO = "true";
    d.close();
  });
});

describe("draft_doc : seme, figeage, immutabilité", () => {
  it("createProtocol seme draft_doc reflétant les étapes", async () => {
    const db = createDb();
    const p = await createProtocol(db, "ws1", RT_QPCR_REFERENCE);
    const page = await db.getPage(p.id);
    expect(page?.draftDoc).toBeTruthy();
    expect(docToSteps(page!.draftDoc)).toHaveLength(RT_QPCR_REFERENCE.steps.length);
    db.close();
  });

  it("sealDraft fige une version immuable et fait avancer le brouillon", async () => {
    const db = createDb();
    const p = await createProtocol(db, "ws1", RT_QPCR_REFERENCE); // v1 (latest)
    const { version, protocol } = await sealDraft(db, p.id);
    expect(version).toBe(1); // la version figée = l'ancienne latest
    expect(protocol.version).toBe(1);
    const latest = await getProtocol(db, p.id); // le brouillon avance en v2
    expect(latest?.version).toBe(2);
    db.close();
  });

  it("éditer le brouillon après figeage ne mute PAS la version figée", async () => {
    const db = createDb();
    const p = await createProtocol(db, "ws1", RT_QPCR_REFERENCE);
    const { version } = await sealDraft(db, p.id);           // fige v1, brouillon = v2
    await db.updateDraft(p.id, { title: "Titre modifié" });   // édite v2
    const frozen = await getProtocol(db, p.id, version);
    expect(frozen?.title).toBe(RT_QPCR_REFERENCE.title);      // v1 intacte
    db.close();
  });

  it("publishProtocol refuse sans source et réussit avec source", async () => {
    const db = createDb();
    const noSrc = { ...RT_QPCR_REFERENCE, sources: [] };
    const p = await createProtocol(db, "ws1", noSrc);
    await expect(publishProtocol(db, p.id)).rejects.toThrow(/source/i);

    const p2 = await createProtocol(db, "ws1", RT_QPCR_REFERENCE);
    const pub = await publishProtocol(db, p2.id);
    expect(pub.status).toBe("published");
    db.close();
  });

  it("adapter les étapes (updateProtocol) resynchronise draftDoc → sealDraft ne réverte pas l'adaptation", async () => {
    const db = createDb();
    const p = await createProtocol(db, "ws1", RT_QPCR_REFERENCE);
    await updateProtocol(db, p.id, {
      steps: [{ index: 0, title: "Étape adaptée", instruction: "nouvelle instruction" }],
    });
    const { version } = await sealDraft(db, p.id);
    const frozen = await getProtocol(db, p.id, version);
    expect(frozen?.steps.map((s) => s.title)).toEqual(["Étape adaptée"]);
    db.close();
  });

  it("sealDraft refuse un protocole sans étape", async () => {
    const db = createDb();
    const p = await createProtocol(db, "ws1", RT_QPCR_REFERENCE);
    await updateProtocol(db, p.id, { steps: [] });
    await expect(sealDraft(db, p.id)).rejects.toThrow(/aucune étape/i);
    db.close();
  });
});
