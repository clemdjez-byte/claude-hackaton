"use client";

// Node Tiptap « étape de protocole » : une section du document qui ressemble à
// du texte mais porte des attributs machine (timer/température/critique) que le
// sérialiseur T0 (docToSteps) lit pour faire tourner le run. Le contenu du node
// est l'instruction, éditable en rich-text (NodeViewContent).
import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from "@tiptap/react";
import { PROTOCOL_STEP_NODE } from "@/lib/bench/protocol-studio/node-contract";

/** Un node « étape » vierge (pour l'insertion via le bouton « + étape »). */
export function makeEmptyStep() {
  return {
    type: PROTOCOL_STEP_NODE,
    attrs: { index: 0, title: "", durationSec: null, temperature: null, critical: false },
    content: [{ type: "paragraph" }],
  };
}

export const ProtocolStepNode = Node.create({
  name: PROTOCOL_STEP_NODE,
  group: "block",
  content: "block+", // l'instruction : paragraphes, listes, etc.
  defining: true,

  addAttributes() {
    return {
      index: { default: 0 },
      title: { default: "" },
      durationSec: { default: null },
      // Sérialisation explicite : l'objet { value, unit } deviendrait
      // "[object Object]" dans le HTML par défaut (perdu au copier-coller).
      temperature: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-temperature");
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) =>
          attributes.temperature
            ? { "data-temperature": JSON.stringify(attributes.temperature) }
            : {},
      },
      critical: { default: false },
    };
  },

  // Le stockage réel est le JSON (draft_doc) → les attrs voyagent dans le JSON.
  // renderHTML/parseHTML ne servent qu'au copier-coller / rendu HTML de secours.
  parseHTML() {
    return [{ tag: `div[data-type="${PROTOCOL_STEP_NODE}"]` }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": PROTOCOL_STEP_NODE }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ProtocolStepView);
  },

  // Renumérote les étapes de premier niveau à chaque changement du document
  // (insertion, suppression, déplacement) : attrs.index suit l'ordre réel.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, oldState, newState) => {
          if (oldState.doc.eq(newState.doc)) return null;
          let tr = newState.tr;
          let changed = false;
          let ordinal = 0;
          newState.doc.forEach((node, pos) => {
            if (node.type.name === PROTOCOL_STEP_NODE) {
              if (node.attrs.index !== ordinal) {
                tr = tr.setNodeAttribute(pos, "index", ordinal);
                changed = true;
              }
              ordinal += 1;
            }
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});

function ProtocolStepView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const index = Number(node.attrs.index ?? 0);
  const title = String(node.attrs.title ?? "");
  const durationSec = node.attrs.durationSec as number | null;
  const temperature = node.attrs.temperature as { value: number; unit: string } | null;
  const critical = Boolean(node.attrs.critical);

  const minutes = durationSec != null ? String(Math.round(durationSec / 60)) : "";

  return (
    <NodeViewWrapper
      className={`my-2 rounded-xl border bg-surface ${
        critical ? "border-danger/40" : "border-border"
      }`}
    >
      {/* En-tête (non éditable en tant que contenu) */}
      <div contentEditable={false} className="flex items-start gap-3 px-4 pt-3">
        <span className="mono-display mt-1 text-[12px] text-muted">
          {String(index + 1).padStart(2, "0")}
        </span>
        <input
          value={title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder="Titre de l'étape"
          className="flex-1 bg-transparent text-[15px] font-semibold tracking-tight focus:outline-none placeholder:text-muted-soft"
        />
        <button
          type="button"
          onClick={() => deleteNode()}
          aria-label="Supprimer l'étape"
          title="Supprimer l'étape"
          className="text-muted-soft hover:text-danger"
        >
          ✕
        </button>
      </div>

      {/* Instruction : contenu éditable du node */}
      <NodeViewContent className="prose-instruction px-4 py-2 text-[14px] leading-relaxed" />

      {/* Métadonnées structurées (non éditables en tant que contenu) */}
      <div
        contentEditable={false}
        className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2 text-[12px]"
      >
        <button
          type="button"
          onClick={() => updateAttributes({ critical: !critical })}
          className={`rounded-full px-2.5 py-1 ${
            critical ? "bg-danger/10 text-danger" : "bg-surface-2 text-muted"
          }`}
        >
          ⚠ critique
        </button>

        <label className="inline-flex items-center gap-1 text-muted">
          ⏱
          <input
            type="number"
            min={0}
            value={minutes}
            onChange={(e) => {
              const m = Number(e.target.value);
              updateAttributes({ durationSec: e.target.value === "" || Number.isNaN(m) || m <= 0 ? null : Math.round(m * 60) });
            }}
            placeholder="min"
            className="w-14 rounded-md border border-border bg-background px-1.5 py-0.5 focus:outline-none"
          />
          min
        </label>

        <label className="inline-flex items-center gap-1 text-muted">
          🌡
          <input
            type="number"
            value={temperature?.value ?? ""}
            onChange={(e) => {
              const v = Number(e.target.value);
              updateAttributes({
                temperature:
                  e.target.value === "" || Number.isNaN(v)
                    ? null
                    : { value: v, unit: temperature?.unit || "°C" },
              });
            }}
            placeholder="temp."
            className="w-16 rounded-md border border-border bg-background px-1.5 py-0.5 focus:outline-none"
          />
          <input
            value={temperature?.unit ?? ""}
            onChange={(e) =>
              updateAttributes({
                temperature: temperature ? { ...temperature, unit: e.target.value } : null,
              })
            }
            placeholder="°C"
            className="w-10 rounded-md border border-border bg-background px-1.5 py-0.5 focus:outline-none"
          />
        </label>
      </div>
    </NodeViewWrapper>
  );
}
