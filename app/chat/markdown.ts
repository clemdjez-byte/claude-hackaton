// app/chat/markdown.ts
// Parseur markdown minimal → structure de blocs (aucun JSX : testable en pur).
// Périmètre volontairement borné à ce que produit le copilote : titres, listes
// à puces, paragraphes, gras/italique inline, citations. Pas de tables ni de
// blocs de code (YAGNI). Le rendu JSX est fait par AnswerBody.
import { tokenizeCitations, type CitationSourceType } from "./citations";

export type InlineSpan =
  | { t: "text"; text: string }
  | { t: "bold"; text: string }
  | { t: "italic"; text: string }
  | { t: "cite"; n: number; sourceType: CitationSourceType; sourceId: string };

export type Block =
  | { type: "heading"; level: 3 | 4; spans: InlineSpan[] }
  | { type: "list"; items: InlineSpan[][] }
  | { type: "paragraph"; lines: InlineSpan[][] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;

function parseItalic(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const re = /\*([^*]+)\*|_([^_]+)_/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) spans.push({ t: "text", text: text.slice(last, start) });
    spans.push({ t: "italic", text: m[1] ?? m[2] });
    last = start + m[0].length;
  }
  if (last < text.length) spans.push({ t: "text", text: text.slice(last) });
  return spans;
}

/** Gras d'abord, puis italique dans les restes (imbrications rares ici). */
export function parseEmphasis(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const boldRe = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(boldRe)) {
    const start = m.index ?? 0;
    if (start > last) spans.push(...parseItalic(text.slice(last, start)));
    spans.push({ t: "bold", text: m[1] });
    last = start + m[0].length;
  }
  if (last < text.length) spans.push(...parseItalic(text.slice(last)));
  return spans;
}

/** Une ligne → spans : citations d'abord, emphase dans le texte restant. */
export function parseInline(line: string, keyToN: Map<string, number>): InlineSpan[] {
  const spans: InlineSpan[] = [];
  for (const tok of tokenizeCitations(line)) {
    if (tok.kind === "cite") {
      const n = keyToN.get(`${tok.sourceType}:${tok.sourceId}`) ?? 0;
      spans.push({ t: "cite", n, sourceType: tok.sourceType, sourceId: tok.sourceId });
    } else {
      spans.push(...parseEmphasis(tok.text));
    }
  }
  return spans;
}

/** Texte complet → blocs. Regroupe puces et lignes de paragraphe consécutives ;
 *  une ligne vide sépare les paragraphes. */
export function parseMarkdown(text: string, keyToN: Map<string, number>): Block[] {
  const blocks: Block[] = [];
  let para: InlineSpan[][] = [];
  let list: InlineSpan[][] = [];
  const flushPara = () => { if (para.length) { blocks.push({ type: "paragraph", lines: para }); para = []; } };
  const flushList = () => { if (list.length) { blocks.push({ type: "list", items: list }); list = []; } };

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    if (heading) {
      flushPara(); flushList();
      const level: 3 | 4 = heading[1].length <= 2 ? 3 : 4;
      blocks.push({ type: "heading", level, spans: parseInline(heading[2], keyToN) });
    } else if (bullet) {
      flushPara();
      list.push(parseInline(bullet[1], keyToN));
    } else if (line.trim() === "") {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(parseInline(line, keyToN));
    }
  }
  flushPara(); flushList();
  return blocks;
}
