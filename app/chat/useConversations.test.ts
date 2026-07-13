import { describe, it, expect } from "vitest";
import { titleFromMessages, nextActiveId } from "./useConversations";
import type { Conversation } from "./types";

describe("titleFromMessages", () => {
  it("titre = première question, tronquée", () => {
    expect(
      titleFromMessages([{ role: "user", content: "What went wrong in the last run?" }], 20)
    ).toBe("What went wrong in…");
  });
  it("aucun message utilisateur → défaut", () => {
    expect(titleFromMessages([])).toBe("New discussion");
  });
});

describe("nextActiveId", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }] as Conversation[];
  it("supprimer une conv non active ne change pas l'active", () => {
    expect(nextActiveId(list, "c", "a")).toBe("a");
  });
  it("supprimer l'active → voisine précédente", () => {
    expect(nextActiveId(list, "b", "b")).toBe("a");
  });
  it("supprimer la première active → nouvelle première", () => {
    expect(nextActiveId(list, "a", "a")).toBe("b");
  });
  it("supprimer la dernière conv restante → null", () => {
    expect(nextActiveId([{ id: "a" }] as Conversation[], "a", "a")).toBeNull();
  });
});
