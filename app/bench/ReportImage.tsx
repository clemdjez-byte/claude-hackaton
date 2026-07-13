"use client";

// app/bench/ReportImage.tsx — nœud image du rapport. Étend l'extension Image
// de Tiptap pour que deux attributs survivent à la re-sérialisation getHTML()
// de l'autosave (tout attribut non déclaré serait strippé à la première frappe) :
//   data-description — description vision (IA), modifiable par le chercheur,
//                      lue par les LLM via htmlToText ([Photo: caption — desc]) ;
//   data-hidden      — photo masquée par le chercheur (placeholder compact),
//                      jamais retirée du document : pas de perte silencieuse.
// La NodeView rend les contrôles (Hide/Show, Description, Delete) ; la
// sérialisation passe par renderHTML du nœud, jamais par ce DOM — aucun bouton
// ne fuit dans le HTML stocké.
import { useState } from "react";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

export const ReportImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Clés = noms d'attributs HTML → parseHTML/renderHTML par défaut de
      // Tiptap font le round-trip getAttribute/setAttribute tout seuls.
      // default null ⇒ attribut omis quand absent : les anciens rapports
      // re-sérialisent à l'identique (rétro-compat).
      "data-description": { default: null },
      "data-hidden": { default: null }, // "true" quand masquée
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ReportImageView);
  },
}).configure({ inline: false, allowBase64: false });

const btnClass =
  "shrink-0 rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] text-ink-soft hover:bg-surface-2 hover:text-foreground";

// Composant au niveau module (jamais imbriqué : le remontage au focus des
// fenêtres du shell tuerait les clics, cf. mémoire projet).
function ReportImageView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const editable = editor.isEditable;
  const persistedHidden = node.attrs["data-hidden"] === "true";
  const description = (node.attrs["data-description"] as string | null) ?? "";
  const caption = (node.attrs.alt as string | null) ?? "";
  // Rapport signé (lecture seule) : le masquage devient un état LOCAL — le
  // lecteur peut afficher/re-masquer sans jamais modifier le document figé.
  const [localHidden, setLocalHidden] = useState(persistedHidden);
  const [showDesc, setShowDesc] = useState(false);
  const hidden = editable ? persistedHidden : localHidden;

  function toggleHidden() {
    if (editable) updateAttributes({ "data-hidden": persistedHidden ? null : "true" });
    else setLocalHidden((h) => !h);
  }

  if (hidden) {
    return (
      <NodeViewWrapper className="report-photo">
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface-2 px-3 py-2 text-[13px] text-muted">
          <span className="min-w-0 flex-1">Photo hidden{caption ? ` — ${caption}` : ""}</span>
          <button type="button" className={btnClass} onClick={toggleHidden}>
            Show
          </button>
          {editable && (
            <button type="button" className={`${btnClass} text-danger`} onClick={deleteNode}>
              Delete
            </button>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="report-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={node.attrs.src as string}
        alt={caption}
        title={(node.attrs.title as string | null) ?? undefined}
        className="max-w-full rounded-lg border border-border"
      />
      <div className="mt-1 flex items-center gap-2 text-[12px] text-muted">
        {caption && <span className="min-w-0 italic">{caption}</span>}
        <button type="button" className={btnClass} onClick={toggleHidden}>
          Hide
        </button>
        {(description || editable) && (
          <button type="button" className={btnClass} onClick={() => setShowDesc((s) => !s)}>
            {showDesc ? "Hide description" : description ? "Description" : "Add description"}
          </button>
        )}
        {editable && (
          <button type="button" className={`${btnClass} text-danger`} onClick={deleteNode}>
            Delete
          </button>
        )}
      </div>
      {showDesc &&
        (editable ? (
          <textarea
            className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-[13px] focus:outline-none"
            rows={2}
            value={description}
            placeholder="Short description of what the photo shows (read by the AI)…"
            onChange={(e) => updateAttributes({ "data-description": e.target.value || null })}
          />
        ) : (
          description && <p className="mt-1 text-[13px] text-muted">{description}</p>
        ))}
    </NodeViewWrapper>
  );
}
