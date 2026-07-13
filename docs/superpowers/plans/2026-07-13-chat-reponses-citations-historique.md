# Chat Octopus — mise en page, citations numérotées, historique — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les réponses du chat lisibles (markdown), remplacer les tags de source bruts par des citations numérotées interactives, et ajouter un historique de conversations en sidebar.

**Architecture:** Petits modules purs et testables (extraction/numérotation des citations, parseur markdown → blocs, dérivation de libellé, logique de conversations) surmontés de composants React fins (`AnswerBody`, `ConversationSidebar`) assemblés dans un `ChatClient` réécrit. Le streaming NDJSON existant est conservé ; seule la cible des mises à jour change (la conversation active, persistée en `localStorage`).

**Tech Stack:** Next 16 / React 19, TypeScript, Tailwind v4 (+ classes `@layer components` dans `app/globals.css`), tests **vitest** (fonctions pures uniquement — pas de testing-library dans le projet).

## Global Constraints

- **Aucune nouvelle dépendance** — markdown rendu maison (règle « mode ponytail »).
- **Nom affiché = OCTOPUS**, jamais Sylvy. Copy d'UI en **anglais** (cohérent avec l'existant : « Ask Octopus… », suggestions, « Send »). Commentaires de code en **français** (convention du dépôt).
- **Persistance `localStorage` uniquement** — pas de persistance serveur des conversations.
- **On ne touche pas au system prompt ni au RAG** : le modèle continue d'émettre `[type:id]` ; la transformation en chiffres se fait **à l'affichage**.
- Tests : `import { describe, it, expect } from "vitest"`. Un fichier : `npx vitest run <chemin>`. Toute la suite : `npm test`.
- Typecheck d'un composant : `npx tsc --noEmit`. Lint : `npm run lint`.

---

## File Structure

| Fichier | Création / Modif | Responsabilité |
|---|---|---|
| `app/chat/citations.ts` | Create | **Pur.** Tokenise un texte en segments texte/citation ; numérote les sources (dédup, ordre d'apparition). |
| `app/chat/citations.test.ts` | Create | Tests de tokenisation + numérotation. |
| `app/chat/markdown.ts` | Create | **Pur.** Texte markdown → tableau de blocs (titres, listes, paragraphes) avec spans inline (gras/italique/citation). |
| `app/chat/markdown.test.ts` | Create | Tests emphase + blocs. |
| `app/chat/sourceLabel.ts` | Create | **Pur.** Dérive un libellé lisible depuis le texte d'un hit ; repli `Type · idcourt`. |
| `app/chat/sourceLabel.test.ts` | Create | Tests dérivation + repli. |
| `app/api/chat/route.ts` | Modify | Ajoute `label` (via `deriveSourceLabel`) à chaque source émise. |
| `app/chat/types.ts` | Create | Types partagés `Role`, `SourceHit` (+`label?`), `ChatMessage`, `Conversation`. |
| `app/chat/useConversations.ts` | Create | Hook `localStorage` + fonctions pures `titleFromMessages`, `nextActiveId`. |
| `app/chat/useConversations.test.ts` | Create | Tests des deux fonctions pures. |
| `app/chat/AnswerBody.tsx` | Create | Rend une réponse : markdown + `CitationMarker` inline + `SourceList` ; état `active` (survol) partagé. |
| `app/chat/ConversationSidebar.tsx` | Create | Colonne gauche : « + New discussion », liste, suppression, repli. |
| `app/globals.css` | Modify | Classes `.answer-*`, `.cite-marker`, `.source-*`, `.conv-*` dans `@layer components`. |
| `app/chat/ChatClient.tsx` | Modify (réécriture) | Assemble sidebar + conversation active ; streaming NDJSON inchangé (cible = conversation). |

---

## Task 1: Extraction & numérotation des citations

**Files:**
- Create: `app/chat/citations.ts`
- Test: `app/chat/citations.test.ts`

**Interfaces:**
- Consumes: — (aucune)
- Produces:
  - `type CitationSourceType = "protocol" | "run" | "report" | "evidence"`
  - `type CitationToken = { kind: "text"; text: string } | { kind: "cite"; sourceType: CitationSourceType; sourceId: string }`
  - `type CitationRef = { n: number; sourceType: CitationSourceType; sourceId: string }`
  - `function citeKey(sourceType: string, sourceId: string): string`
  - `function tokenizeCitations(text: string): CitationToken[]`
  - `function numberCitations(text: string): { refs: CitationRef[]; keyToN: Map<string, number> }`

- [ ] **Step 1: Write the failing test**

Create `app/chat/citations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tokenizeCitations, numberCitations, citeKey } from "./citations";

describe("tokenizeCitations", () => {
  it("texte sans citation → un seul token texte", () => {
    expect(tokenizeCitations("hello world")).toEqual([{ kind: "text", text: "hello world" }]);
  });
  it("extrait [type:id]", () => {
    expect(tokenizeCitations("a [run:run_1] b")).toEqual([
      { kind: "text", text: "a " },
      { kind: "cite", sourceType: "run", sourceId: "run_1" },
      { kind: "text", text: " b" },
    ]);
  });
  it("extrait la forme courte (ev_xxx) comme evidence", () => {
    expect(tokenizeCitations("x (ev_abc123) y")).toEqual([
      { kind: "text", text: "x " },
      { kind: "cite", sourceType: "evidence", sourceId: "ev_abc123" },
      { kind: "text", text: " y" },
    ]);
  });
  it("tag incomplet (streaming) reste du texte", () => {
    expect(tokenizeCitations("partial [run:run_")).toEqual([{ kind: "text", text: "partial [run:run_" }]);
  });
});

describe("numberCitations", () => {
  it("numérote par ordre d'apparition, déduplique", () => {
    const { refs, keyToN } = numberCitations("[run:a] then [report:b] then [run:a] again");
    expect(refs).toEqual([
      { n: 1, sourceType: "run", sourceId: "a" },
      { n: 2, sourceType: "report", sourceId: "b" },
    ]);
    expect(keyToN.get(citeKey("run", "a"))).toBe(1);
    expect(keyToN.get(citeKey("report", "b"))).toBe(2);
  });
  it("texte sans citation → aucune ref", () => {
    expect(numberCitations("nothing here").refs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/chat/citations.test.ts`
Expected: FAIL — « Failed to resolve import "./citations" » (le fichier n'existe pas encore).

- [ ] **Step 3: Write minimal implementation**

Create `app/chat/citations.ts`:

```ts
// app/chat/citations.ts
// Extraction et numérotation des citations d'une réponse du copilote. Pur (zéro
// React) : testable directement. Le modèle cite [type:id] ; on gère aussi la
// forme courte (ev_xxx) qu'il produit parfois pour les preuves.

export type CitationSourceType = "protocol" | "run" | "report" | "evidence";

export type CitationToken =
  | { kind: "text"; text: string }
  | { kind: "cite"; sourceType: CitationSourceType; sourceId: string };

export type CitationRef = {
  n: number; // numéro affiché (1-based), ordre d'apparition
  sourceType: CitationSourceType;
  sourceId: string;
};

// [type:id]  OU  (ev_xxx)  — une seule passe. Types connus uniquement, pour ne
// pas confondre un [texte entre crochets] quelconque avec une citation.
const TAG = /\[(protocol|run|report|evidence):([A-Za-z0-9_-]+)\]|\((ev_[A-Za-z0-9]+)\)/g;

export function citeKey(sourceType: string, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

/** Découpe une chaîne en tokens texte / citation, ordre conservé. */
export function tokenizeCitations(text: string): CitationToken[] {
  const tokens: CitationToken[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    const start = m.index ?? 0;
    if (start > last) tokens.push({ kind: "text", text: text.slice(last, start) });
    if (m[1]) tokens.push({ kind: "cite", sourceType: m[1] as CitationSourceType, sourceId: m[2] });
    else tokens.push({ kind: "cite", sourceType: "evidence", sourceId: m[3] });
    last = start + m[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", text: text.slice(last) });
  return tokens;
}

/** Scanne tout le texte, attribue un numéro à chaque source unique. */
export function numberCitations(text: string): { refs: CitationRef[]; keyToN: Map<string, number> } {
  const keyToN = new Map<string, number>();
  const refs: CitationRef[] = [];
  for (const tok of tokenizeCitations(text)) {
    if (tok.kind !== "cite") continue;
    const key = citeKey(tok.sourceType, tok.sourceId);
    if (keyToN.has(key)) continue;
    const n = refs.length + 1;
    keyToN.set(key, n);
    refs.push({ n, sourceType: tok.sourceType, sourceId: tok.sourceId });
  }
  return { refs, keyToN };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/chat/citations.test.ts`
Expected: PASS (6 tests verts).

- [ ] **Step 5: Commit**

```bash
git add app/chat/citations.ts app/chat/citations.test.ts
git commit -m "feat(chat): extraction et numérotation des citations"
```

---

## Task 2: Parseur markdown → blocs

**Files:**
- Create: `app/chat/markdown.ts`
- Test: `app/chat/markdown.test.ts`

**Interfaces:**
- Consumes: `tokenizeCitations`, `CitationSourceType` (Task 1)
- Produces:
  - `type InlineSpan = { t: "text"; text: string } | { t: "bold"; text: string } | { t: "italic"; text: string } | { t: "cite"; n: number; sourceType: CitationSourceType; sourceId: string }`
  - `type Block = { type: "heading"; level: 3 | 4; spans: InlineSpan[] } | { type: "list"; items: InlineSpan[][] } | { type: "paragraph"; lines: InlineSpan[][] }`
  - `function parseEmphasis(text: string): InlineSpan[]`
  - `function parseInline(line: string, keyToN: Map<string, number>): InlineSpan[]`
  - `function parseMarkdown(text: string, keyToN: Map<string, number>): Block[]`

- [ ] **Step 1: Write the failing test**

Create `app/chat/markdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseEmphasis, parseInline, parseMarkdown } from "./markdown";

describe("parseEmphasis", () => {
  it("texte simple", () => {
    expect(parseEmphasis("plain")).toEqual([{ t: "text", text: "plain" }]);
  });
  it("gras", () => {
    expect(parseEmphasis("a **b** c")).toEqual([
      { t: "text", text: "a " },
      { t: "bold", text: "b" },
      { t: "text", text: " c" },
    ]);
  });
  it("italique * et _", () => {
    expect(parseEmphasis("*x* and _y_")).toEqual([
      { t: "italic", text: "x" },
      { t: "text", text: " and " },
      { t: "italic", text: "y" },
    ]);
  });
  it("gras non fermé → texte brut", () => {
    expect(parseEmphasis("a **b")).toEqual([{ t: "text", text: "a **b" }]);
  });
});

describe("parseInline", () => {
  it("mêle gras et citation", () => {
    const keyToN = new Map([["run:r1", 1]]);
    expect(parseInline("**MV4-11** [run:r1]", keyToN)).toEqual([
      { t: "bold", text: "MV4-11" },
      { t: "text", text: " " },
      { t: "cite", n: 1, sourceType: "run", sourceId: "r1" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("titre + liste + paragraphe", () => {
    const md = "## Section\n- item one\n- item two\n\nA paragraph.";
    expect(parseMarkdown(md, new Map())).toEqual([
      { type: "heading", level: 3, spans: [{ t: "text", text: "Section" }] },
      { type: "list", items: [
        [{ t: "text", text: "item one" }],
        [{ t: "text", text: "item two" }],
      ] },
      { type: "paragraph", lines: [[{ t: "text", text: "A paragraph." }]] },
    ]);
  });
  it("chaîne vide → aucun bloc", () => {
    expect(parseMarkdown("", new Map())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/chat/markdown.test.ts`
Expected: FAIL — « Failed to resolve import "./markdown" ».

- [ ] **Step 3: Write minimal implementation**

Create `app/chat/markdown.ts`:

```ts
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
  const boldRe = /\*\*([^*]+)\*\*/g;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/chat/markdown.test.ts`
Expected: PASS (7 tests verts).

- [ ] **Step 5: Commit**

```bash
git add app/chat/markdown.ts app/chat/markdown.test.ts
git commit -m "feat(chat): parseur markdown minimal vers blocs"
```

---

## Task 3: Libellé lisible des sources (+ câblage serveur)

**Files:**
- Create: `app/chat/sourceLabel.ts`
- Test: `app/chat/sourceLabel.test.ts`
- Modify: `app/api/chat/route.ts` (import + champ `label` dans l'évènement `sources`)

**Interfaces:**
- Consumes: — (pur) ; côté route, `MemoryHit.text` (déjà disponible)
- Produces:
  - `function deriveSourceLabel(text: string, max?: number): string`
  - `function fallbackLabel(sourceType: string, sourceId: string): string`

- [ ] **Step 1: Write the failing test**

Create `app/chat/sourceLabel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveSourceLabel, fallbackLabel } from "./sourceLabel";

describe("deriveSourceLabel", () => {
  it("première ligne non vide, sans marques markdown", () => {
    expect(deriveSourceLabel("# MV4-11 dose-response\n\nbody...")).toBe("MV4-11 dose-response");
  });
  it("nettoie le gras", () => {
    expect(deriveSourceLabel("**Quizartinib** run summary")).toBe("Quizartinib run summary");
  });
  it("tronque au-delà de la limite", () => {
    expect(deriveSourceLabel("x".repeat(80), 10)).toBe("xxxxxxxxx…");
  });
});

describe("fallbackLabel", () => {
  it("capitalise le type et raccourcit l'id", () => {
    expect(fallbackLabel("run", "run_dbc89423b1")).toBe("Run · run_dbc894");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/chat/sourceLabel.test.ts`
Expected: FAIL — « Failed to resolve import "./sourceLabel" ».

- [ ] **Step 3: Write minimal implementation**

Create `app/chat/sourceLabel.ts`:

```ts
// app/chat/sourceLabel.ts
// Libellé lisible d'une source. Pur, partagé : le serveur le dérive du texte
// indexé du hit ; le client l'affiche, avec un repli quand l'id cité n'a pas de
// hit correspondant.

/** Première ligne significative du texte, nettoyée du markdown et tronquée. */
export function deriveSourceLabel(text: string, max = 60): string {
  const firstLine =
    text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const clean = firstLine
    .replace(/^#+\s*/, "")            // titres markdown
    .replace(/\*\*|__|\*|_|`/g, "")   // gras / italique / code inline
    .trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

/** Repli sans texte : "Run · run_dbc894". */
export function fallbackLabel(sourceType: string, sourceId: string): string {
  const cap = sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
  const short = sourceId.length > 10 ? sourceId.slice(0, 10) : sourceId;
  return `${cap} · ${short}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/chat/sourceLabel.test.ts`
Expected: PASS (4 tests verts).

- [ ] **Step 5: Wire the label into the API route**

In `app/api/chat/route.ts`, add the import near the other `@/lib` / local imports at the top (after line 12):

```ts
import { deriveSourceLabel } from "@/app/chat/sourceLabel";
```

Then replace the `send({ type: "sources", … })` block (currently lines 132–140) with:

```ts
        send({
          type: "sources",
          hits: hits.map((h) => ({
            sourceType: h.sourceType,
            sourceId: h.sourceId,
            score: h.score,
            meta: h.meta,
            label: deriveSourceLabel(h.text),
          })),
        });
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/chat/sourceLabel.ts app/chat/sourceLabel.test.ts app/api/chat/route.ts
git commit -m "feat(chat): libellé lisible des sources cote serveur"
```

---

## Task 4: Types partagés + hook de conversations

**Files:**
- Create: `app/chat/types.ts`
- Create: `app/chat/useConversations.ts`
- Test: `app/chat/useConversations.test.ts`

**Interfaces:**
- Consumes: — (types autonomes)
- Produces:
  - `types.ts`: `type Role = "user" | "assistant"` ; `type SourceHit = { sourceType: string; sourceId: string; score: number; meta?: Record<string, unknown>; label?: string }` ; `type ChatMessage = { role: Role; content: string; sources?: SourceHit[] }` ; `type Conversation = { id: string; title: string; messages: ChatMessage[]; createdAt: number; updatedAt: number }`
  - `useConversations.ts`:
    - `function titleFromMessages(messages: ChatMessage[], max?: number): string`
    - `function nextActiveId(list: Conversation[], removedId: string, activeId: string): string | null`
    - `function useConversations(): { conversations: Conversation[]; activeId: string | null; active: Conversation | null; ready: boolean; create: () => string; select: (id: string) => void; remove: (id: string) => void; updateMessages: (id: string, fn: (prev: ChatMessage[]) => ChatMessage[]) => void }`

- [ ] **Step 1: Create the shared types file**

Create `app/chat/types.ts`:

```ts
// app/chat/types.ts — types partagés du chat (message, source, conversation).
export type Role = "user" | "assistant";

export type SourceHit = {
  sourceType: string;
  sourceId: string;
  score: number;
  meta?: Record<string, unknown>;
  label?: string; // dérivé côté serveur (deriveSourceLabel)
};

export type ChatMessage = { role: Role; content: string; sources?: SourceHit[] };

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};
```

- [ ] **Step 2: Write the failing test**

Create `app/chat/useConversations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { titleFromMessages, nextActiveId } from "./useConversations";
import type { Conversation } from "./types";

describe("titleFromMessages", () => {
  it("titre = première question, tronquée", () => {
    expect(
      titleFromMessages([{ role: "user", content: "What went wrong in the last run?" }], 20)
    ).toBe("What went wrong in…");
  });
  it("aucun message utilisateur → défaut", () => {
    expect(titleFromMessages([])).toBe("New discussion");
  });
});

describe("nextActiveId", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }] as Conversation[];
  it("supprimer une conv non active ne change pas l'active", () => {
    expect(nextActiveId(list, "c", "a")).toBe("a");
  });
  it("supprimer l'active → voisine précédente", () => {
    expect(nextActiveId(list, "b", "b")).toBe("a");
  });
  it("supprimer la première active → nouvelle première", () => {
    expect(nextActiveId(list, "a", "a")).toBe("b");
  });
  it("supprimer la dernière conv restante → null", () => {
    expect(nextActiveId([{ id: "a" }] as Conversation[], "a", "a")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/chat/useConversations.test.ts`
Expected: FAIL — « Failed to resolve import "./useConversations" ».

- [ ] **Step 4: Write minimal implementation**

Create `app/chat/useConversations.ts`:

```ts
"use client";
// app/chat/useConversations.ts
// Conversations persistées en localStorage : liste + conversation active, avec
// transitions pures (testables) pour le titre auto et la sélection après
// suppression. Un seul objet d'état {list, activeId} pour éviter les closures
// périmées pendant le streaming.
import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, Conversation } from "./types";

const KEY = "octopus.chat.conversations";

/** Titre auto = première question de l'utilisateur, tronquée. */
export function titleFromMessages(messages: ChatMessage[], max = 40): string {
  const text = messages.find((m) => m.role === "user")?.content.trim() ?? "";
  if (!text) return "New discussion";
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

/** Active à retenir après suppression de `removedId`. `list` = état AVANT
 *  suppression. Supprimer une conv non active ne change rien ; supprimer
 *  l'active retient la voisine précédente (ou la première restante), ou null. */
export function nextActiveId(list: Conversation[], removedId: string, activeId: string): string | null {
  if (removedId !== activeId) return activeId;
  const idx = list.findIndex((c) => c.id === removedId);
  const remaining = list.filter((c) => c.id !== removedId);
  if (remaining.length === 0) return null;
  return (remaining[idx - 1] ?? remaining[0]).id;
}

type State = { list: Conversation[]; activeId: string | null };

function load(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Conversation[]) : [];
  } catch {
    return [];
  }
}

function save(list: Conversation[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota plein / stockage désactivé : on n'échoue pas l'UI */
  }
}

/** Recalcule titre + updatedAt d'une conversation dont les messages changent. */
function withMessages(c: Conversation, messages: ChatMessage[]): Conversation {
  return {
    ...c,
    messages,
    updatedAt: Date.now(),
    title: c.title === "New discussion" ? titleFromMessages(messages) : c.title,
  };
}

export function useConversations() {
  const [state, setState] = useState<State>({ list: [], activeId: null });
  const [ready, setReady] = useState(false);

  // Hydratation client-only (évite tout mismatch SSR).
  useEffect(() => {
    const list = load();
    setState({ list, activeId: list[0]?.id ?? null });
    setReady(true);
  }, []);

  // Persistance après hydratation.
  useEffect(() => {
    if (ready) save(state.list);
  }, [state.list, ready]);

  const create = useCallback((): string => {
    const id = crypto.randomUUID();
    const conv: Conversation = { id, title: "New discussion", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setState((s) => ({ list: [conv, ...s.list], activeId: id }));
    return id;
  }, []);

  const select = useCallback((id: string) => {
    setState((s) => ({ ...s, activeId: id }));
  }, []);

  const remove = useCallback((id: string) => {
    setState((s) => ({
      list: s.list.filter((c) => c.id !== id),
      activeId: nextActiveId(s.list, id, s.activeId ?? ""),
    }));
  }, []);

  const updateMessages = useCallback((id: string, fn: (prev: ChatMessage[]) => ChatMessage[]) => {
    setState((s) => ({
      ...s,
      list: s.list.map((c) => (c.id === id ? withMessages(c, fn(c.messages)) : c)),
    }));
  }, []);

  const active = state.list.find((c) => c.id === state.activeId) ?? null;

  return { conversations: state.list, activeId: state.activeId, active, ready, create, select, remove, updateMessages };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/chat/useConversations.test.ts`
Expected: PASS (6 tests verts).

- [ ] **Step 6: Commit**

```bash
git add app/chat/types.ts app/chat/useConversations.ts app/chat/useConversations.test.ts
git commit -m "feat(chat): conversations persistees (hook localStorage)"
```

---

## Task 5: AnswerBody — rendu markdown + citations interactives (+ CSS)

**Files:**
- Create: `app/chat/AnswerBody.tsx`
- Modify: `app/globals.css` (classes `.answer-*`, `.cite-marker`, `.source-*` dans `@layer components`)

**Interfaces:**
- Consumes: `numberCitations`, `CitationRef`, `CitationSourceType` (Task 1) ; `parseMarkdown`, `Block`, `InlineSpan` (Task 2) ; `fallbackLabel` (Task 3) ; `SourceHit` (Task 4) ; `useWindowsContext` (`@/app/shell/WindowsContext`), `WindowKind` (`@/app/shell/useWindows`)
- Produces: `export default function AnswerBody({ content, sources }: { content: string; sources?: SourceHit[] }): JSX.Element`

- [ ] **Step 1: Add the CSS block**

In `app/globals.css`, inside the existing `@layer components { … }` block (append just before its closing `}`), add:

```css
  /* ===== Réponse du copilote : prose + citations ===== */
  .answer-prose { font-size: 14px; line-height: 1.6; color: var(--foreground); }
  .answer-prose > * + * { margin-top: 10px; }
  .answer-h { font-size: 15px; font-weight: 650; margin-top: 6px; }
  .answer-ul { list-style: disc; padding-left: 20px; }
  .answer-ul li { margin-top: 4px; }
  .answer-p { margin: 0; }

  .cite-marker {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 15px; height: 15px; padding: 0 3px; margin-left: 1px;
    font-size: 10px; font-weight: 700; line-height: 1; border-radius: 5px;
    cursor: pointer; background: var(--accent-soft); color: var(--accent);
    border: 1px solid transparent; vertical-align: super;
    transition: background 140ms ease, color 140ms ease, transform 140ms ease;
  }
  .cite-marker:hover, .cite-marker.is-active {
    background: var(--accent); color: #fff; transform: translateY(-1px);
  }

  .source-list {
    list-style: none; margin: 14px 0 0; padding: 12px 0 0;
    border-top: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 2px;
  }
  .source-item { border-radius: 8px; transition: background 140ms ease; }
  .source-item.is-active { background: var(--accent-soft); }
  .source-btn {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 5px 8px; text-align: left; cursor: pointer; border-radius: 8px;
  }
  .source-n {
    flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px; font-size: 10px; font-weight: 700; border-radius: 5px;
    background: var(--accent-soft); color: var(--accent);
  }
  .source-item.is-active .source-n { background: var(--accent); color: #fff; }
  .source-label { font-size: 12.5px; color: var(--ink-soft); }
```

- [ ] **Step 2: Create the component**

Create `app/chat/AnswerBody.tsx`:

```tsx
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/chat/AnswerBody.tsx app/globals.css
git commit -m "feat(chat): rendu markdown + citations numerotees interactives"
```

---

## Task 6: ConversationSidebar (+ CSS)

**Files:**
- Create: `app/chat/ConversationSidebar.tsx`
- Modify: `app/globals.css` (classes `.conv-*` dans `@layer components`)

**Interfaces:**
- Consumes: `Conversation` (Task 4)
- Produces: `export default function ConversationSidebar(props): JSX.Element` avec
  `props = { conversations: Conversation[]; activeId: string | null; onSelect: (id: string) => void; onCreate: () => void; onRemove: (id: string) => void; collapsed: boolean; onToggle: () => void }`

- [ ] **Step 1: Add the CSS block**

In `app/globals.css`, inside `@layer components { … }` (append before its closing `}`), add:

```css
  /* ===== Sidebar d'historique du chat ===== */
  .conv-sidebar {
    width: 208px; flex-shrink: 0; min-height: 0;
    display: flex; flex-direction: column; gap: 8px;
    padding: 12px 10px; border-right: 1px solid var(--border); background: var(--surface-2);
  }
  .conv-head { display: flex; align-items: center; gap: 6px; }
  .conv-new {
    flex: 1; text-align: left; font-size: 13px; font-weight: 550;
    padding: 8px 10px; border-radius: 10px; cursor: pointer;
    background: var(--surface); border: 1px solid var(--border); color: var(--foreground);
    transition: border-color 140ms ease, background 140ms ease;
  }
  .conv-new:hover { border-color: var(--border-strong); }
  .conv-collapse, .conv-reopen {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 8px; cursor: pointer;
    color: var(--muted); background: transparent;
  }
  .conv-collapse:hover, .conv-reopen:hover { background: var(--surface-3); color: var(--foreground); }
  .conv-reopen { margin: 12px 0 0 8px; border: 1px solid var(--border); background: var(--surface); }
  .conv-label {
    font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--muted); padding: 4px 6px 0;
  }
  .conv-list {
    list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0;
    display: flex; flex-direction: column; gap: 2px;
  }
  .conv-item { display: flex; align-items: center; border-radius: 8px; }
  .conv-item.is-active { background: var(--surface); }
  .conv-open {
    flex: 1; text-align: left; font-size: 13px; color: var(--ink-soft);
    padding: 7px 9px; cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .conv-item.is-active .conv-open { color: var(--foreground); font-weight: 550; }
  .conv-del {
    opacity: 0; flex-shrink: 0; width: 26px; height: 26px; border-radius: 6px;
    color: var(--muted); cursor: pointer; transition: opacity 140ms ease, color 140ms ease, background 140ms ease;
  }
  .conv-item:hover .conv-del { opacity: 1; }
  .conv-del:hover { background: var(--surface-3); color: var(--danger); }
  .conv-empty { font-size: 12px; color: var(--muted); padding: 8px 9px; }
```

- [ ] **Step 2: Create the component**

Create `app/chat/ConversationSidebar.tsx`:

```tsx
"use client";
// app/chat/ConversationSidebar.tsx
// Colonne gauche de la fenêtre de chat : nouvelle discussion, liste des
// conversations (cliquables + supprimables), repliable pour rendre la place.
import type { Conversation } from "./types";

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onRemove,
  collapsed,
  onToggle,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRemove: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (collapsed) {
    return (
      <button type="button" className="conv-reopen" onClick={onToggle} title="Show history" aria-label="Show history">
        ☰
      </button>
    );
  }
  return (
    <aside className="conv-sidebar">
      <div className="conv-head">
        <button type="button" className="conv-new" onClick={onCreate}>+ New discussion</button>
        <button type="button" className="conv-collapse" onClick={onToggle} title="Hide history" aria-label="Hide history">
          ‹
        </button>
      </div>
      <div className="conv-label">Discussions</div>
      <ul className="conv-list">
        {conversations.map((c) => (
          <li key={c.id} className={`conv-item${c.id === activeId ? " is-active" : ""}`}>
            <button type="button" className="conv-open" onClick={() => onSelect(c.id)} title={c.title}>
              {c.title}
            </button>
            <button
              type="button"
              className="conv-del"
              onClick={() => onRemove(c.id)}
              title="Delete discussion"
              aria-label="Delete discussion"
            >
              🗑
            </button>
          </li>
        ))}
        {conversations.length === 0 && <li className="conv-empty">No discussions yet.</li>}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/chat/ConversationSidebar.tsx app/globals.css
git commit -m "feat(chat): sidebar historique des conversations"
```

---

## Task 7: Réécriture de ChatClient (assemblage)

**Files:**
- Modify: `app/chat/ChatClient.tsx` (réécriture complète)

**Interfaces:**
- Consumes: `useConversations` (Task 4), `ConversationSidebar` (Task 6), `AnswerBody` (Task 5), `ChatMessage`/`SourceHit` (Task 4)
- Produces: `export default function ChatClient(): JSX.Element` (inchangé du point de vue de `WindowContent`)

- [ ] **Step 1: Replace the whole file**

Overwrite `app/chat/ChatClient.tsx` with:

```tsx
"use client";
// Chat "Ask Octopus" — sidebar d'historique (conversations persistées) + une
// conversation active. Lecteur NDJSON maison (même découpe que la voix). Le
// rendu des réponses (markdown + citations numérotées) est délégué à AnswerBody ;
// les messages de la conversation active vivent dans useConversations.
import { useRef, useState } from "react";
import { useConversations } from "./useConversations";
import ConversationSidebar from "./ConversationSidebar";
import AnswerBody from "./AnswerBody";
import type { ChatMessage, SourceHit } from "./types";

const SUGGESTIONS = [
  "What went wrong in the last run?",
  "Compare the last two runs.",
  "Which deviations should I care about?",
];

function dropEmptyAssistantTail(list: ChatMessage[]): ChatMessage[] {
  const last = list[list.length - 1];
  if (last && last.role === "assistant" && !last.content) return list.slice(0, -1);
  return list;
}

export default function ChatClient() {
  const { conversations, activeId, active, create, select, remove, updateMessages } = useConversations();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateMsg, setConsolidateMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = active?.messages ?? [];

  // Dédoublonnage du knowledge graph à la demande (inchangé). Sûr à relancer.
  async function consolidate() {
    if (consolidating) return;
    setConsolidating(true);
    setConsolidateMsg(null);
    try {
      const res = await fetch("/api/kg/consolidate", { method: "POST" });
      const body = (await res.json()) as { merges?: { merged: string[] }[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `status ${res.status}`);
      const groups = body.merges?.length ?? 0;
      const absorbed = body.merges?.reduce((s, m) => s + m.merged.length, 0) ?? 0;
      setConsolidateMsg(
        groups === 0
          ? "Graph already clean — no duplicate concepts found."
          : `Merged ${absorbed} duplicate node${absorbed > 1 ? "s" : ""} into ${groups} concept${groups > 1 ? "s" : ""}.`
      );
    } catch (e) {
      setConsolidateMsg(e instanceof Error ? e.message : "Consolidation failed.");
    } finally {
      setConsolidating(false);
    }
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    setInput("");

    // Cible : conversation active, ou nouvelle si aucune. On garde l'id sous la
    // main pour que le streaming vise CETTE conversation même si l'utilisateur
    // en sélectionne une autre entre-temps.
    let convId = activeId;
    let base: ChatMessage[] = [];
    if (!convId) convId = create();
    else base = conversations.find((c) => c.id === convId)?.messages ?? [];

    const history: ChatMessage[] = [...base, { role: "user", content: question }];
    updateMessages(convId, () => [...history, { role: "assistant", content: "", sources: [] }]);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) throw new Error(`status ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const raw = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!raw) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(raw);
          } catch {
            continue; // ligne coupée entre deux reads : déjà bufferisée
          }
          if (ev.type === "sources") {
            const hits = Array.isArray(ev.hits) ? (ev.hits as SourceHit[]) : [];
            updateMessages(convId, (ms) => {
              const next = [...ms];
              const i = next.length - 1;
              next[i] = { ...next[i], sources: hits };
              return next;
            });
          } else if (ev.type === "text_chunk") {
            const delta = String(ev.delta ?? "");
            updateMessages(convId, (ms) => {
              const next = [...ms];
              const i = next.length - 1;
              next[i] = { ...next[i], content: next[i].content + delta };
              return next;
            });
          } else if (ev.type === "error") {
            setError(String(ev.message ?? "Chat error."));
            updateMessages(convId, dropEmptyAssistantTail);
          }
        }
      }
    } catch {
      setError("Connection to the lab copilot failed. Check the server and try again.");
      updateMessages(convId, dropEmptyAssistantTail);
    } finally {
      setBusy(false);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={select}
        onCreate={create}
        onRemove={remove}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      />

      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5">
        <header className="fade-in mb-3 flex shrink-0 items-start justify-between gap-3">
          <p className="text-xs text-muted">
            Answers are grounded in your protocols, runs, evidence, and reports — with sources.
          </p>
          <button
            type="button"
            className="chip shrink-0"
            onClick={consolidate}
            disabled={consolidating}
            title="Merge duplicate concepts in the knowledge graph so cross-protocol questions link up"
          >
            {consolidating ? "Consolidating…" : "Consolidate graph"}
          </button>
        </header>
        {consolidateMsg && <p className="mb-2 shrink-0 text-xs text-muted">{consolidateMsg}</p>}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 fade-up">
              {SUGGESTIONS.map((q) => (
                <button key={q} type="button" className="chip" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex fade-up ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "user" ? (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-accent px-4 py-3 text-sm text-white">
                  {m.content}
                </div>
              ) : (
                <div className="card max-w-[85%] rounded-2xl px-4 py-3 text-sm">
                  {m.content ? (
                    <AnswerBody content={m.content} sources={m.sources} />
                  ) : busy && i === messages.length - 1 ? (
                    "…"
                  ) : (
                    ""
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="card mt-4 shrink-0 border-danger/40 bg-danger/5 p-3 text-sm text-danger">{error}</div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-3 flex shrink-0 gap-2"
        >
          <input
            className="input-field flex-1 px-4 py-2.5 text-sm"
            placeholder="Ask about a protocol, a run, a deviation…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
          <button type="submit" className="btn-accent shrink-0" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors, no lint errors.

- [ ] **Step 3: Full test suite (no regressions)**

Run: `npm test`
Expected: all suites pass, including the new `app/chat/*.test.ts`.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, open the desktop, press ⌘K (or the Ask bar) to open the chat, then verify:
1. **Historique** : a left sidebar shows « + New discussion » and « Discussions ». Sending a first question creates a discussion titled with that question; the collapse arrow hides/shows the sidebar; deleting the active discussion selects a neighbor; reloading the page keeps the discussions (localStorage).
2. **Mise en page** : the answer renders with real headings, **bold**, and bullet lists — no visible `**` markers.
3. **Citations** : inline `[run:…]`/`[report:…]` are gone, replaced by small superscript numbers; a numbered « Sources » list sits under the answer; hovering a number highlights its source (and vice-versa); clicking a number/source opens the run/report/protocol window.

- [ ] **Step 5: Commit**

```bash
git add app/chat/ChatClient.tsx
git commit -m "feat(chat): sidebar historique + reponses formatees a citations"
```

---

## Self-Review

**1. Spec coverage**
- Mise en page markdown → Tasks 2 (parse) + 5 (rendu). ✓
- Citations numérotées + survol réciproque + clic ouvre fenêtre → Tasks 1 (numérotation) + 5 (`cite-marker`/`source-list`/`windowFor`). ✓
- Libellés lisibles + repli → Task 3 (`deriveSourceLabel`/`fallbackLabel`) câblé serveur + utilisé Task 5. ✓
- Historique sidebar, conversations multiples, persistance localStorage, repli → Tasks 4 (hook) + 6 (sidebar) + 7 (assemblage). ✓
- Cas limites : tag partiel en streaming (Task 1 test) ; citation hors sources (repli Task 3/5) ; localStorage/SSR (`typeof window`, Task 4) ; suppression active (`nextActiveId`, Task 4) ; markdown malformé (gras non fermé, Task 2 test). ✓
- Hors périmètre respecté : aucune dépendance ajoutée ; pas de tables/code ; system prompt/RAG intacts. ✓

**2. Placeholder scan** — aucun « TBD/TODO » ; chaque étape de code contient le code complet ; commandes et sorties attendues explicites. ✓

**3. Type consistency** — `keyToN: Map<string, number>` produit par `numberCitations` (Task 1) et consommé par `parseInline`/`parseMarkdown` (Task 2) et `AnswerBody` (Task 5). `SourceHit` (avec `label?`) défini Task 4, produit Task 3 (route), consommé Task 5/7. `updateMessages(id, fn)`, `create(): string`, `nextActiveId`/`titleFromMessages` : signatures identiques entre Task 4 (déf) et Task 7 (usage). `windowFor` reprend exactement les `WindowKind`/params de l'ancien `sourceWindow`. ✓
