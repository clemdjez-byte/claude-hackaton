// Logique d'arbre des dossiers — fonctions pures, aucune dépendance
// React/DOM. Consommées par l'API (garde anti-cycle, cascade de
// suppression) et par l'UI (fil d'Ariane, vue du dossier courant).
import type { Folder, Id } from "@/lib/core";

/** Tous les descendants (récursif) de `rootId`, sans jamais inclure `rootId`. */
export function descendantIds(folders: Folder[], rootId: Id): Set<Id> {
  const childrenByParent = new Map<Id, Folder[]>();
  for (const f of folders) {
    if (f.parentId === null) continue;
    const siblings = childrenByParent.get(f.parentId) ?? [];
    siblings.push(f);
    childrenByParent.set(f.parentId, siblings);
  }

  const result = new Set<Id>();
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const folder = stack.pop()!;
    result.add(folder.id);
    stack.push(...(childrenByParent.get(folder.id) ?? []));
  }
  return result;
}

/** Garde anti-cycle : un dossier ne peut pas devenir son propre enfant, ni
 *  celui d'un de ses descendants. `targetId = null` (racine) est toujours permis. */
export function canMoveFolder(folders: Folder[], dragId: Id, targetId: Id | null): boolean {
  if (targetId === null) return true;
  if (targetId === dragId) return false;
  return !descendantIds(folders, dragId).has(targetId);
}

/** Chemin des ANCÊTRES de `folderId`, racine en premier — n'inclut pas
 *  `folderId` lui-même (l'appelant l'ajoute séparément, ex. titre courant).
 *  Vide si `folderId` est null (racine) ou déjà un dossier racine. */
export function breadcrumb(folders: Folder[], folderId: Id | null): Folder[] {
  if (folderId === null) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));

  const path: Folder[] = [];
  let parentId = byId.get(folderId)?.parentId ?? null;
  while (parentId !== null) {
    const parent = byId.get(parentId);
    if (!parent) break;
    path.unshift(parent);
    parentId = parent.parentId;
  }
  return path;
}

/** Enfants directs de `parentId` (null = dossiers racine), triés par nom. */
export function childFolders(folders: Folder[], parentId: Id | null): Folder[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));
}
