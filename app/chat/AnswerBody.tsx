"use client";
// app/chat/AnswerBody.tsx
// Rend une réponse de l'assistant : markdown (via parseMarkdown) avec les tags
// [type:id] transformés en petits chiffres cliquables, et une liste « Sources »
// numérotée en bas. Survoler un chiffre surligne sa source (et inversement) via
// l'état local `active`. Cliquer ouvre la fenêtre correspondante.
import { useState } from "react";
import { useWindowsContext } from "@/app/shell/WindowsContext";
import type { WindowKind } from "@/app/shell/useWindows";
import { numberCitations, type CitationRef } from "./citations";
import { parseMarkdown, type Block, type InlineSpan } from "./markdown";
import { fallbackLabel } from "./sourceLabel";
import type { SourceHit } from "./types";

/** Fenêtre à ouvrir pour une source (identique à l'ancien SourceChip). */
function windowFor(
  sourceType: string,
  sourceId: string,
  hit?: SourceHit
): { kind: WindowKind; params: Record<string, string> } | null {
  const runId = typeof hit?.meta?.runId === "string" ? (hit.meta.runId as string) : null;
  switch (sourceType) {
    case "protocol": return { kind: "protocol", params: { protocolId: sourceId } };
    case "run": return { kind: "run", params: { runId: sourceId } };
    case "report": return runId ? { kind: "report", params: { runId } } : null;
    case "evidence": return runId ? { kind: "run", params: { runId } } : null;
    default: return null;
  }
}

export default function AnswerBody({ content, sources }: { content: string; sources?: SourceHit[] }) {
  const { open } = useWindowsContext();
  const [active, setActive] = useState<number | null>(null);

  const { refs, keyToN } = numberCitations(content);
  const blocks = parseMarkdown(content, keyToN);

  const hitByKey = new Map<string, SourceHit>();
  for (const h of sources ?? []) hitByKey.set(`${h.sourceType}:${h.sourceId}`, h);

  const labelFor = (r: CitationRef): string =>
    hitByKey.get(`${r.sourceType}:${r.sourceId}`)?.label || fallbackLabel(r.sourceType, r.sourceId);

  const openRef = (sourceType: string, sourceId: string) => {
    const target = windowFor(sourceType, sourceId, hitByKey.get(`${sourceType}:${sourceId}`));
    if (target) open(target.kind, target.params);
  };

  const renderSpans = (spans: InlineSpan[], prefix: string) =>
    spans.map((s, i) => {
      const key = `${prefix}-${i}`;
      if (s.t === "bold") return <strong key={key}>{s.text}</strong>;
      if (s.t === "italic") return <em key={key}>{s.text}</em>;
      if (s.t === "cite")
        return (
          <button
            key={key}
            type="button"
            className={`cite-marker${active === s.n ? " is-active" : ""}`}
            onMouseEnter={() => setActive(s.n)}
            onMouseLeave={() => setActive(null)}
            onClick={() => openRef(s.sourceType, s.sourceId)}
            title="View source"
          >
            {s.n}
          </button>
        );
      return <span key={key}>{s.text}</span>;
    });

  const renderBlock = (b: Block, i: number) => {
    if (b.type === "heading") {
      const Tag = b.level === 3 ? "h3" : "h4";
      return <Tag key={i} className="answer-h">{renderSpans(b.spans, `h${i}`)}</Tag>;
    }
    if (b.type === "list") {
      return (
        <ul key={i} className="answer-ul">
          {b.items.map((it, j) => <li key={j}>{renderSpans(it, `l${i}-${j}`)}</li>)}
        </ul>
      );
    }
    return (
      <p key={i} className="answer-p">
        {b.lines.map((ln, j) => (
          <span key={j}>
            {renderSpans(ln, `p${i}-${j}`)}
            {j < b.lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    );
  };

  return (
    <div>
      <div className="answer-prose">{blocks.map(renderBlock)}</div>
      {refs.length > 0 && (
        <ol className="source-list">
          {refs.map((r) => (
            <li
              key={r.n}
              className={`source-item${active === r.n ? " is-active" : ""}`}
              onMouseEnter={() => setActive(r.n)}
              onMouseLeave={() => setActive(null)}
            >
              <button type="button" className="source-btn" onClick={() => openRef(r.sourceType, r.sourceId)}>
                <span className="source-n">{r.n}</span>
                <span className="source-label">{labelFor(r)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
