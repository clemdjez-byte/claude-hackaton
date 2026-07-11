import { describe, it, expect, beforeAll } from "vitest";
import { type Db } from "../../core";
import { createDb } from "../../adapters.standalone";
import {
  captureNote,
  captureMeasurement,
  captureDeviation,
  capturePhoto,
  listEvidence,
} from "./index";

beforeAll(() => {
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
});

function db(): Db {
  return createDb(":memory:");
}

describe("Evidence Capture", () => {
  it("capture une note attachée à un step", async () => {
    const d = db();
    const ev = await captureNote(d, "run1", "stp1", "Culot bien visible", "op1");
    expect(ev.kind).toBe("note");
    expect(ev.body).toBe("Culot bien visible");
    expect(ev.runId).toBe("run1");
    expect(ev.stepId).toBe("stp1");
    expect(ev.authorId).toBe("op1");
    expect(ev.capturedAt).toBeTruthy();
    d.close();
  });

  it("refuse une note vide", async () => {
    const d = db();
    await expect(captureNote(d, "run1", "stp1", "   ", "op1")).rejects.toThrow();
    d.close();
  });

  it("capture une mesure avec unité et compose un body lisible", async () => {
    const d = db();
    const ev = await captureMeasurement(
      d,
      "run1",
      "stp1",
      { name: "A260/A280", value: 1.98, unit: "ratio", instrument: "NanoDrop" },
      "op1"
    );
    expect(ev.kind).toBe("measurement");
    expect(ev.measurement).toEqual({ value: 1.98, unit: "ratio", instrument: "NanoDrop" });
    expect(ev.body).toBe("A260/A280: 1.98 ratio");
    d.close();
  });

  it("refuse une mesure sans unité", async () => {
    const d = db();
    await expect(
      captureMeasurement(d, "run1", "stp1", { value: 12, unit: "" }, "op1")
    ).rejects.toThrow();
    d.close();
  });

  it("capture une déviation avec sa sévérité", async () => {
    const d = db();
    const ev = await captureDeviation(
      d,
      "run1",
      "stp2",
      { expected: "4 °C", actual: "22 °C", reason: "frigo en panne", severity: "major" },
      "op1"
    );
    expect(ev.kind).toBe("deviation");
    expect(ev.deviation?.severity).toBe("major");
    expect(ev.deviation?.expected).toBe("4 °C");
    d.close();
  });

  it("capture une photo : persiste le fichier puis référence son id", async () => {
    const d = db();
    const bytes = Buffer.from("fake-image-bytes");
    const ev = await capturePhoto(
      d,
      "lab1",
      "run1",
      "stp1",
      { bytes, mime: "image/png", sha256: "abc123def456ghi789" },
      "op1",
      "Gel d'agarose"
    );
    expect(ev.kind).toBe("photo");
    expect(ev.body).toBe("Gel d'agarose");
    expect(ev.fileId).toBeTruthy();
    // le binaire est bien récupérable via la couche fichier
    const stored = await d.getFichierBytes(ev.fileId!);
    expect(stored?.equals(bytes)).toBe(true);
    const fic = await d.getFichier(ev.fileId!);
    expect(fic?.storageKey).toBe("photo_abc123def456"); // sha256 court (12 car.)
    d.close();
  });

  it("attache une preuve au run seul (stepId undefined)", async () => {
    const d = db();
    const ev = await captureNote(d, "run1", undefined, "Observation globale", "op1");
    expect(ev.stepId).toBeUndefined();
    d.close();
  });

  it("listEvidence filtre par kind et par stepId", async () => {
    const d = db();
    await captureNote(d, "run1", "stp1", "note A", "op1");
    await captureNote(d, "run1", "stp2", "note B", "op1");
    await captureMeasurement(d, "run1", "stp1", { value: 7.4, unit: "pH" }, "op1");

    const all = await listEvidence(d, "run1");
    expect(all.length).toBe(3);

    const notes = await listEvidence(d, "run1", { kind: "note" });
    expect(notes.length).toBe(2);
    expect(notes.every((e) => e.kind === "note")).toBe(true);

    const step1 = await listEvidence(d, "run1", { stepId: "stp1" });
    expect(step1.length).toBe(2);
    expect(step1.every((e) => e.stepId === "stp1")).toBe(true);

    const step1Measures = await listEvidence(d, "run1", { stepId: "stp1", kind: "measurement" });
    expect(step1Measures.length).toBe(1);
    d.close();
  });

  it("respecte le flag (désactivé → throw)", async () => {
    const d = db();
    process.env.FEATURE_EVIDENCE_CAPTURE = "";
    await expect(captureNote(d, "run1", "stp1", "x", "op1")).rejects.toThrow();
    await expect(listEvidence(d, "run1")).rejects.toThrow();
    process.env.FEATURE_EVIDENCE_CAPTURE = "true";
    d.close();
  });
});
