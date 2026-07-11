"use client";

import { useRef, useState, useTransition } from "react";
import { useWindowsContext } from "@/app/shell/WindowsContext";
import type { Protocol } from "@/lib/core/types";
import { generateProtocolAction } from "./actions";

// Types acceptés = ceux que le pipeline d'extraction sait lire (OCR / docx /
// texte). On liste extensions ET wildcards pour éviter que macOS grise les .md.
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.md,.markdown,.txt,application/pdf,image/*";

export default function ProtocolsClient({ protocols }: { protocols: Protocol[] }) {
  const { open } = useWindowsContext();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [brief, setBrief] = useState("");
  const [pending, start] = useTransition();

  const MAX_BYTES = 20 * 1024 * 1024;

  function addFiles(incoming: FileList | null) {
    const all = Array.from(incoming ?? []);
    const ok = all.filter((f) => f.size <= MAX_BYTES);
    if (ok.length < all.length) setError("Some files were skipped (max 20 MB each).");
    if (ok.length > 0) setFiles((prev) => [...prev, ...ok]);
  }
  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, j) => j !== i));
  }

  async function generateFromFiles() {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      if (brief.trim()) fd.append("context", brief.trim());
      const res = await fetch("/api/bench/protocol-from-document", {
        method: "POST",
        body: fd,
      });
      const body = (await res.json().catch(() => ({}))) as {
        protocolId?: string;
        error?: string;
      };
      if (!res.ok || !body.protocolId) throw new Error(body.error ?? `Error ${res.status}`);
      open("protocol", { protocolId: body.protocolId });
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read those documents.");
    } finally {
      setUploading(false);
    }
  }

  // Un seul bouton, comme la génération de rapport : des fichiers (avec ou sans
  // contexte) → extraction+normalisation ; sinon une simple description → brief.
  function submit() {
    if (files.length > 0) {
      void generateFromFiles();
      return;
    }
    const text = brief.trim();
    if (!text) return;
    setError(null);
    start(async () => {
      try {
        const { protocolId } = await generateProtocolAction(text);
        open("protocol", { protocolId });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not draft that protocol.");
      }
    });
  }

  const busy = uploading || pending;
  const canSubmit = !busy && (files.length > 0 || brief.trim().length > 0);

  return (
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full space-y-8">
      <header className="fade-in">
        <p className="eyebrow mb-3">Protocols</p>
        <h1 className="text-3xl font-semibold tracking-tight">Your protocol library</h1>
        <p className="text-base text-muted mt-3 max-w-xl" style={{ lineHeight: 1.6 }}>
          Every protocol here is a workflow you can activate. Keep the ones you trust, build
          new ones from a document or a short description, then run one at the bench.
        </p>
      </header>

      {/* Créer un protocole */}
      <section className="card p-6 fade-up space-y-5">
        <h2 className="text-lg font-semibold tracking-tight">New protocol</h2>

        {/* Depuis des documents (multi) */}
        <div
          role="button"
          tabIndex={0}
          aria-disabled={busy}
          onClick={() => {
            if (!busy) inputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !busy) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) addFiles(e.dataTransfer.files);
          }}
          className={`border-2 border-dashed rounded-xl px-6 py-8 text-center transition-colors ${
            busy
              ? "opacity-60 cursor-default border-border"
              : dragging
                ? "border-accent bg-accent-soft/50 cursor-pointer"
                : "border-border hover:border-border-strong bg-surface-2/30 cursor-pointer"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="text-base font-medium">
            {uploading ? "Reading your documents…" : "Drop documents, or click to browse"}
          </p>
          <p className="receipt mt-1">
            PDF · JPG · PNG · WebP · DOCX · MD · TXT. Claude extracts a structured draft
          </p>
        </div>

        {files.length > 0 && (
          <ul className="flex flex-col gap-1">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md bg-surface-2/40"
              >
                <span className="truncate flex-1">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={busy}
                  className="text-muted hover:text-danger disabled:opacity-50"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Contexte (avec fichiers) OU description simple (sans fichier) */}
        <div className="space-y-2">
          <label className="eyebrow" htmlFor="brief">
            {files.length > 0 ? "Add context (optional)" : "Or describe it"}
          </label>
          <textarea
            id="brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            disabled={busy}
            rows={2}
            placeholder={
              files.length > 0
                ? "e.g. scale to 24 samples, keep only the RT-qPCR part…"
                : "e.g. RT-qPCR SYBR Green two-step for 24 samples, 20 µL reactions"
            }
            className="w-full border border-[var(--oct-border,#E5E2D8)] rounded-[10px] px-3 py-2 text-sm bg-[var(--oct-paper,#fff)] focus:border-accent focus:outline-none disabled:opacity-60"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy
                ? files.length > 0
                  ? "Reading…"
                  : "Drafting…"
                : "Draft protocol →"}
            </button>
          </div>
        </div>

        {error && <p className="text-[13px] text-danger">{error}</p>}
      </section>

      {/* Liste des protocoles */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Saved protocols</h2>
        {protocols.length === 0 ? (
          <p className="text-muted text-sm">No protocol yet. Create one above.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {protocols.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => open("protocol", { protocolId: p.id })}
                className="card card-hover block p-5 fade-up text-left w-full"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium leading-snug">{p.title}</h3>
                  <span className={`pill shrink-0 ${p.status === "published" ? "accent" : ""}`}>
                    {p.status}
                  </span>
                </div>
                <p className="receipt mt-2">
                  {p.steps.length} steps · {p.sources.length} sources · v{p.version}
                </p>
                {p.summary && (
                  <p className="text-[13px] text-muted mt-2 leading-snug">{p.summary}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => open("bench-hub")}
        className="inline-block text-[14px] text-muted hover:text-foreground transition-colors"
      >
        ← Back to bench
      </button>
    </div>
  );
}
