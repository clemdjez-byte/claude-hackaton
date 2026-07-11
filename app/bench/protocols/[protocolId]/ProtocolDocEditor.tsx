"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { useDebouncedCallback } from "use-debounce";
import { NoteEditor } from "@/app/components/NoteEditor";
import { ProtocolStepNode, makeEmptyStep } from "@/app/components/protocol-step-node";
import ScaleActivatePanel from "./ScaleActivatePanel";
import type { Protocol, Recipe } from "@/lib/live-experiment/core/types";
import { startRunAction, publishProtocolAction } from "../../actions";

type SaveState = "idle" | "saving" | "saved" | "error";

function paramDefault(protocol: Protocol, key: string, fb: number): number {
  return protocol.parameters.find((p) => p.key === key)?.default ?? fb;
}

export default function ProtocolDocEditor({
  protocol,
  initialDoc,
}: {
  protocol: Protocol;
  initialDoc: JSONContent;
}) {
  const [title, setTitle] = useState(protocol.title || "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [recipe, setRecipe] = useState<Recipe | null>(protocol.recipe ?? null);
  const [nReactions, setNReactions] = useState(() => paramDefault(protocol, "n_reactions", 6));
  const [overagePct, setOveragePct] = useState(() => paramDefault(protocol, "overage_pct", 10));
  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef(title);
  const docRef = useRef<JSONContent>(initialDoc);
  const recipeRef = useRef<Recipe | null>(protocol.recipe ?? null);
  // Promesse du PATCH en vol : si le debounce a déjà tiré, save.flush()
  // renvoie undefined → on doit aussi attendre cette promesse dans flushSave.
  const inflightRef = useRef<Promise<unknown> | null>(null);

  const save = useDebouncedCallback(async () => {
    setSaveState("saving");
    const p = (async () => {
      const res = await fetch(`/api/bench/protocols/${protocol.id}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleRef.current.trim() || "Untitled",
          draftDoc: docRef.current,
          recipe: recipeRef.current,
        }),
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

  // La recette voyage dans l'autosave unique : flushSave (avant Publish/Activate)
  // et le flush à l'unmount couvrent donc aussi les modifications du master mix.
  function onRecipeChange(r: Recipe) {
    setRecipe(r);
    recipeRef.current = r;
    void save();
  }
  function onRemoveRecipe() {
    setRecipe(null);
    recipeRef.current = null;
    void save();
  }
  function onAddRecipe() {
    const r: Recipe = { name: "Master mix", components: [] };
    setRecipe(r);
    recipeRef.current = r;
    void save();
  }

  async function flushSave() {
    const result = save.flush();
    if (result && typeof (result as Promise<void>).then === "function") {
      await result;
    }
    if (inflightRef.current) {
      await inflightRef.current;
    }
  }

  // Garde-fou avant figeage (publish / run) : sealDraft lèverait côté serveur
  // sur une étape sans titre ou un doc sans étape → on bloque avec un message.
  function validateStepsForFreeze(): string | null {
    const nodes = (docRef.current.content ?? []).filter((n) => n.type === "protocolStep");
    if (nodes.length === 0) return "Ajoute au moins une étape avant de publier ou lancer un run.";
    const untitled = nodes.findIndex((n) => !String(n.attrs?.title ?? "").trim());
    if (untitled !== -1) return `L'étape ${untitled + 1} n'a pas de titre.`;
    return null;
  }

  useEffect(() => () => {
    save.flush();
  }, [save]);

  function onTitleChange(v: string) {
    setTitle(v);
    titleRef.current = v;
    setError(null);
    void save();
  }

  // Insère toujours en FIN de document : insérer au curseur pourrait imbriquer
  // une étape dans une étape (contenu perdu au figeage, qui ne lit que le 1er niveau).
  function addStep() {
    const ed = editorRef.current;
    if (!ed) return;
    ed.chain().insertContentAt(ed.state.doc.content.size, makeEmptyStep()).focus("end").run();
  }

  const canPublish = protocol.status === "draft" && protocol.sources.length > 0;

  async function publish() {
    await flushSave();
    const err = validateStepsForFreeze();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    start(() => publishProtocolAction(protocol.id));
  }
  async function startRun() {
    await flushSave();
    const err = validateStepsForFreeze();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    start(() => startRunAction(protocol.id, nReactions, overagePct));
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      {/* barre d'état */}
      <div className="mb-2 flex h-5 items-center justify-end gap-3">
        {error && <span className="text-[12px] text-danger">{error}</span>}
        <span className="mono-display text-[12px] text-muted">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "Saved"}
          {saveState === "error" && <span className="text-danger">Save failed</span>}
        </span>
      </div>

      {/* titre */}
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Titre du protocole"
        className="mb-3 w-full bg-transparent text-3xl font-semibold tracking-tight focus:outline-none placeholder:text-muted-soft"
      />

      {/* barre méta façon ELN */}
      <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className={`pill ${protocol.status === "published" ? "accent" : ""}`}>
            {protocol.status}
          </span>
          <span className="receipt">v{protocol.version}</span>
          {protocol.sources.length > 0 && (
            <span className="receipt">· {protocol.sources.length} sources</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={publish}
            disabled={pending || !canPublish}
            className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Publish
          </button>
          <button
            type="button"
            onClick={startRun}
            disabled={pending}
            className="btn-accent px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {pending ? "…" : "Activate at the bench →"}
          </button>
        </div>
      </div>

      {recipe ? (
        <ScaleActivatePanel
          recipe={recipe}
          nReactions={nReactions}
          overagePct={overagePct}
          onRecipeChange={onRecipeChange}
          onScalingChange={(n, o) => {
            setNReactions(n);
            setOveragePct(o);
          }}
          onRemove={onRemoveRecipe}
        />
      ) : (
        <button
          type="button"
          onClick={onAddRecipe}
          className="mb-5 inline-flex items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-accent"
        >
          ＋ Ajouter un master mix (Scale &amp; activate)
        </button>
      )}

      {/* éditeur document */}
      <div className="sophie-editor">
        <NoteEditor
          initialContent={initialDoc}
          extraExtensions={[ProtocolStepNode]}
          editorClassName="focus:outline-none min-h-[320px]"
          onChange={(_html, json) => {
            docRef.current = json;
            setError(null);
            void save();
          }}
          onReady={(editor) => {
            editorRef.current = editor;
          }}
        />
      </div>

      <button
        type="button"
        onClick={addStep}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-accent"
      >
        ＋ Ajouter une étape
      </button>
    </div>
  );
}
