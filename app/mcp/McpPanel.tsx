"use client";
// Page « MCP » (dock gauche) — explique le connecteur et donne tout pour le
// brancher/gérer (Claude Code + Desktop), plus la liste des outils exposés.
// Rendue dans une fenêtre du shell : les sous-composants interactifs (CopyButton)
// sont définis au niveau MODULE et stoppent le pointerdown, sinon le focus du
// shell remonterait le composant et tuerait le clic (cf. ProtocolsClient).
import { useState } from "react";
import { TOOL_CATALOG, TOOL_CATEGORIES } from "@/app/chat/toolCatalog";

const DESKTOP_CONFIG = `{
  "mcpServers": {
    "octopus": {
      "command": "npx",
      "args": ["tsx", "--env-file-if-exists=.env.local", "scripts/mcp-server.ts"],
      "env": { "OCTOPUS_DB_PATH": "octopus.db", "OCTOPUS_WS": "demo" }
    }
  }
}`;

const ADD_CMD = "claude mcp add octopus -- npx tsx --env-file-if-exists=.env.local scripts/mcp-server.ts";

const HERO_QUESTION =
  "I'm re-expanding MOLM-14 before a dose-response campaign — I plan to seed at 2.5M cells/mL. Is that risky? And remind me of our past failures on this line.";

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      // stopPropagation : ne pas déclencher le focus/relayout de la fenêtre au pointerdown.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="rounded-md bg-black/5 px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-black/10"
    >
      {done ? "Copied ✓" : "Copy"}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-black/5 p-3 pr-16 font-mono text-xs leading-relaxed">{code}</pre>
      <div className="absolute right-2 top-2">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>;
}

export default function McpPanel() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-8 py-10 space-y-8">
      <header className="fade-in">
        <h1 className="text-4xl font-semibold tracking-tight">MCP</h1>
        <p className="mt-2 text-muted">
          Connect this lab to any Claude — Code, Desktop, Life Sciences — through one standard plug.
        </p>
      </header>

      <section className="card p-6 fade-up space-y-2">
        <p className="eyebrow">What it is</p>
        <p className="text-sm leading-relaxed">
          MCP (Model Context Protocol) is Anthropic&apos;s standard connector. Octopus exposes its lab
          memory — protocols, runs, the knowledge graph and the semantic search — as{" "}
          <span className="font-medium">{TOOL_CATALOG.length} read-only tools</span>. Any Claude plugs in and
          reasons over your real bench data. Claude can read everything and change nothing.
        </p>
      </section>

      <section className="card p-6 fade-up space-y-3">
        <p className="eyebrow">Use it in Claude Code</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            The server <Code>octopus</Code> is already declared in <Code>.mcp.json</Code> at the repo root.
          </li>
          <li>
            In this folder, check it&apos;s live — you should see <Code>octopus ✓ connected</Code>:
            <div className="mt-2">
              <CodeBlock code="claude mcp list" />
            </div>
          </li>
          <li>Ask your question in natural language.</li>
        </ol>
        <div className="pt-1">
          <p className="mb-2 text-xs text-muted">Not registered yet? Add it once:</p>
          <CodeBlock code={ADD_CMD} />
        </div>
      </section>

      <section className="card p-6 fade-up space-y-3">
        <p className="eyebrow">Use it in Claude Desktop</p>
        <p className="text-sm">
          Settings → Developer → Edit Config, then paste this and restart the app (a tools icon appears in the
          chat):
        </p>
        <CodeBlock code={DESKTOP_CONFIG} />
      </section>

      <section className="card p-6 fade-up space-y-4">
        <p className="eyebrow">The {TOOL_CATALOG.length} tools it exposes</p>
        {TOOL_CATEGORIES.map((cat) => {
          const items = TOOL_CATALOG.filter((t) => t.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{cat}</p>
              <ul className="space-y-1">
                {items.map((t) => (
                  <li key={t.name} className="text-sm">
                    <span className="font-medium">{t.label}</span>
                    <span className="text-muted"> — {t.hint}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="card p-6 fade-up space-y-3">
        <p className="eyebrow">Good to know</p>
        <p className="text-sm">
          Semantic search needs <Code>VOYAGE_API_KEY</Code> in <Code>.env.local</Code> (already set here).
        </p>
        <p className="text-sm">Try asking Claude:</p>
        <blockquote className="border-l-2 border-accent/40 pl-3 text-sm italic text-muted">{HERO_QUESTION}</blockquote>
      </section>
    </div>
  );
}
