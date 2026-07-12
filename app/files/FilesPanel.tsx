"use client";

// Panneau explorateur de fichiers — arborescence dépliable (façon Finder en vue
// liste) : chaque dossier se déplie/replie sur place via son chevron, ses
// sous-dossiers et rapports apparaissent indentés. Créer / renommer / supprimer
// les dossiers, recherche plein-texte, déplacer par glisser-déposer natif
// (HTML5) sur une ligne-dossier. Les rapports n'ont pas de nom éditable ici —
// l'API des rapports (PATCH /api/files/reports/[id]) ne porte que `folderId` :
// seuls leur emplacement et leur suppression sont pilotés d'ici.
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useWindowsContext } from "@/app/shell/WindowsContext";
import { childFolders, breadcrumb } from "@/app/files/tree";
import type { FolderMeta, PageMeta } from "./types";
import { FolderRowIcon, ReportRowIcon, ChevronIcon, PencilIcon, NewFolderIcon, NewFileIcon } from "./icons";

type FilesResponse = { folders: FolderMeta[]; reports: PageMeta[] };
type DragItem = { kind: "folder" | "report"; id: string };
type DropTarget = { folderId: string | null } | null;
type RenameTarget = { id: string; value: string } | null;
type DragProps = {
  draggable: boolean;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
};
type DropProps = {
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDragLeave: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
};

const INDENT = 18; // px par niveau de profondeur

export default function FilesPanel() {
  const { open } = useWindowsContext();
  const [data, setData] = useState<FilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState<RenameTarget>(null);

  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);

  // Voir FilesPanel d'origine : garde-fou contre le blur fantôme après Échap.
  const editGuardRef = useRef(false);

  const fetchFiles = useCallback(async (): Promise<FilesResponse> => {
    const res = await fetch("/api/files");
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return (await res.json()) as FilesResponse;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchFiles()
      .then((body) => {
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load files.");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchFiles]);

  async function refresh() {
    try {
      setData(await fetchFiles());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh files.");
    }
  }

  const folders = data?.folders ?? [];
  const reports = data?.reports ?? [];

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // --- Créer / renommer / supprimer (dossiers créés à la racine) ---

  function startCreateFolder() {
    setRenaming(null);
    editGuardRef.current = false;
    setNewFolderName("");
    setCreatingFolder(true);
  }
  function cancelCreateFolder() {
    if (editGuardRef.current) return;
    editGuardRef.current = true;
    setCreatingFolder(false);
  }
  async function commitCreateFolder() {
    if (editGuardRef.current) return;
    editGuardRef.current = true;
    const name = newFolderName.trim();
    setCreatingFolder(false);
    if (!name) return;
    try {
      const res = await fetch("/api/files/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: null }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create folder.");
    }
  }

  function startRenameFolder(folder: FolderMeta) {
    setCreatingFolder(false);
    editGuardRef.current = false;
    setRenaming({ id: folder.id, value: folder.name });
  }
  function cancelRenameFolder() {
    if (editGuardRef.current) return;
    editGuardRef.current = true;
    setRenaming(null);
  }
  async function commitRenameFolder() {
    if (editGuardRef.current) return;
    editGuardRef.current = true;
    const target = renaming;
    setRenaming(null);
    if (!target) return;
    const name = target.value.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/files/folders/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename folder.");
    }
  }

  async function deleteFolder(folder: FolderMeta) {
    if (!confirm(`Delete folder "${folder.name}" and its contents?`)) return;
    try {
      const res = await fetch(`/api/files/folders/${folder.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete folder.");
    }
  }

  async function deleteReport(report: PageMeta) {
    if (!confirm(`Delete "${report.title}"?`)) return;
    try {
      const res = await fetch(`/api/files/reports/${report.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete report.");
    }
  }

  // --- Glisser-déposer (natif HTML5) ---

  async function moveItem(item: DragItem, targetFolderId: string | null) {
    try {
      if (item.kind === "folder") {
        const folder = folders.find((f) => f.id === item.id);
        if (!folder || folder.parentId === targetFolderId || item.id === targetFolderId) return;
        // interdit de déposer un dossier dans un de ses descendants
        if (targetFolderId && breadcrumb(folders, targetFolderId).some((a) => a.id === item.id)) return;
        const res = await fetch(`/api/files/folders/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: targetFolderId }),
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
      } else {
        const report = reports.find((r) => r.id === item.id);
        if (!report || (report.folderId ?? null) === targetFolderId) return;
        const res = await fetch(`/api/files/reports/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move item.");
    }
  }

  function dragSourceProps(item: DragItem): DragProps {
    return {
      draggable: true,
      onDragStart: (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", `${item.kind}:${item.id}`);
        setDragItem(item);
      },
      onDragEnd: () => {
        setDragItem(null);
        setDropTarget(null);
      },
    };
  }

  function dropTargetProps(targetFolderId: string | null): DropProps {
    return {
      onDragOver: (e) => {
        if (!dragItem) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropTarget({ folderId: targetFolderId });
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        const item = dragItem;
        setDragItem(null);
        setDropTarget(null);
        if (item) void moveItem(item, targetFolderId);
      },
    };
  }

  if (!data && !error) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (!data && error) return <div className="p-6 text-sm text-danger">{error}</div>;

  const q = query.trim().toLowerCase();
  const rootFolders = childFolders(folders, null);
  const rootReports = reports.filter((r) => (r.folderId ?? null) === null).sort((a, b) => a.title.localeCompare(b.title));
  const isEmpty = rootFolders.length === 0 && rootReports.length === 0 && !creatingFolder;

  const ctx: TreeCtx = {
    folders,
    reports,
    expanded,
    toggle,
    renaming,
    setRenameValue: (v) => setRenaming((r) => (r ? { ...r, value: v } : r)),
    commitRename: () => void commitRenameFolder(),
    cancelRename: cancelRenameFolder,
    startRename: startRenameFolder,
    deleteFolder: (f) => void deleteFolder(f),
    openReport: (r) => (r.runId ? open("report", { runId: r.runId }) : undefined),
    deleteReport: (r) => void deleteReport(r),
    dragItem,
    dropTarget,
    dragSourceProps,
    dropTargetProps,
  };

  const searchMatches = q
    ? [
        ...folders.filter((f) => f.name.toLowerCase().includes(q)).map((f) => ({ kind: "folder" as const, item: f })),
        ...reports.filter((r) => r.title.toLowerCase().includes(q)).map((r) => ({ kind: "report" as const, item: r })),
      ]
    : [];

  return (
    <div className="files-panel">
      <div className="files-toolbar" {...dropTargetProps(null)}>
        <nav className="files-crumbs" aria-label="Breadcrumb">
          <span className="files-crumb muted">Workspace</span>
          <span className="files-crumb-sep">›</span>
          <span className="files-crumb current">Files</span>
        </nav>
        <div className="files-tools">
          <input
            className="files-search"
            placeholder="Search files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="files-tool-btn" onClick={startCreateFolder} aria-label="New folder" title="New folder">
            <NewFolderIcon />
          </button>
          <span className="files-tool-btn soon" aria-disabled title="Reports come from experiments">
            <NewFileIcon />
          </span>
        </div>
      </div>

      {error && <p className="px-5 py-2 text-sm text-danger">{error}</p>}

      <div className="files-tree">
        {q ? (
          searchMatches.length === 0 ? (
            <p className="files-empty">No match for “{query}”.</p>
          ) : (
            searchMatches.map(({ kind, item }) =>
              kind === "folder" ? (
                <div key={`f-${item.id}`} className="tree-row" style={{ paddingLeft: 14 }}>
                  <span className="tree-chevron-space" />
                  <FolderRowIcon />
                  <span className="tree-name">{item.name}</span>
                </div>
              ) : (
                <button
                  key={`r-${item.id}`}
                  type="button"
                  className="tree-row report"
                  style={{ paddingLeft: 14 }}
                  onClick={() => item.runId && open("report", { runId: item.runId })}
                >
                  <span className="tree-chevron-space" />
                  <ReportRowIcon />
                  <span className="tree-name">{item.title}</span>
                </button>
              )
            )
          )
        ) : (
          <>
            {creatingFolder && (
              <div className="tree-row" style={{ paddingLeft: 14 }}>
                <span className="tree-chevron-space" />
                <FolderRowIcon />
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onBlur={() => void commitCreateFolder()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") cancelCreateFolder();
                  }}
                  placeholder="Folder name"
                  className="tree-input"
                />
              </div>
            )}
            {isEmpty ? (
              <p className="files-empty">This workspace has no files yet.</p>
            ) : (
              <>
                {rootFolders.map((f) => (
                  <TreeFolder key={f.id} folder={f} depth={0} ctx={ctx} />
                ))}
                {rootReports.map((r) => (
                  <TreeReport key={r.id} report={r} depth={0} ctx={ctx} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type TreeCtx = {
  folders: FolderMeta[];
  reports: PageMeta[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  renaming: RenameTarget;
  setRenameValue: (v: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  startRename: (f: FolderMeta) => void;
  deleteFolder: (f: FolderMeta) => void;
  openReport: (r: PageMeta) => void;
  deleteReport: (r: PageMeta) => void;
  dragItem: DragItem | null;
  dropTarget: DropTarget;
  dragSourceProps: (item: DragItem) => DragProps;
  dropTargetProps: (folderId: string | null) => DropProps;
};

function TreeFolder({ folder, depth, ctx }: { folder: FolderMeta; depth: number; ctx: TreeCtx }) {
  const isOpen = ctx.expanded.has(folder.id);
  const isRenaming = ctx.renaming?.id === folder.id;
  const isOver = ctx.dropTarget?.folderId === folder.id;
  const subFolders = childFolders(ctx.folders, folder.id);
  const subReports = ctx.reports
    .filter((r) => (r.folderId ?? null) === folder.id)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <>
      <div
        className={`tree-row folder${isOpen ? " open" : ""}${isOver ? " drop-over" : ""}`}
        style={{ paddingLeft: 14 + depth * INDENT }}
        {...(isRenaming ? {} : ctx.dragSourceProps({ kind: "folder", id: folder.id }))}
        {...ctx.dropTargetProps(folder.id)}
        onClick={() => !isRenaming && ctx.toggle(folder.id)}
      >
        <span className="tree-chevron">
          <ChevronIcon open={isOpen} />
        </span>
        <FolderRowIcon />
        {isRenaming ? (
          <input
            autoFocus
            value={ctx.renaming!.value}
            onChange={(e) => ctx.setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={ctx.commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") ctx.cancelRename();
            }}
            className="tree-input"
          />
        ) : (
          <span className="tree-name">{folder.name}</span>
        )}
        {!isRenaming && (
          <div className="tree-actions">
            <button
              type="button"
              aria-label="Rename folder"
              title="Rename"
              onClick={(e) => {
                e.stopPropagation();
                ctx.startRename(folder);
              }}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              aria-label="Delete folder"
              title="Delete"
              className="danger"
              onClick={(e) => {
                e.stopPropagation();
                ctx.deleteFolder(folder);
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
      {isOpen && (
        <>
          {subFolders.map((sf) => (
            <TreeFolder key={sf.id} folder={sf} depth={depth + 1} ctx={ctx} />
          ))}
          {subReports.map((sr) => (
            <TreeReport key={sr.id} report={sr} depth={depth + 1} ctx={ctx} />
          ))}
          {subFolders.length === 0 && subReports.length === 0 && (
            <p className="tree-empty" style={{ paddingLeft: 14 + (depth + 1) * INDENT + 20 }}>
              Empty
            </p>
          )}
        </>
      )}
    </>
  );
}

function TreeReport({ report, depth, ctx }: { report: PageMeta; depth: number; ctx: TreeCtx }) {
  const canOpen = Boolean(report.runId);
  return (
    <div
      className={`tree-row report${canOpen ? "" : " disabled"}`}
      style={{ paddingLeft: 14 + depth * INDENT }}
      {...ctx.dragSourceProps({ kind: "report", id: report.id })}
      onClick={() => canOpen && ctx.openReport(report)}
    >
      <span className="tree-chevron-space" />
      <ReportRowIcon />
      <span className="tree-name">{report.title}</span>
      <div className="tree-actions">
        <button
          type="button"
          aria-label="Delete report"
          title="Delete"
          className="danger"
          onClick={(e) => {
            e.stopPropagation();
            ctx.deleteReport(report);
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
