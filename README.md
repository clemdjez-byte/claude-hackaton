# 🐙 Octopus — wet lab operating system

**Protocol → voice-guided bench run → auditable report → ask your lab.** Octopus turns
a written protocol into an executable run, guides the bench **by voice**, captures every
piece of evidence (notes, photos, measurements, deviations), and reconstructs a
**planned / actually done / observed / interpreted** report where every claim cites its
source — then feeds it all into a semantic **lab memory** you can query in plain language.

Built for the hackathon **Built with Claude: Life Sciences** (Builder Track). Open
source (MIT), built from scratch around a few deliberate seams (injected `db`,
fail-closed feature flags, a single LLM layer) so the core stays portable and testable
in isolation.

## Quickstart

```bash
npm install
cp .env.example .env.local     # ANTHROPIC_API_KEY is optional, see below
npm run seed                   # demo dataset: 2 protocols, 3 runs, 1 report
npm run dev                    # http://localhost:3000
```

`/` is the whole app: a desktop shell with a navigable galaxy backdrop, a floating
toolbar (**Bench / Files / New protocol / Settings**) and an **Ask your lab** dock at
the bottom. Every surface — protocol library, a protocol, a run, a report, files, chat —
opens as a draggable/resizable window (float or fullscreen, tabs when several are open),
not a route.

Walkthrough: toolbar **Bench** (library — generate a protocol from a brief or from
uploaded documents) → open a protocol → **Activate at the bench →** opens the run window
(voice copilot, timers, notes/measurements/deviations/photos) → **Finish & report →**
opens the report window (planned/performed/observed/interpreted, every observation
cited) → toolbar **Files** to reopen any past protocol or report → click a node in the
galaxy backdrop to open what it represents → the **Ask your lab** dock for sourced
answers from everything captured so far.

To reset to a clean demo state: `npm run reset && npm run seed`.

### Without an Anthropic key

`npm run seed`, the whole protocol/run/evidence/report pipeline, and browsing the Bench
work with **no key at all** — the deterministic core (master-mix scaling, run execution,
evidence, report facts) never touches an LLM. A key only unlocks: generating/adapting a
protocol from a brief or a document, the voice copilot, and the report's prose
interpretation (Auto Report falls back to a deterministic, no-LLM summary otherwise) and
the `/chat` answers.

## What makes it reliable

- **Lab rigor lives in code.** Every number (master-mix scaling, dilution, unit
  conversion) goes through `lib/core/calc.ts` — pure, deterministic,
  tested functions. The LLM never computes a volume; it reads the number and explains it.
- **A `Quantity { value, unit }` everywhere** — never a bare number.
- **Fail-closed feature flags.** Each of the 8 bricks requires its own
  `FEATURE_*=true` env var, checked first-line in every server function.
- **Portable.** Every brick function takes `db: Db` as its first argument. The demo runs
  on SQLite; the exact same code re-plugs onto a hosted Postgres via another `Db`
  implementation, no business logic touched.
- **A single LLM layer** (Vercel AI SDK → Claude). No brick talks to a provider SDK
  directly. Routing: Haiku (voice, latency), Sonnet (protocols), Opus (reports).

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 4 · Vercel AI SDK 7
(`@ai-sdk/anthropic`) · Zod 4 · Vitest · SQLite (`better-sqlite3`) · Tiptap (protocol
document editor).

## Architecture

```
lib/core/               infra layer — shared types, deterministic calc, fail-closed
                        feature flags, the `Db` persistence interface + its SQLite
                        implementation, the single LLM layer (Vercel AI SDK → Claude).
lib/bench/              PORTABLE core — bench business logic as 8 bricks (protocol-studio,
                        live-bench, evidence-capture, auto-report, lab-memory*,
                        voice-copilot, workflow-builder, knowledge-graph*). Never imports
                        Next or a host module; every function takes `db: Db` first
                        (testable alone). *lab-memory and knowledge-graph actually live in
                        lib/retrieval/, re-exported from lib/bench where the bricks use them.
lib/retrieval/           semantic lab memory — local embeddings, indexation, search, and
                        the knowledge graph (typed relations between entities).
lib/session.ts           app seam: fixed workspace (WS = "demo") + operator, resolves the
                        SQLite store, turns the 8 FEATURE_* flags on.
lib/rag.ts               host seam: indexes protocols/runs/evidence/reports into the
                        lab memory, and links the knowledge-graph edges (run→protocol,
                        report→run) that feed the galaxy, right after each successful
                        action (best-effort).
app/shell/               the desktop shell — a `useWindows` reducer (open/close/focus/
                        fullscreen, deduped by kind+params), the draggable/resizable
                        `Window` frame, the galaxy backdrop (canvas, fetches
                        `/api/galaxy`), the toolbar and the chat dock. `/` (app/page.tsx)
                        just renders `<Desktop />`.
app/bench/, app/files/,  the actual panels mounted inside windows (protocol library, a
app/chat/               protocol, a run console, a report, the files explorer, chat) —
                        plain React components, no routing.
app/api/                Next.js API routes consumed by the panels above (voice NDJSON
                        stream, photo/data capture, document import, galaxy nodes+edges).
octopus-mcp/             standalone MCP server (stdio) — Claude Code/Desktop can query
                        the same data/octopus.db without the Next app running.
```

See [`docs/DECISIONS.md`](docs/DECISIONS.md) for the "why" behind each choice, and
[`docs/demo-script.md`](docs/demo-script.md) for a timed walkthrough of the demo.

## Tests

```bash
npm test        # tests across core + bench + retrieval + host seams
npx tsc --noEmit
npm run lint
```

## MCP server + Agent Skill (Claude Use)

- **`octopus-mcp/`** — standalone MCP server (stdio) exposing lab memory, protocols and
  reports to Claude Code / Claude Desktop. Claude queries the real Octopus data.
  ```bash
  cd octopus-mcp && npm install && npm run build
  claude mcp add octopus -- node octopus-mcp/build/index.js   # or via the repo's .mcp.json
  ```
- **`skills/rt-qpcr-protocol/`** — Agent Skill packaging RT-qPCR domain knowledge
  (master mix, scaling, cycling, Ct, MIQE, deviations).

## License

MIT — see [`LICENSE`](LICENSE).
