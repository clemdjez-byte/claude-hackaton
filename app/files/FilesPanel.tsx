"use client";

// Panneau explorateur de fichiers — vue Finder mono-panneau : navigation par
// dossiers (Précédent/Suivant/Remonter + fil d'Ariane cliquable), liste du
// dossier courant (sous-dossiers puis rapports), créer/renommer/supprimer les
// dossiers, déplacer par glisser-déposer natif (HTML5) sur une ligne-dossier
// ou une miette du fil d'Ariane. Les rapports n'ont pas de nom éditable ici —
// l'API des rapports (PATCH /api/files/reports/[id]) ne porte que `folderId`,
// pas de titre : seuls leur emplacement et leur suppression sont pilotés
// d'ici (cf. app/api/files/reports/[id]/route.ts).
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useWindowsContext } from "@/app/shell/WindowsContext";
import { childFolders, breadcrumb, canMoveFolder } from "@/app/files/tree";
import type { FolderMeta, PageMeta } from "./types";
import { FolderRowIcon, ReportRowIcon, NavArrowIcon, PencilIcon } from "./icons";

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

// Date ISO figée (stockée) → affichage compact et déterministe (pas de tz).
function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export default function FilesPanel() {
  const { open } = useWindowsContext();
  const [data, setData] = useState<FilesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Historique de navigation : pile de folderId (null = racine) + index courant.
  const [history, setHistory] = useState<(string | null)[]>([null]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState<RenameTarget>(null);

  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);

  // Un blur natif peut se déclencher APRÈS un Échap (le champ démonté perd le
  // focus) : ce garde évite que la commande d'annulation soit suivie d'une
  // validation fantôme. Un seul champ inline actif à la fois (create XOR
  // rename), donc un seul garde suffit.
  const editGuardRef = useRef(false);

  // Fetch pur (pas de setState dedans) : réutilisable au montage et après
  // chaque mutation, sans déclencher la règle set-state-in-effect.
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
  const currentFolderId = history[historyIndex] ?? null;
  const currentFolder = folders.find((f) => f.id === currentFolderId) ?? null;
  const ancestors = breadcrumb(folders, currentFolderId);
  const crumbs: { id: string | null; name: string }[] = [
    { id: null, name: "Home" },
    ...ancestors.map((f) => ({ id: f.id, name: f.name })),
    ...(currentFolder ? [{ id: currentFolder.id, name: currentFolder.name }] : []),
  ];
  const visibleFolders = childFolders(folders, currentFolderId);
  const visibleReports = reports
    .filter((r) => (r.folderId ?? null) === currentFolderId)
    .sort((a, b) => a.title.localeCompare(b.title));

  const canBack = historyIndex > 0;
  const canForward = historyIndex < history.length - 1;
  const canUp = currentFolderId !== null;

  function navigateTo(folderId: string | null) {
    if (folderId === currentFolderId) return;
    const next = [...history.slice(0, historyIndex + 1), folderId];
    setHistory(next);
    setHistoryIndex(next.length - 1);
  }
  function goBack() {
    if (canBack) setHistoryIndex((i) => i - 1);
  }
  function goForward() {
    if (canForward) setHistoryIndex((i) => i + 1);
  }
  function goUp() {
    if (currentFolder) navigateTo(currentFolder.parentId);
  }

  // --- Créer / renommer / supprimer ---

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
        body: JSON.stringify({ name, parentId: currentFolderId }),
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

  function canAcceptDrop(item: DragItem, targetFolderId: string | null): boolean {
    if (item.kind === "folder") return canMoveFolder(folders, item.id, targetFolderId);
    return true;
  }

  async function moveItem(item: DragItem, targetFolderId: string | null) {
    try {
      if (item.kind === "folder") {
        const folder = folders.find((f) => f.id === item.id);
        if (!folder || folder.parentId === targetFolderId) return;
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

  function dragSourceProps(item: DragItem, enabled: boolean): DragProps {
    if (!enabled) return { draggable: false };
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
        if (!dragItem || !canAcceptDrop(dragItem, targetFolderId)) return;
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
        if (item && canAcceptDrop(item, targetFolderId)) void moveItem(item, targetFolderId);
      },
    };
  }

  if (!data && !error) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (!data && error) return <div className="p-6 text-sm text-danger">{error}</div>;

  return (
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full space-y-4">
      <header className="fade-in">
        <p className="eyebrow mb-3">Files</p>
        <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
        <p className="text-base text-muted mt-3 max-w-xl" style={{ lineHeight: 1.6 }}>
          Every report written to this lab, organized into folders. Open one to view it in a window.
        </p>
      </header>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="card overflow-hidden fade-up">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-1 shrink-0">
            <NavButton label="Back" disabled={!canBack} onClick={goBack}>
              <NavArrowIcon dir="left" />
            </NavButton>
            <NavButton label="Forward" disabled={!canForward} onClick={goForward}>
              <NavArrowIcon dir="right" />
            </NavButton>
            <NavButton label="Up one level" disabled={!canUp} onClick={goUp}>
              <NavArrowIcon dir="up" />
            </NavButton>
          </div>

          <nav className="flex items-center gap-1 min-w-0 flex-1 text-sm overflow-hidden" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.id ?? "__root__"} className="flex items-center gap-1 min-w-0">
                {i > 0 && <span className="text-muted-soft shrink-0">›</span>}
                <Crumb
                  label={c.name}
                  active={i === crumbs.length - 1}
                  isOver={dropTarget !== null && dropTarget.folderId === c.id}
                  onClick={() => navigateTo(c.id)}
                  dropProps={dropTargetProps(c.id)}
                />
              </span>
            ))}
          </nav>

          <button type="button" className="chip shrink-0" onClick={startCreateFolder}>
            New folder
          </button>
        </div>

        <div>
          {creatingFolder && (
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
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
                className="input-field flex-1 min-w-0 px-2 py-1 text-sm"
              />
            </div>
          )}

          {visibleFolders.length === 0 && visibleReports.length === 0 && !creatingFolder ? (
            <p className="px-4 py-10 text-sm text-muted text-center">This folder is empty.</p>
          ) : (
            <>
              {visibleFolders.map((folder) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  isRenaming={renaming?.id === folder.id}
                  renameValue={renaming?.id === folder.id ? renaming.value : folder.name}
                  onRenameChange={(v) => setRenaming((r) => (r ? { ...r, value: v } : r))}
                  onCommitRename={() => void commitRenameFolder()}
                  onCancelRename={cancelRenameFolder}
                  isOver={dropTarget !== null && dropTarget.folderId === folder.id}
                  dragProps={dragSourceProps({ kind: "folder", id: folder.id }, renaming?.id !== folder.id)}
                  dropProps={dropTargetProps(folder.id)}
                  onOpen={() => navigateTo(folder.id)}
                  onStartRename={() => startRenameFolder(folder)}
                  onDelete={() => void deleteFolder(folder)}
                />
              ))}
              {visibleReports.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  dragProps={dragSourceProps({ kind: "report", id: report.id }, true)}
                  onOpen={report.runId ? () => open("report", { runId: report.runId! }) : undefined}
                  onDelete={() => void deleteReport(report)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="tbtn disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Crumb({
  label,
  active,
  isOver,
  onClick,
  dropProps,
}: {
  label: string;
  active: boolean;
  isOver: boolean;
  onClick: () => void;
  dropProps: DropProps;
}) {
  return (
    <span
      {...dropProps}
      className={`inline-flex rounded px-1 py-0.5 ${isOver ? "bg-accent-soft ring-1 ring-accent" : ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`truncate cursor-pointer ${
          active ? "font-semibold text-foreground" : "text-muted hover:text-foreground"
        }`}
      >
        {label}
      </button>
    </span>
  );
}

function FolderRow({
  folder,
  isRenaming,
  renameValue,
  onRenameChange,
  onCommitRename,
  onCancelRename,
  isOver,
  dragProps,
  dropProps,
  onOpen,
  onStartRename,
  onDelete,
}: {
  folder: FolderMeta;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  isOver: boolean;
  dragProps: DragProps;
  dropProps: DropProps;
  onOpen: () => void;
  onStartRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-3 px-4 py-2.5 border-b border-border cursor-pointer hover:bg-surface-2 ${
        isOver ? "bg-accent-soft ring-1 ring-inset ring-accent" : ""
      }`}
      {...dragProps}
      {...dropProps}
      onClick={() => !isRenaming && onOpen()}
    >
      <FolderRowIcon />
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") onCancelRename();
          }}
          className="input-field flex-1 min-w-0 px-2 py-1 text-sm"
        />
      ) : (
        <span className="flex-1 min-w-0 truncate text-sm">{folder.name}</span>
      )}
      {!isRenaming && (
        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="Rename folder"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
            className="text-muted hover:text-foreground px-1"
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            aria-label="Delete folder"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-muted hover:text-danger text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function ReportRow({
  report,
  dragProps,
  onOpen,
  onDelete,
}: {
  report: PageMeta;
  dragProps: DragProps;
  onOpen?: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-3 px-4 py-2.5 border-b border-border hover:bg-surface-2 ${
        onOpen ? "cursor-pointer" : "cursor-default opacity-70"
      }`}
      {...dragProps}
      onClick={onOpen}
    >
      <ReportRowIcon />
      <span className="flex-1 min-w-0 truncate text-sm">{report.title}</span>
      <span className="receipt shrink-0">{when(report.createdAt)}</span>
      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
        <button
          type="button"
          aria-label="Delete report"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-muted hover:text-danger text-xs px-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
