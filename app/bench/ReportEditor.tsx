"use client";

// Éditeur de rapport — Brique Auto Report, Task 3. Le rapport est un document
// HTML éditable (NoteEditor) avec autosave (patron ProtocolDocEditor) et une
// signature ELN qui fige une version immuable. Une fois signé, l'éditeur
// repasse en lecture seule ; « New revision » rouvre une version éditable.
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { NoteEditor } from "@/app/components/NoteEditor";
import { useWindowsContext } from "@/app/shell/WindowsContext";
import type { StoredReport } from "@/lib/bench/auto-report";

type SaveState = "idle" | "saving" | "saved" | "error";

// Auteur affiché sur les brouillons (mono-utilisateur). Les rapports signés
// portent leur propre report.signedBy.
const AUTHOR = "Clément Djezvedjian";

// JJ/MM/AAAA depuis un ISO stocké (pas de dépendance au fuseau).
function dateFR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function UserIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  );
}

export default function ReportEditor({ runId }: { runId: string }) {
  const { open } = useWindowsContext();
  const [report, setReport] = useState<StoredReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // hasHtml duplique htmlRef.current.trim() en state : le bouton Sign lit ça
  // au rendu (lire un ref pendant le rendu est interdit par le compilateur).
  const [hasHtml, setHasHtml] = useState(false);
  const htmlRef = useRef<string>("");
  // Promesse du PATCH en vol : si le debounce a déjà tiré, save.flush()
  // renvoie undefined → on doit aussi attendre cette promesse dans flushSave.
  const inflightRef = useRef<Promise<unknown> | null>(null);
  // Miroir de saveState lisible en dehors du rendu : handleSign lit ça juste
  // après avoir attendu flushSave() pour voir un échec survenu PENDANT cet
  // await (un `saveState` lu par closure resterait figé sur sa valeur au
  // moment où handleSign a démarré).
  const saveStateRef = useRef<SaveState>("idle");

  function applySaveState(s: SaveState) {
    saveStateRef.current = s;
    setSaveState(s);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bench/report/${runId}`)
      .then(async (res) => {
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `Error ${res.status}`);
        }
        return res.json() as Promise<{ report: StoredReport }>;
      })
      .then(({ report: r }) => {
        if (cancelled) return;
        htmlRef.current = r.html;
        setHasHtml(Boolean(r.html.trim()));
        setReport(r);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load report.");
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const save = useDebouncedCallback(async () => {
    applySaveState("saving");
    const p = (async () => {
      const res = await fetch(`/api/bench/report/${runId}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: htmlRef.current }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
    })();
    inflightRef.current = p;
    try {
      await p;
      applySaveState("saved");
    } catch {
      applySaveState("error");
    } finally {
      if (inflightRef.current === p) inflightRef.current = null;
    }
  }, 1200);

  async function flushSave() {
    const result = save.flush();
    if (result && typeof (result as Promise<void>).then === "function") {
      await result;
    }
    if (inflightRef.current) {
      await inflightRef.current;
    }
  }

  useEffect(() => () => {
    save.flush();
  }, [save]);

  async function handleSign() {
    if (!report || report.signedAt || !htmlRef.current.trim()) return;
    if (saveState === "error") {
      setActionError("Last autosave failed — fix your connection and wait for a successful save before signing.");
      return;
    }
    setActionError(null);
    await flushSave();
    // Re-check après le flush : un échec réseau survenu PENDANT cet await
    // met saveState à "error" via applySaveState, mais la variable locale
    // `saveState` de ce rendu resterait figée sur sa valeur d'avant l'appel.
    // saveStateRef.current, lui, est à jour.
    if (saveStateRef.current === "error") {
      setActionError("Last autosave failed — fix your connection and wait for a successful save before signing.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/bench/report/${runId}/sign`, { method: "POST" });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `Error ${res.status}`);
      }
      const { report: signed } = (await res.json()) as { report: StoredReport };
      htmlRef.current = signed.html;
      setHasHtml(Boolean(signed.html.trim()));
      setReport(signed);
      applySaveState("idle");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not sign the report.");
    } finally {
      setBusy(false);
    }
  }

  async function handleNewRevision() {
    if (!report || !report.signedAt) return;
    setActionError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/bench/report/${runId}/revision`, { method: "POST" });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `Error ${res.status}`);
      }
      const { report: draft } = (await res.json()) as { report: StoredReport };
      htmlRef.current = draft.html;
      setHasHtml(Boolean(draft.html.trim()));
      setReport(draft);
      applySaveState("idle");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not open a new revision.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <div className="p-6 text-sm text-danger">{loadError}</div>;
  if (!report) return <div className="p-6 text-sm text-muted">Loading…</div>;

  const signed = Boolean(report.signedAt);

  return (
    <div className="report-page">
      <header className="fade-in flex items-start justify-between gap-4">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight min-w-0">{report.protocolTitle}</h1>
        <button type="button" onClick={() => open("run", { runId })} className="chip shrink-0 mt-1">
          ← Back to run
        </button>
      </header>

      {/* barre méta mono façon ELN (auteur · date · version · statut) */}
      <div className="report-meta">
        <div className="report-meta-facts">
          <span className="report-meta-item">
            <UserIcon />
            {signed ? report.signedBy : AUTHOR}
          </span>
          <span className="report-meta-sep">·</span>
          <span className="report-meta-item">
            <CalendarIcon />
            {dateFR(report.generatedAt)}
          </span>
          <span className="report-meta-sep">·</span>
          <span className="report-meta-item">V{report.version}</span>
          <span className="report-meta-sep">·</span>
          <span className={`report-meta-item ${signed ? "signed" : ""}`}>
            {signed ? "Signed" : "Unsigned"}
          </span>
        </div>
        <div className="report-meta-actions">
          {actionError && <span className="text-[12px] text-danger">{actionError}</span>}
          {!signed && (
            <span className="mono-display text-[12px] text-muted">
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Saved"}
              {saveState === "error" && <span className="text-danger">Save failed</span>}
            </span>
          )}
          {signed ? (
            <button
              type="button"
              onClick={handleNewRevision}
              disabled={busy}
              className="report-meta-btn disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "…" : "New revision"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSign}
              disabled={busy || !hasHtml}
              className="report-meta-btn disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "…" : `Sign V${report.version}`}
            </button>
          )}
        </div>
      </div>

      {/* éditeur document, pleine largeur (pas de carte) — remonté à chaque
          nouvelle version de page (sign / new revision changent report.version)
          pour repartir d'un contenu et d'un editable propres ; l'autosave ne
          touche pas la version donc ne remonte jamais l'éditeur pendant la frappe. */}
      <div className="doc-editor fade-up">
        <NoteEditor
          key={`${report.id}:${report.version}`}
          initialContent={report.html}
          editable={!signed}
          onChange={(html) => {
            htmlRef.current = html;
            setHasHtml(Boolean(html.trim()));
            void save();
          }}
        />
      </div>
    </div>
  );
}
