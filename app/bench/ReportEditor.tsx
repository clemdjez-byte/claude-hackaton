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

function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
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
    setSaveState("saving");
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
      setSaveState("saved");
    } catch {
      setSaveState("error");
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
    setActionError(null);
    await flushSave();
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
      setSaveState("idle");
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
      setSaveState("idle");
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
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full space-y-6">
      <header className="fade-in">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-3">Report</p>
            <h1 className="text-3xl font-semibold tracking-tight">{report.protocolTitle}</h1>
          </div>
          <button type="button" onClick={() => open("run", { runId })} className="chip shrink-0 mt-1">
            ← Back to run
          </button>
        </div>
      </header>

      {/* barre méta façon ELN */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/40 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`pill ${signed ? "accent" : ""}`}>{signed ? "Signed" : "Draft"}</span>
          <span className="receipt">v{report.version}</span>
          <span className="receipt">· generated {when(report.generatedAt)}</span>
          {signed && (
            <span className="receipt">
              · Signed by {report.signedBy} · {when(report.signedAt!)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
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
              className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "…" : "New revision"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSign}
              disabled={busy || !hasHtml}
              className="btn-accent px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "…" : "Sign"}
            </button>
          )}
        </div>
      </div>

      {/* éditeur document — remonté à chaque nouvelle version de page (sign /
          new revision changent report.version) pour repartir d'un contenu et
          d'un editable propres ; l'autosave (updateDraft) ne touche pas la
          version donc ne remonte jamais l'éditeur pendant la frappe. */}
      <div className="card p-6 doc-editor fade-up">
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
