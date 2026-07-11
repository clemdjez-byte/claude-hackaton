import { describe, it, expect } from "vitest";
import { windowId, reduceWindows, initialWindows } from "./useWindows";

describe("windowId", () => {
  it("stable et sans params", () => {
    expect(windowId("chat")).toBe("chat");
  });
  it("intègre les params triés", () => {
    expect(windowId("report", { runId: "run_1" })).toBe("report:runId=run_1");
    expect(windowId("protocol", { pageId: "pg_1" })).toBe("protocol:pageId=pg_1");
  });
  it("trie les clés indépendamment de l'ordre d'insertion (déterminisme)", () => {
    expect(windowId("run", { runId: "r1", stepId: "s1" })).toBe(
      windowId("run", { stepId: "s1", runId: "r1" })
    );
  });
});

describe("reduceWindows", () => {
  it("open ajoute une fenêtre float avec un rect et un z croissant", () => {
    let s = initialWindows();
    s = reduceWindows(s, { type: "open", kind: "chat" });
    expect(s.windows).toHaveLength(1);
    expect(s.windows[0]).toMatchObject({ id: "chat", kind: "chat", layout: "float" });
    expect(s.windows[0].rect).toEqual(
      expect.objectContaining({ left: expect.any(Number), top: expect.any(Number), width: expect.any(Number), height: expect.any(Number) })
    );
  });

  it("open utilise le titre par défaut si aucun titre fourni, sinon le titre explicite", () => {
    let s = initialWindows();
    s = reduceWindows(s, { type: "open", kind: "chat" });
    expect(s.windows[0].title).toBeTruthy();
    s = reduceWindows(s, { type: "open", kind: "report", params: { runId: "r1" }, title: "Run r1 report" });
    expect(s.windows.find((w) => w.id === "report:runId=r1")?.title).toBe("Run r1 report");
  });

  it("dédup : ouvrir deux fois la même page ne crée qu'une fenêtre et la met au premier plan", () => {
    let s = initialWindows();
    s = reduceWindows(s, { type: "open", kind: "report", params: { runId: "r1" } });
    s = reduceWindows(s, { type: "open", kind: "chat" });
    s = reduceWindows(s, { type: "open", kind: "report", params: { runId: "r1" } });
    expect(s.windows.filter((w) => w.id === "report:runId=r1")).toHaveLength(1);
    expect(s.windows).toHaveLength(2);
    const report = s.windows.find((w) => w.id === "report:runId=r1")!;
    const chat = s.windows.find((w) => w.id === "chat")!;
    expect(report.z).toBeGreaterThan(chat.z);
  });

  it("focus met la fenêtre ciblée au premier plan sans changer les autres", () => {
    let s = initialWindows();
    s = reduceWindows(s, { type: "open", kind: "chat" });
    s = reduceWindows(s, { type: "open", kind: "files" });
    const filesZBefore = s.windows.find((w) => w.id === "files")!.z;
    s = reduceWindows(s, { type: "focus", id: "chat" });
    const chat = s.windows.find((w) => w.id === "chat")!;
    const files = s.windows.find((w) => w.id === "files")!;
    expect(chat.z).toBeGreaterThan(files.z);
    expect(files.z).toBe(filesZBefore);
  });

  it("toggleFullscreen bascule float↔full et refocalise", () => {
    let s = initialWindows();
    s = reduceWindows(s, { type: "open", kind: "chat" });
    s = reduceWindows(s, { type: "open", kind: "files" }); // passe devant
    const id = "chat";
    s = reduceWindows(s, { type: "toggleFullscreen", id });
    expect(s.windows.find((w) => w.id === id)?.layout).toBe("full");
    expect(s.windows.find((w) => w.id === id)?.z).toBeGreaterThan(
      s.windows.find((w) => w.id === "files")!.z
    );
    s = reduceWindows(s, { type: "toggleFullscreen", id });
    expect(s.windows.find((w) => w.id === id)?.layout).toBe("float");
  });

  it("close retire la fenêtre", () => {
    let s = initialWindows();
    s = reduceWindows(s, { type: "open", kind: "files" });
    s = reduceWindows(s, { type: "close", id: s.windows[0].id });
    expect(s.windows).toHaveLength(0);
  });

  it("close d'un id inconnu ne fait rien (pas de throw)", () => {
    let s = initialWindows();
    s = reduceWindows(s, { type: "open", kind: "files" });
    s = reduceWindows(s, { type: "close", id: "nope" });
    expect(s.windows).toHaveLength(1);
  });

  it("setTitle met à jour uniquement le titre de la fenêtre ciblée", () => {
    let s = initialWindows();
    s = reduceWindows(s, { type: "open", kind: "chat" });
    s = reduceWindows(s, { type: "open", kind: "files" });
    s = reduceWindows(s, { type: "setTitle", id: "chat", title: "Ask Nova" });
    expect(s.windows.find((w) => w.id === "chat")?.title).toBe("Ask Nova");
    expect(s.windows.find((w) => w.id === "files")?.title).not.toBe("Ask Nova");
  });

  it("setRect met à jour le rect de la fenêtre ciblée sans toucher aux autres champs", () => {
    let s = initialWindows();
    s = reduceWindows(s, { type: "open", kind: "chat" });
    const before = s.windows[0];
    const newRect = { left: 10, top: 20, width: 300, height: 400 };
    s = reduceWindows(s, { type: "setRect", id: "chat", rect: newRect });
    const after = s.windows[0];
    expect(after.rect).toEqual(newRect);
    expect(after.z).toBe(before.z);
    expect(after.layout).toBe(before.layout);
  });

  it("state est un nouvel objet (pas de mutation en place) — la référence précédente reste inchangée", () => {
    const s0 = initialWindows();
    const s1 = reduceWindows(s0, { type: "open", kind: "chat" });
    expect(s0.windows).toHaveLength(0);
    expect(s1.windows).toHaveLength(1);
    expect(s1).not.toBe(s0);
  });
});

describe("activeId (calculé depuis windows via useWindows)", () => {
  it("est la fenêtre au z le plus élevé, null si aucune fenêtre", () => {
    let s = initialWindows();
    expect(s.windows.length ? s.windows[0].id : null).toBeNull();
    s = reduceWindows(s, { type: "open", kind: "chat" });
    s = reduceWindows(s, { type: "open", kind: "files" });
    const maxZ = s.windows.reduce((a, b) => (a.z >= b.z ? a : b));
    expect(maxZ.id).toBe("files");
    s = reduceWindows(s, { type: "focus", id: "chat" });
    const maxZ2 = s.windows.reduce((a, b) => (a.z >= b.z ? a : b));
    expect(maxZ2.id).toBe("chat");
  });
});
