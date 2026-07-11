import { describe, it, expect, beforeAll } from "vitest";
import { createDb } from "../../adapters.standalone";
import { captureNote, captureDataFile, deleteEvidence, listEvidence } from "./index";

beforeAll(() => {
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
});

describe("Evidence Capture — deleteEvidence (suppression d'observation)", () => {
  it("supprime la preuve et la retire de la liste, en la renvoyant", async () => {
    const d = createDb(":memory:");
    const note = await captureNote(d, "run_x", "stp_1", "Trouble léger", "op1");
    await captureNote(d, "run_x", "stp_1", "Autre note", "op1");
    expect((await listEvidence(d, "run_x")).length).toBe(2);

    const removed = await deleteEvidence(d, note.id);
    expect(removed?.id).toBe(note.id);

    const rest = await listEvidence(d, "run_x");
    expect(rest.length).toBe(1);
    expect(rest.some((e) => e.id === note.id)).toBe(false);
    d.close();
  });

  it("renvoie la source du fichier (pour nettoyer le stockage d'une photo/data)", async () => {
    const d = createDb(":memory:");
    const data = await captureDataFile(
      d,
      "run_x",
      undefined,
      { storageKey: "abc/run.csv", label: "run.csv" },
      "op1"
    );
    const removed = await deleteEvidence(d, data.id);
    expect(removed?.source?.ref).toBe("abc/run.csv");
    d.close();
  });

  it("renvoie null quand la preuve n'existe pas", async () => {
    const d = createDb(":memory:");
    expect(await deleteEvidence(d, "nope")).toBeNull();
    d.close();
  });
});
