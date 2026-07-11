import { describe, it, expect, beforeAll } from "vitest";
import { createDb } from "@/lib/core/sqlite";
import { capturePhotoRef, listEvidence } from "./index";

beforeAll(() => {
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
});

describe("Evidence Capture — capturePhotoRef (photo par référence)", () => {
  it("crée une preuve photo qui référence la clé de stockage via source", async () => {
    const d = createDb(":memory:");
    const e = await capturePhotoRef(
      d,
      "run_x",
      "stp_1",
      { storageKey: "abc/gel.png", label: "gel.png" },
      "op1",
      "Gel après migration"
    );
    expect(e.kind).toBe("photo");
    expect(e.source).toEqual({ kind: "url", ref: "abc/gel.png", label: "gel.png" });
    expect(e.body).toBe("Gel après migration");

    const list = await listEvidence(d, "run_x", { kind: "photo" });
    expect(list.length).toBe(1);
    expect(list[0].source?.ref).toBe("abc/gel.png");
    d.close();
  });

  it("refuse une photo sans clé de stockage", async () => {
    const d = createDb(":memory:");
    await expect(
      capturePhotoRef(d, "run_x", undefined, { storageKey: " " }, "op1")
    ).rejects.toThrow();
    d.close();
  });
});
