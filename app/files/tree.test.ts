import { describe, it, expect } from "vitest";
import { descendantIds, canMoveFolder, breadcrumb, childFolders } from "./tree";
import type { Folder } from "@/lib/core";

// Arbre de référence : Alpha (racine) > Beta > Gamma, plus Delta et Echo en
// racine (Echo avant Delta alphabétiquement, pour vérifier le tri).
function folder(id: string, name: string, parentId: string | null): Folder {
  return { id, ws: "ws", name, parentId, createdAt: "2026-01-01T00:00:00.000Z" };
}

const ALPHA = folder("a", "Alpha", null);
const BETA = folder("b", "Beta", "a");
const GAMMA = folder("c", "Gamma", "b");
const DELTA = folder("d", "Delta", null);
const ECHO = folder("e", "Echo", null);

const TREE: Folder[] = [ALPHA, BETA, GAMMA, DELTA, ECHO];

describe("descendantIds", () => {
  it("A>B>C : les descendants de A sont {B, C}", () => {
    const ids = descendantIds(TREE, "a");
    expect(ids).toEqual(new Set(["b", "c"]));
  });

  it("les descendants d'une feuille sont vides", () => {
    expect(descendantIds(TREE, "c")).toEqual(new Set());
  });

  it("un dossier racine sans lien n'est pas compté (pas de faux positif)", () => {
    const ids = descendantIds(TREE, "a");
    expect(ids.has("d")).toBe(false);
    expect(ids.has("e")).toBe(false);
  });
});

describe("canMoveFolder (anti-cycle)", () => {
  it("refuse A → B (B descend directement de A)", () => {
    expect(canMoveFolder(TREE, "a", "b")).toBe(false);
  });

  it("refuse A → C (C descend transitivement de A via B)", () => {
    expect(canMoveFolder(TREE, "a", "c")).toBe(false);
  });

  it("refuse A → A (pas de cible = soi-même)", () => {
    expect(canMoveFolder(TREE, "a", "a")).toBe(false);
  });

  it("accepte A → null (déplacement vers la racine)", () => {
    expect(canMoveFolder(TREE, "a", null)).toBe(true);
  });

  it("accepte A → D (dossier hors du sous-arbre de A)", () => {
    expect(canMoveFolder(TREE, "a", "d")).toBe(true);
  });
});

describe("breadcrumb", () => {
  it("chemin de C = [A, B]", () => {
    expect(breadcrumb(TREE, "c")).toEqual([ALPHA, BETA]);
  });

  it("chemin d'un dossier racine = []", () => {
    expect(breadcrumb(TREE, "a")).toEqual([]);
  });

  it("folderId null (racine) = []", () => {
    expect(breadcrumb(TREE, null)).toEqual([]);
  });
});

describe("childFolders", () => {
  it("childFolders(null) = dossiers racine triés par nom", () => {
    expect(childFolders(TREE, null)).toEqual([ALPHA, DELTA, ECHO]);
  });

  it("childFolders(a) = enfants directs de A", () => {
    expect(childFolders(TREE, "a")).toEqual([BETA]);
  });

  it("childFolders d'une feuille = []", () => {
    expect(childFolders(TREE, "c")).toEqual([]);
  });
});
