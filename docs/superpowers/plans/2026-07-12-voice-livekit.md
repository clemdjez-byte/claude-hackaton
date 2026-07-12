# Assistant vocal temps réel (LiveKit) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le copilote vocal Web Speech de la console de run par une conversation vocale continue avec barge-in, via LiveKit Agents (Node) + Deepgram STT + Cartesia TTS, Claude Haiku inchangé.

**Architecture:** Un agent Node (`voice-agent/`) rejoint une room LiveKit par run (`bench-run-<runId>`), pipeline VAD Silero → Deepgram → Claude Haiku (plugin Anthropic natif) → Cartesia. Il importe le cerveau existant (`buildSystemPrompt` + `buildVoiceTools` de `lib/bench/voice-copilot`, jamais modifié) et écrit dans la même SQLite (WAL). Les actions navigateur (photo, caméra, timer) passent par RPC LiveKit. Le navigateur rejoint la room via un token minté par une route Next.

**Tech Stack:** `@livekit/agents` 1.5.1 + plugins (anthropic, deepgram, cartesia, silero), `@livekit/rtc-node`, `livekit-client`, `livekit-server-sdk`, `livekit-server --dev` local (Homebrew), `tsx`, `concurrently`, Next.js 16, vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-voice-livekit-design.md`. Amendement découvert en recherche : le plugin **Anthropic natif existe en JS** (1.5.1) — on l'utilise à la place de la couche de compatibilité OpenAI prévue au spec (même intention, voie plus propre ; le plan B « adaptateur maison » reste le plan B).

## Global Constraints

- **Ne JAMAIS modifier** `lib/bench/`, `lib/core/`, `lib/retrieval/` — on importe, on n'édite pas. Les adaptations vivent dans `voice-agent/` et `app/`.
- Worktree : `~/Developer/claude-hackaton-voice`, branche `feat/voice-livekit`. NE PAS travailler dans `~/Developer/claude-hackaton` (autre session active dessus).
- Versions épinglées : `@livekit/agents@1.5.1` et tous les plugins `@1.5.1`, `@livekit/rtc-node@0.13.31`, `livekit-client@2.20.1`, `livekit-server-sdk@2.17.0`. zod v4 du repo (`^4.4.3`) est compatible (peer `^3.25.76 || ^4.1.8`).
- Le repo est CommonJS (pas de `"type": "module"` racine) — `voice-agent/` a son propre `package.json` `{"type":"module"}`.
- Modèle LLM voix : `claude-haiku-4-5-20251001` (même valeur que `MODELS.voice` de `lib/core/llm.ts`, non exporté — dupliqué avec commentaire).
- Style API LiveKit : la forme **racine** vérifiée dans les examples du tag 1.5.1 (`Agent.create`, `AgentSession`, `tool()`, `ServerOptions`, `defineAgent`, `cli`) — PAS l'ancienne forme `voice.Agent`/`llm.tool`/`WorkerOptions` du README.
- Turn detection : `"vad"` (barge-in par VAD Silero, 100 % local). Le détecteur sémantique `inference.TurnDetector` passe par la gateway LiveKit Cloud — hors périmètre local, ne pas l'utiliser.
- Après chaque tâche : `npm test`, `npx tsc --noEmit`, `npm run lint` verts. `npm run build` aux tâches 6+.
- Chemins de code cités d'après l'état au commit `1eebd19` ; si une ligne a bougé, chercher le bloc par son contenu.

---

### Task 1: Dépendances, scripts et environnement

**Files:**
- Modify: `package.json` (deps + script `voice`)
- Create: `voice-agent/package.json`
- Modify: `vitest.config.ts` (include `voice-agent`)
- Modify: `.env.example`

**Interfaces:**
- Produces: packages LiveKit installés ; `npm run voice` (échouera tant que `voice-agent/agent.ts` n'existe pas — normal, livré Task 4) ; variables d'env documentées.

- [ ] **Step 1: Installer les dépendances (versions exactes)**

```bash
cd ~/Developer/claude-hackaton-voice
npm install @livekit/agents@1.5.1 @livekit/agents-plugin-anthropic@1.5.1 @livekit/agents-plugin-deepgram@1.5.1 @livekit/agents-plugin-cartesia@1.5.1 @livekit/agents-plugin-silero@1.5.1 @livekit/rtc-node@0.13.31 livekit-client@2.20.1 livekit-server-sdk@2.17.0
npm install -D concurrently
```

Expected: install sans erreur de peer deps (zod ^4.4.3 satisfait `^4.1.8`).

- [ ] **Step 2: Créer `voice-agent/package.json`** (l'agent est du pur ESM ; le reste du repo reste CJS)

```json
{
  "type": "module"
}
```

- [ ] **Step 3: Ajouter le script `voice` dans `package.json`** (bloc `scripts`)

```json
    "voice": "concurrently -k -n livekit,agent -c blue,magenta \"livekit-server --dev\" \"tsx voice-agent/agent.ts dev\"",
```

- [ ] **Step 4: Étendre `vitest.config.ts`** — remplacer la ligne `include` :

```ts
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "voice-agent/**/*.test.ts"],
```

- [ ] **Step 5: Compléter `.env.example`** — ajouter après le bloc `ANTHROPIC_API_KEY` :

```
# ── Assistant vocal temps réel (LiveKit) ─────────────────────────────────
# Prérequis une fois : `brew install livekit` (le serveur local), puis
# `npm run voice` dans un terminal à côté de `npm run dev`.

# Transcription streaming (STT). Tier gratuit : https://console.deepgram.com
DEEPGRAM_API_KEY=

# Synthèse vocale (TTS). Tier gratuit : https://play.cartesia.ai
CARTESIA_API_KEY=
# Optionnel : ID d'une voix Cartesia (bibliothèque sur play.cartesia.ai).
# Vide = voix par défaut du modèle sonic-3.
CARTESIA_VOICE_ID=

# Optionnel : serveur LiveKit. Défauts = mode dev local (`livekit-server --dev`).
# LIVEKIT_URL=ws://localhost:7880
# LIVEKIT_API_KEY=devkey
# LIVEKIT_API_SECRET=secret
```

- [ ] **Step 6: Vérifier que rien n'est cassé**

```bash
npm test && npx tsc --noEmit && npm run lint
```

Expected: 96 tests PASS, tsc et lint silencieux.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json voice-agent/package.json vitest.config.ts .env.example
git commit -m "chore(voice): dépendances LiveKit 1.5.1 + script npm run voice + env"
```

---

### Task 2: Adaptateur d'outils (`voice-agent/tools.ts`) — TDD

Le pont entre les 10 outils existants (format Vercel AI SDK v7 : `{ description, inputSchema, execute }` — champ vérifié dans `lib/bench/voice-copilot/tools.ts`) et le format `tool()` de `@livekit/agents`. Trois outils (`capture_photo`, `close_camera`, `start_timer`) sont relayés au navigateur au lieu d'être exécutés ; six outils mutateurs déclenchent `onMutation` (rafraîchissement du prompt + refresh UI).

**Files:**
- Create: `voice-agent/tools.ts`
- Test: `voice-agent/tools.test.ts`

**Interfaces:**
- Consumes: `buildVoiceTools(ctx: VoiceToolCtx)` et `type VoiceToolCtx = { db, ws, runId, operator }` depuis `@/lib/bench/voice-copilot` ; `tool()` de `@livekit/agents`.
- Produces (utilisé par Task 4) :
  - `type ClientEvent = { type: "capture_photo" } | { type: "close_camera" } | { type: "timer"; label: string; seconds: number } | { type: "did_act" }`
  - `type ToolDeps = { sendClientEvent: (ev: ClientEvent) => Promise<void>; onMutation: () => Promise<void> }`
  - `buildExecute(name: string, aiTool: AiToolLike, deps: ToolDeps): (args: Record<string, unknown>) => Promise<string>`
  - `buildAgentTools(ctx: VoiceToolCtx, deps: ToolDeps): ReturnType<typeof tool>[]`

- [ ] **Step 1: Écrire les tests qui échouent** — `voice-agent/tools.test.ts` :

```ts
// voice-agent/tools.test.ts — l'adaptateur outils AI SDK → LiveKit est la seule
// pièce nouvelle avec de la logique : on la teste sans micro ni room.
import { describe, expect, it, vi, beforeAll } from "vitest";
import { createDb } from "@/lib/core/sqlite";
import { seedReferenceProtocol } from "@/lib/bench/protocol-studio";
import { startRun } from "@/lib/bench/live-bench";
import { buildVoiceTools } from "@/lib/bench/voice-copilot";
import { buildAgentTools, buildExecute, type ToolDeps } from "./tools";

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_LIVE_BENCH = "true";
  process.env.FEATURE_EVIDENCE_CAPTURE = "true";
  process.env.FEATURE_VOICE_COPILOT = "true";
});

function deps(): ToolDeps & { sendClientEvent: ReturnType<typeof vi.fn>; onMutation: ReturnType<typeof vi.fn> } {
  return { sendClientEvent: vi.fn(async () => {}), onMutation: vi.fn(async () => {}) };
}

function fakeAiTool(result: unknown = "ok") {
  return { description: "d", inputSchema: undefined, execute: vi.fn(async () => result) };
}

describe("buildExecute — outils client (relayés au navigateur)", () => {
  it("start_timer envoie un event timer et n'exécute PAS l'outil serveur", async () => {
    const d = deps();
    const ai = fakeAiTool();
    const out = await buildExecute("start_timer", ai, d)({ label: "élution", seconds: 120 });
    expect(d.sendClientEvent).toHaveBeenCalledWith({ type: "timer", label: "élution", seconds: 120 });
    expect(ai.execute).not.toHaveBeenCalled();
    expect(d.onMutation).not.toHaveBeenCalled();
    expect(typeof out).toBe("string");
  });

  it("capture_photo et close_camera relaient l'event correspondant", async () => {
    for (const name of ["capture_photo", "close_camera"] as const) {
      const d = deps();
      await buildExecute(name, fakeAiTool(), d)({});
      expect(d.sendClientEvent).toHaveBeenCalledWith({ type: name });
    }
  });
});

describe("buildExecute — outils serveur", () => {
  it("next_step délègue à l'outil AI SDK puis déclenche onMutation", async () => {
    const d = deps();
    const ai = fakeAiTool("étape suivante ok");
    const out = await buildExecute("next_step", ai, d)({});
    expect(ai.execute).toHaveBeenCalled();
    expect(d.onMutation).toHaveBeenCalledTimes(1);
    expect(out).toBe("étape suivante ok");
  });

  it("query_memory délègue SANS onMutation (lecture seule)", async () => {
    const d = deps();
    await buildExecute("query_memory", fakeAiTool(), d)({ query: "gel" });
    expect(d.onMutation).not.toHaveBeenCalled();
  });

  it("sérialise un résultat objet en JSON", async () => {
    const d = deps();
    const out = await buildExecute("add_note", fakeAiTool({ noted: true }), d)({ text: "x" });
    expect(out).toBe(JSON.stringify({ noted: true }));
    expect(d.onMutation).toHaveBeenCalled();
  });
});

describe("buildAgentTools — intégration avec les vrais outils du cœur", () => {
  it("mappe les 10 outils du copilote sur un run réel", async () => {
    const db = createDb(":memory:");
    const proto = await seedReferenceProtocol(db, "demo");
    const ctx = await startRun(db, "demo", { operator: "op", protocolId: proto.id });
    const aiTools = buildVoiceTools({ db, ws: "demo", runId: ctx.run.id, operator: "op" });
    expect(Object.keys(aiTools).sort()).toEqual([
      "add_note", "capture_photo", "close_camera", "flag_deviation", "next_step",
      "query_memory", "record_measurement", "skip_step", "start_timer", "step_back",
    ]);
    const mapped = buildAgentTools({ db, ws: "demo", runId: ctx.run.id, operator: "op" }, deps());
    expect(mapped).toHaveLength(10);
    db.close();
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
npx vitest run voice-agent/tools.test.ts
```

Expected: FAIL — `Cannot find module './tools'` (ou équivalent).

- [ ] **Step 3: Implémenter `voice-agent/tools.ts`**

```ts
// voice-agent/tools.ts — pont entre les outils du copilote vocal (format Vercel
// AI SDK v7 : description/inputSchema/execute) et les function tools de
// @livekit/agents. Trois outils sont « client » : le navigateur les exécute
// (webcam, timer), l'agent ne fait que relayer l'ordre par RPC. Les outils qui
// modifient l'état du run déclenchent onMutation (prompt + UI resynchronisés).
import { tool } from "@livekit/agents";
import { z } from "zod";
import { buildVoiceTools, type VoiceToolCtx } from "@/lib/bench/voice-copilot";

export type ClientEvent =
  | { type: "capture_photo" }
  | { type: "close_camera" }
  | { type: "timer"; label: string; seconds: number }
  | { type: "did_act" };

export type ToolDeps = {
  sendClientEvent: (ev: ClientEvent) => Promise<void>;
  onMutation: () => Promise<void>;
};

// Forme minimale d'un outil AI SDK v7 telle que produite par buildVoiceTools.
export type AiToolLike = {
  description?: string;
  inputSchema?: unknown;
  execute?: (args: Record<string, unknown>, opts: { toolCallId: string; messages: [] }) => unknown;
};

// Outils dont l'état modifié doit être répercuté (prompt de l'agent + refresh UI).
const MUTATING_TOOLS = new Set([
  "next_step", "skip_step", "step_back", "add_note", "record_measurement", "flag_deviation",
]);

export function buildExecute(name: string, aiTool: AiToolLike, deps: ToolDeps) {
  return async (args: Record<string, unknown>): Promise<string> => {
    if (name === "start_timer") {
      const label = String(args.label ?? "timer");
      const seconds = Math.max(1, Math.round(Number(args.seconds ?? 0)));
      await deps.sendClientEvent({ type: "timer", label, seconds });
      return `Timer « ${label} » lancé (${seconds}s), visible à l'écran.`;
    }
    if (name === "capture_photo") {
      await deps.sendClientEvent({ type: "capture_photo" });
      return "Caméra déclenchée, la photo arrive dans les preuves.";
    }
    if (name === "close_camera") {
      await deps.sendClientEvent({ type: "close_camera" });
      return "Caméra coupée.";
    }
    const result = await aiTool.execute?.({ ...args }, { toolCallId: name, messages: [] });
    if (MUTATING_TOOLS.has(name)) await deps.onMutation();
    return typeof result === "string" ? result : JSON.stringify(result ?? null);
  };
}

export function buildAgentTools(ctx: VoiceToolCtx, deps: ToolDeps) {
  return Object.entries(buildVoiceTools(ctx)).map(([name, aiTool]) => {
    const t = aiTool as AiToolLike;
    return tool({
      name,
      description: t.description ?? name,
      // Les inputSchema du cœur sont des schémas zod (v4) — le format attendu.
      parameters: (t.inputSchema ?? z.object({})) as never,
      execute: buildExecute(name, t, deps),
    });
  });
}
```

Note d'implémentation : si `tool()` de `@livekit/agents` refuse le cast `parameters` au typage strict, vérifier sa signature dans `node_modules/@livekit/agents/dist/llm/tool_context.d.ts` et ajuster le cast — le contrat runtime (schéma zod) est le bon.

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npx vitest run voice-agent/tools.test.ts && npm test
```

Expected: les nouveaux tests PASS, les 96 existants toujours verts.

- [ ] **Step 5: tsc + lint, puis commit**

```bash
npx tsc --noEmit && npm run lint
git add voice-agent/tools.ts voice-agent/tools.test.ts
git commit -m "feat(voice): adaptateur des 10 outils du copilote vers LiveKit Agents (TDD)"
```

---

### Task 3: Route token (`app/api/bench/voice-token/route.ts`) — TDD

Le navigateur demande un ticket d'entrée dans la room du run. Mêmes gardes que l'ancienne route voix : flag `voiceCopilot` fail-closed + run existant.

**Files:**
- Create: `app/api/bench/voice-token/route.ts`
- Test: `app/api/bench/voice-token/route.test.ts`

**Interfaces:**
- Consumes: `getBenchSession()` de `@/lib/session` ; `isEnabled` de `@/lib/core` ; `AccessToken` de `livekit-server-sdk`.
- Produces (utilisé par Task 5) : `POST /api/bench/voice-token` body `{ runId: string }` → 200 `{ url: string, token: string, room: string }` | 400 | 403 | 404. Room = `bench-run-<runId>`.

- [ ] **Step 1: Écrire les tests qui échouent** — `app/api/bench/voice-token/route.test.ts` :

```ts
// Tests de la route token : gardes (flag, runId, run existant) + forme du 200.
// La DB singleton du process de test est mise en mémoire AVANT tout import.
process.env.OCTOPUS_DB_PATH = ":memory:";

import { describe, expect, it, vi, afterEach, beforeAll } from "vitest";
import { getDb } from "@/lib/core/sqlite";
import { seedReferenceProtocol } from "@/lib/bench/protocol-studio";
import { startRun } from "@/lib/bench/live-bench";
import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://test/api/bench/voice-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  process.env.FEATURE_PROTOCOL_STUDIO = "true";
  process.env.FEATURE_LIVE_BENCH = "true";
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/bench/voice-token", () => {
  it("403 si le flag voiceCopilot est désactivé (fail-closed)", async () => {
    vi.stubEnv("FEATURE_VOICE_COPILOT", "false");
    const res = await POST(req({ runId: "x" }));
    expect(res.status).toBe(403);
  });

  it("400 sans runId", async () => {
    vi.stubEnv("FEATURE_VOICE_COPILOT", "true");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("404 si le run n'existe pas", async () => {
    vi.stubEnv("FEATURE_VOICE_COPILOT", "true");
    const res = await POST(req({ runId: "run-inconnu" }));
    expect(res.status).toBe(404);
  });

  it("200 avec url, token JWT et room bench-run-<id> pour un run réel", async () => {
    vi.stubEnv("FEATURE_VOICE_COPILOT", "true");
    const db = getDb(); // même singleton :memory: que la route
    const proto = await seedReferenceProtocol(db, "demo");
    const ctx = await startRun(db, "demo", { operator: "bench-operator", protocolId: proto.id });
    const res = await POST(req({ runId: ctx.run.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room).toBe(`bench-run-${ctx.run.id}`);
    expect(body.url).toMatch(/^wss?:\/\//);
    expect(body.token.split(".")).toHaveLength(3); // un JWT a 3 segments
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
npx vitest run app/api/bench/voice-token/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implémenter la route**

```ts
// app/api/bench/voice-token/route.ts — ticket d'entrée dans la room LiveKit du
// run. Mêmes gardes que l'ancienne route voix : flag fail-closed + run existant.
// Défauts = serveur local `livekit-server --dev` (devkey/secret).
import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { isEnabled } from "@/lib/core";
import { getBenchSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isEnabled("voiceCopilot")) {
    return NextResponse.json({ error: "Copilote vocal désactivé." }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { runId?: unknown } | null;
  const runId = typeof body?.runId === "string" && body.runId ? body.runId : null;
  if (!runId) return NextResponse.json({ error: "runId requis." }, { status: 400 });

  const { store, ctx } = getBenchSession();
  const run = await store.getRun(runId);
  if (!run) return NextResponse.json({ error: "Run introuvable." }, { status: 404 });

  const room = `bench-run-${runId}`;
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY ?? "devkey",
    process.env.LIVEKIT_API_SECRET ?? "secret",
    { identity: ctx.userId, ttl: "2h" }
  );
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });

  return NextResponse.json({
    url: process.env.LIVEKIT_URL ?? "ws://localhost:7880",
    token: await at.toJwt(),
    room,
  });
}
```

Note : si `db.getRun` n'est pas le nom exact de la méthode, le chercher dans `lib/core/db.ts` (interface `Db`) — `getRunContext` de `lib/bench/live-bench/index.ts` l'appelle (`db.getRun(runId)` vérifié au commit 1eebd19).

- [ ] **Step 4: Vérifier que les tests passent, tsc + lint, commit**

```bash
npx vitest run app/api/bench/voice-token/route.test.ts && npm test && npx tsc --noEmit && npm run lint
git add app/api/bench/voice-token/
git commit -m "feat(voice): route token LiveKit gardée par le flag voiceCopilot (TDD)"
```

---

### Task 4: L'agent vocal (`voice-agent/agent.ts`)

Le worker Node : pipeline voix complet + cerveau importé du cœur. Pas de test unitaire (pur câblage vérifié en smoke test + QA) — la logique testable est dans Task 2.

**Files:**
- Create: `voice-agent/agent.ts`

**Interfaces:**
- Consumes: `buildAgentTools`, `type ClientEvent` (Task 2) ; `getBenchSession, WS, OPERATOR` de `@/lib/session` ; `buildSystemPrompt` et `getRunContext` de `@/lib/bench`.
- Produces: worker qui rejoint automatiquement toute room `bench-run-*` ; RPC `bench.client_event` vers le navigateur avec payload `JSON.stringify(ClientEvent)` (consommé Task 5).

- [ ] **Step 1: Écrire `voice-agent/agent.ts`**

```ts
// voice-agent/agent.ts — l'agent vocal du Bench. Rejoint la room LiveKit d'un
// run (bench-run-<runId>), écoute en continu (barge-in par VAD : on peut lui
// couper la parole), pilote la manip avec les MÊMES outils et le MÊME prompt
// que l'ancien copilote (lib/bench/voice-copilot, importé, jamais modifié),
// et écrit dans la même SQLite que le site (mode WAL).
// Lancement : `npm run voice` (livekit-server --dev + cet agent, cf. package.json).
import { fileURLToPath } from "node:url";
import {
  Agent,
  AgentSession,
  type JobContext,
  ServerOptions,
  cli,
  defineAgent,
} from "@livekit/agents";
import * as anthropic from "@livekit/agents-plugin-anthropic";
import * as cartesia from "@livekit/agents-plugin-cartesia";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as silero from "@livekit/agents-plugin-silero";
import { buildSystemPrompt, getRunContext } from "@/lib/bench";
import { OPERATOR, WS, getBenchSession } from "@/lib/session";
import { buildAgentTools, type ClientEvent } from "./tools";

const ROOM_PREFIX = "bench-run-";
// Même modèle que MODELS.voice de lib/core/llm.ts (non exporté) : Haiku, latence.
const VOICE_MODEL = "claude-haiku-4-5-20251001";

// Fail-fast : sans ces clés le pipeline est muet/sourd — on refuse de démarrer
// avec un message actionnable plutôt que d'échouer en pleine conversation.
for (const key of ["ANTHROPIC_API_KEY", "DEEPGRAM_API_KEY", "CARTESIA_API_KEY"]) {
  if (!process.env[key]) {
    console.error(`[voice-agent] ${key} manquante — renseigne-la dans .env.local (voir .env.example).`);
    process.exit(1);
  }
}

export default defineAgent({
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const roomName = ctx.room.name ?? "";
    if (!roomName.startsWith(ROOM_PREFIX)) return; // pas une room du Bench
    const runId = roomName.slice(ROOM_PREFIX.length);

    const { store } = getBenchSession();
    const runContext = await getRunContext(store, runId);
    if (!runContext) {
      console.error(`[voice-agent] run introuvable : ${runId}`);
      return;
    }

    // Relaye un ordre au(x) navigateur(s) de la room. Un échec RPC (page en
    // cours de rechargement) ne doit pas faire tomber le tour de parole.
    const sendClientEvent = async (ev: ClientEvent) => {
      const payload = JSON.stringify(ev);
      for (const p of ctx.room.remoteParticipants.values()) {
        await ctx.room.localParticipant
          ?.performRpc({
            destinationIdentity: p.identity,
            method: "bench.client_event",
            payload,
            responseTimeout: 10_000,
          })
          .catch((e: unknown) => console.warn(`[voice-agent] RPC vers ${p.identity} :`, e));
      }
    };

    const agent = Agent.create({
      instructions: buildSystemPrompt(runContext),
      tools: buildAgentTools(
        { db: store, ws: WS, runId, operator: OPERATOR },
        {
          sendClientEvent,
          // Après un outil mutateur : l'agent voit l'état à jour, l'UI aussi.
          onMutation: async () => {
            const fresh = await getRunContext(store, runId);
            if (fresh) await agent.updateInstructions(buildSystemPrompt(fresh));
            await sendClientEvent({ type: "did_act" });
          },
        }
      ),
    });

    const session = new AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      // nova-3 multilingue : gère le français, l'anglais et le code-switching.
      stt: new deepgram.STT({ model: "nova-3", language: "multi" }),
      llm: new anthropic.LLM({ model: VOICE_MODEL }),
      tts: new cartesia.TTS({
        model: "sonic-3",
        language: "fr",
        ...(process.env.CARTESIA_VOICE_ID ? { voice: process.env.CARTESIA_VOICE_ID } : {}),
      }),
      // VAD pur : 100 % local (le détecteur sémantique passe par LiveKit Cloud).
      turnDetection: "vad",
    });

    await session.start({ agent, room: ctx.room });
    session.say("Copilote prêt.");
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    wsURL: process.env.LIVEKIT_URL ?? "ws://localhost:7880",
    apiKey: process.env.LIVEKIT_API_KEY ?? "devkey",
    apiSecret: process.env.LIVEKIT_API_SECRET ?? "secret",
  })
);
```

Notes d'implémentation (vérifier contre les `.d.ts` de `node_modules/@livekit/agents` si tsc râle, sans changer l'intention) :
- `turnDetection: "vad"` : si le type n'accepte pas la string, chercher la valeur équivalente dans le type `TurnDetectionMode` exporté. NE PAS basculer sur `inference.TurnDetector` (cloud).
- `ServerOptions` : si les noms exacts sont `wsURL`/`apiKey`/`apiSecret` différents, les lire dans `agents/src/worker.ts` (vérifiés présents au tag 1.5.1).
- `proc.userData.vad` : typage `unknown` → cast comme dans l'exemple `basic_agent.ts` du tag.

- [ ] **Step 2: tsc + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: silencieux.

- [ ] **Step 3: Smoke test — l'agent démarre et s'enregistre** (nécessite `brew install livekit` fait ; clés factices suffisent pour l'enregistrement)

```bash
livekit-server --dev &
sleep 2
ANTHROPIC_API_KEY=sk-test DEEPGRAM_API_KEY=x CARTESIA_API_KEY=x npx tsx voice-agent/agent.ts dev &
sleep 8
# Attendu dans les logs de l'agent : "registered worker" (connexion ws://localhost:7880 OK)
kill %2 %1
```

Expected: la ligne `registered worker` apparaît ; aucun crash. (Si `brew install livekit` n'est pas fait, le signaler et passer — le smoke complet est répété en QA, Task 8.)

- [ ] **Step 4: Vérifier que le fail-fast marche**

```bash
npx tsx voice-agent/agent.ts dev; echo "exit=$?"
```

Expected (sans clés dans l'env) : message `DEEPGRAM_API_KEY manquante…` (ou ANTHROPIC en premier) et `exit=1`.

- [ ] **Step 5: Commit**

```bash
git add voice-agent/agent.ts
git commit -m "feat(voice): agent LiveKit — VAD Silero + Deepgram multi + Claude Haiku + Cartesia"
```

---

### Task 5: Hook client (`app/bench/run/[runId]/useVoiceRoom.ts`)

La connexion navigateur : token → room → micro → audio de l'agent → transcriptions → RPC entrant. Pas de test unitaire (API navigateur pures) ; validé par tsc/lint puis QA.

**Files:**
- Create: `app/bench/run/[runId]/useVoiceRoom.ts`

**Interfaces:**
- Consumes: `POST /api/bench/voice-token` (Task 3) ; RPC `bench.client_event` (Task 4) ; `livekit-client`.
- Produces (utilisé par Task 6) :
  - `type VoiceRoomStatus = "off" | "connecting" | "waiting_agent" | "initializing" | "idle" | "listening" | "thinking" | "speaking" | "error"`
  - `type TranscriptLine = { id: string; from: "you" | "agent"; text: string; final: boolean }`
  - `useVoiceRoom(opts: { runId: string; onEvent: (ev: ClientEvent) => void }): { status, error, transcript, muted, connect(), disconnect(), toggleMute() }`
  - `type ClientEvent` — redéclaré ici (le hook est du code client ; il n'importe PAS `voice-agent/`, qui tire SQLite).

- [ ] **Step 1: Écrire le hook**

```ts
"use client";
// useVoiceRoom — remplace useVoice (Web Speech) : le navigateur rejoint la room
// LiveKit du run, publie le micro (echo cancellation native → barge-in possible,
// le micro reste OUVERT pendant que l'agent parle), joue l'audio de l'agent,
// affiche les transcriptions des deux côtés et exécute les ordres de l'agent
// (photo, caméra, timer, refresh) reçus par RPC.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ParticipantKind,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RpcInvocationData,
} from "livekit-client";

// Miroir du ClientEvent de voice-agent/tools.ts (pas d'import croisé : le hook
// est du code client, voice-agent/ tire better-sqlite3).
export type ClientEvent =
  | { type: "capture_photo" }
  | { type: "close_camera" }
  | { type: "timer"; label: string; seconds: number }
  | { type: "did_act" };

export type VoiceRoomStatus =
  | "off" | "connecting" | "waiting_agent"
  | "initializing" | "idle" | "listening" | "thinking" | "speaking"
  | "error";

export type TranscriptLine = { id: string; from: "you" | "agent"; text: string; final: boolean };

const AGENT_TIMEOUT_MS = 8000;
const HINT = "Lance `npm run voice` dans un terminal (voir README).";

export function useVoiceRoom(opts: { runId: string; onEvent: (ev: ClientEvent) => void }) {
  const [status, setStatus] = useState<VoiceRoomStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const roomRef = useRef<Room | null>(null);
  const onEventRef = useRef(opts.onEvent);
  useEffect(() => {
    onEventRef.current = opts.onEvent;
  });

  const disconnect = useCallback(() => {
    void roomRef.current?.disconnect();
    roomRef.current = null;
    setStatus("off");
    setMuted(false);
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setTranscript([]);
    setStatus("connecting");

    let grant: { url: string; token: string };
    try {
      const res = await fetch("/api/bench/voice-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: opts.runId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      grant = await res.json();
    } catch {
      setError("Impossible d'obtenir l'accès voix (serveur Next).");
      setStatus("error");
      return;
    }

    const room = new Room({
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    });
    roomRef.current = room;

    // Audio de l'agent : éléments <audio> cachés attachés au body.
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.style.display = "none";
        document.body.appendChild(el);
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      for (const el of track.detach()) el.remove();
    });
    room.on(RoomEvent.Disconnected, () => {
      if (roomRef.current === room) {
        roomRef.current = null;
        setStatus("off");
      }
    });

    // État de l'agent (listening/thinking/speaking) publié en attribut LiveKit.
    room.on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => {
      if (participant.kind !== ParticipantKind.AGENT) return;
      const s = participant.attributes["lk.agent.state"];
      if (s === "initializing" || s === "idle" || s === "listening" || s === "thinking" || s === "speaking") {
        setStatus(s);
      }
    });

    // Transcriptions temps réel (topic standard lk.transcription, streamé par
    // segments ; un segment est mis à jour jusqu'à lk.transcription_final).
    room.registerTextStreamHandler("lk.transcription", async (reader, participantInfo) => {
      const from: TranscriptLine["from"] =
        participantInfo.identity === room.localParticipant.identity ? "you" : "agent";
      const id = reader.info.id;
      let text = "";
      for await (const chunk of reader) {
        text += chunk;
        const final = reader.info.attributes?.["lk.transcription_final"] === "true";
        setTranscript((lines) => {
          const next = lines.filter((l) => l.id !== id);
          next.push({ id, from, text, final });
          return next.slice(-20); // fenêtre courte : c'est un fil de conversation
        });
      }
    });

    // Ordres de l'agent (photo, caméra, timer, refresh).
    room.localParticipant.registerRpcMethod("bench.client_event", async (data: RpcInvocationData) => {
      try {
        onEventRef.current(JSON.parse(data.payload) as ClientEvent);
      } catch {
        /* payload inattendu : ignoré */
      }
      return "ok";
    });

    try {
      await room.connect(grant.url, grant.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.startAudio(); // appelé depuis le clic Start → autoplay OK
    } catch {
      setError(`Connexion voix impossible. ${HINT}`);
      setStatus("error");
      void room.disconnect();
      roomRef.current = null;
      return;
    }

    setStatus("waiting_agent");
    setTimeout(() => {
      if (roomRef.current !== room) return;
      const hasAgent = [...room.remoteParticipants.values()].some(
        (p) => p.kind === ParticipantKind.AGENT
      );
      if (!hasAgent) {
        setError(`L'agent vocal n'a pas rejoint. ${HINT}`);
        setStatus("error");
        void room.disconnect();
        roomRef.current = null;
      }
    }, AGENT_TIMEOUT_MS);
  }, [opts.runId]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    void room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  // Raccroche en quittant la page.
  useEffect(() => () => void roomRef.current?.disconnect(), []);

  return { status, error, transcript, muted, connect, disconnect, toggleMute };
}
```

Notes d'implémentation : si `ParticipantKind.AGENT` / `reader.info.attributes` / la signature de `registerTextStreamHandler` diffèrent dans `livekit-client@2.20.1`, vérifier dans `node_modules/livekit-client/dist/src/**/*.d.ts` — les noms ci-dessus sont ceux des docs de juillet 2026.

- [ ] **Step 2: tsc + lint** (attention règle `react-hooks/immutability` du repo : états et fonctions déclarés AVANT les hooks qui les consomment — le hook ci-dessus respecte l'ordre)

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add "app/bench/run/[runId]/useVoiceRoom.ts"
git commit -m "feat(voice): hook useVoiceRoom — room LiveKit, transcripts, RPC, états agent"
```

---

### Task 6: Brancher `RunConsole` et supprimer l'ancien système

**Files:**
- Modify: `app/bench/run/[runId]/RunConsole.tsx`
- Delete: `app/bench/useVoice.ts`, `app/bench/sentences.ts`, `app/api/bench/voice/route.ts`
- Modify: `package.json` (retirer `@types/dom-speech-recognition`)

**Interfaces:**
- Consumes: `useVoiceRoom`, `VoiceRoomStatus`, `ClientEvent` (Task 5).
- Produces: la console de run n'a plus AUCUNE référence à Web Speech ; `lib/bench/voice-copilot` n'est plus importé que par `voice-agent/` (et ses propres tests du cœur).

Simplifications assumées (validées au design) : plus de push-to-talk, plus de mode ambient, plus de sélecteur FR/EN (`bench.voice.lang`), plus d'earcon. L'annonce vocale de fin de timer disparaît aussi (l'agent ne parle que dans la conversation) : le compte à rebours visuel, Pause/Resume/Clear, restent inchangés.

- [ ] **Step 1: Nettoyer les imports et constantes** en tête de `RunConsole.tsx` — supprimer :

```tsx
import { useVoice } from "../../useVoice";
import { takeSentences } from "../../sentences";
import type { VoiceLang } from "@/lib/bench";
// ...
const LANG_TAGS: Record<VoiceLang, string> = { fr: "fr-FR", en: "en-US" };
const VOICE_LANG_KEY = "bench.voice.lang";
```

et ajouter :

```tsx
import { useVoiceRoom, type ClientEvent, type VoiceRoomStatus } from "./useVoiceRoom";
```

- [ ] **Step 2: Remplacer le bloc d'états voix (L173-248 env.)** — supprimer : `reply`, `voiceBusy`, `onTranscriptRef`, `voiceLang` + `changeVoiceLang` + effet localStorage, `voice = useVoice(...)`, `playEarcon` + `audioCtxRef`, `NET_ERROR`, `ambient` + `toggleAmbient`, `handleTranscript` en entier, et l'effet `onTranscriptRef.current = handleTranscript` (garder `timersRef.current = timers` s'il reste utile au tick). Conserver : `timers`, `timerSeq`, `timersRef`, `addTimer`, `router`. Ajouter à la place :

```tsx
  // ── Copilote vocal (LiveKit : conversation continue, barge-in) ──
  const router = useRouter();
  const [timers, setTimers] = useState<ActiveTimer[]>([]);
  const timerSeq = useRef(0);
  const timersRef = useRef<ActiveTimer[]>([]);

  function addTimer(label: string, seconds: number) {
    timerSeq.current += 1;
    setTimers((ts) => [
      ...ts,
      { id: timerSeq.current, label, remaining: Math.max(1, Math.round(seconds)), running: true },
    ]);
  }

  // Les ordres de l'agent (mêmes effets que l'ancien flux NDJSON).
  const voiceRoom = useVoiceRoom({
    runId: run.id,
    onEvent: (ev: ClientEvent) => {
      switch (ev.type) {
        case "timer":
          addTimer(ev.label, ev.seconds);
          break;
        case "capture_photo":
          setMode("photo");
          setCameraOn(true);
          setVoicePhotoPending(true);
          break;
        case "close_camera":
          setCameraOn(false);
          setVoicePhotoPending(false);
          break;
        case "did_act":
          router.refresh();
          break;
      }
    },
  });
```

(Si la règle lint `react-hooks/immutability` râle sur l'ordre, déclarer `addTimer` et les setters AVANT l'appel `useVoiceRoom` — c'est déjà l'ordre ci-dessus.)

- [ ] **Step 3: Simplifier le tick des timers (L337-357 env.)** — retirer l'annonce vocale d'expiration (`voice.speak(...)` et le calcul `expiring`), garder le décompte :

```tsx
  useEffect(() => {
    timersRef.current = timers;
  });

  useEffect(() => {
    if (timers.length === 0) return;
    const iv = setInterval(() => {
      setTimers((ts) =>
        ts.map((t) => {
          if (!t.running || t.remaining === 0) return t;
          const remaining = t.remaining - 1;
          return { ...t, remaining, running: remaining > 0 ? t.running : false };
        })
      );
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timers.length]);
```

- [ ] **Step 4: Remplacer le panneau « Voice copilot » (L699-786 env., colonne 3)** par :

```tsx
          {/* Voice copilot — conversation continue LiveKit (barge-in : parler
              pendant qu'il parle l'interrompt ; le micro reste ouvert). */}
          {live && (
            <section className="card p-4 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-tight">Voice copilot</h2>
                <span className="receipt">{VOICE_STATUS_LABEL[voiceRoom.status]}</span>
              </div>

              {voiceRoom.status === "off" || voiceRoom.status === "error" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void voiceRoom.connect()}
                    className="btn-accent w-full select-none"
                  >
                    Start conversation
                  </button>
                  {voiceRoom.error && <p className="text-[13px] text-danger">{voiceRoom.error}</p>}
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <button type="button" onClick={voiceRoom.toggleMute} className="chip flex-1 justify-center">
                      {voiceRoom.muted ? "Unmute" : "Mute"}
                    </button>
                    <button
                      type="button"
                      onClick={voiceRoom.disconnect}
                      className="chip flex-1 justify-center"
                      style={{ color: "var(--danger)" }}
                    >
                      End
                    </button>
                  </div>
                  {voiceRoom.transcript.length > 0 && (
                    <div className="rounded-[10px] border border-[var(--oct-border,#E5E2D8)] bg-[var(--oct-paper-2,#F0EDE3)] px-3 py-2 text-[13px] max-h-32 overflow-y-auto space-y-1">
                      {voiceRoom.transcript.map((l) => (
                        <p key={l.id} className={l.from === "you" ? "text-muted" : undefined}>
                          <span className="font-medium">{l.from === "you" ? "You" : "Copilot"} · </span>
                          {l.text}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
```

et déclarer au niveau module (à côté de `DIMENSIONLESS`) :

```tsx
const VOICE_STATUS_LABEL: Record<VoiceRoomStatus, string> = {
  off: "off",
  connecting: "connecting…",
  waiting_agent: "waiting for agent…",
  initializing: "starting…",
  idle: "ready",
  listening: "listening…",
  thinking: "thinking…",
  speaking: "speaking…",
  error: "error",
};
```

- [ ] **Step 5: Supprimer l'ancien système**

```bash
git rm app/bench/useVoice.ts app/bench/sentences.ts app/api/bench/voice/route.ts
npm uninstall @types/dom-speech-recognition
```

- [ ] **Step 6: Traquer les références restantes**

```bash
grep -rn "useVoice\b\|takeSentences\|sentences\"\|dom-speech-recognition\|api/bench/voice\"\|SpeechRecognition\|speechSynthesis" app/ voice-agent/ --include='*.ts' --include='*.tsx'
```

Expected: AUCUN résultat hors `useVoiceRoom` (le grep `useVoice\b` ne matche pas `useVoiceRoom`). S'il existe un `sentences.test.ts` ou un test de l'ancienne route, le supprimer aussi (`git rm`).

- [ ] **Step 7: Vérification complète**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

Expected: tout vert (le compte de tests baisse si des tests de l'ancien système ont été supprimés — c'est attendu ; aucun test existant ne doit ÉCHOUER).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(voice): console de run sur LiveKit + suppression du système Web Speech"
```

---

### Task 7: Documentation (README)

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: tout ce qui précède. Produces: setup reproductible pour un nouvel arrivant.

- [ ] **Step 1: Mettre à jour le Quickstart** — après la ligne `npm run dev`, ajouter :

```md
# Voice copilot (real-time, interruptible) — optional but the fun part:
brew install livekit            # once — local LiveKit server
npm run voice                   # in a second terminal, next to `npm run dev`
```

- [ ] **Step 2: Ajouter une section dédiée** (après le Quickstart) :

```md
## Voice copilot

The bench run console (`/bench/run/[runId]`) has a hands-free voice copilot: a
continuous conversation where you can interrupt the assistant mid-sentence
(barge-in). It is built on [LiveKit Agents](https://github.com/livekit/agents-js)
running locally:

- **STT** — Deepgram `nova-3` multilingual streaming ([free tier](https://console.deepgram.com))
- **Brain** — Claude Haiku with the same 10 run-control tools as the UI
- **TTS** — Cartesia `sonic-3` ([free tier](https://play.cartesia.ai), set
  `CARTESIA_VOICE_ID` to pick a voice)

Setup: `brew install livekit`, put `DEEPGRAM_API_KEY` and `CARTESIA_API_KEY` in
`.env.local`, then run `npm run voice` alongside `npm run dev`. Everything runs
on your machine (local LiveKit server in dev mode); only STT/TTS/LLM API calls
leave it. Without these keys, the run console works fine — just without voice.
```

- [ ] **Step 3: Corriger les mentions obsolètes** — chercher dans le README les phrases décrivant la voix Web Speech / « needs Chrome or Edge » et les reformuler ou supprimer :

```bash
grep -n "Web Speech\|Chrome or Edge\|voice" README.md
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(voice): setup du copilote vocal LiveKit dans le README"
```

---

### Task 8: QA manuelle guidée (avec Clément)

Prérequis (actions Clément, à demander AVANT de commencer) : `brew install livekit` ; vraies clés `DEEPGRAM_API_KEY` + `CARTESIA_API_KEY` dans `.env.local` (tiers gratuits, ~2 min chacun) ; `ANTHROPIC_API_KEY` déjà présente.

- [ ] **Step 1: Démarrer** — Terminal 1 : `npm run dev`. Terminal 2 : `npm run voice`. Attendu : logs `livekit-server` + `registered worker` côté agent.
- [ ] **Step 2: Ouvrir un run** — `http://localhost:3000/bench/protocols` → activer un protocole → console de run. Cliquer **Start conversation**, autoriser le micro. Attendu : « Copilote prêt. » à voix haute, statut `listening…`.
- [ ] **Step 3: Critère 1 (latence)** — demander « on en est où ? ». Attendu : réponse vocale naturelle en ~1-1,5 s.
- [ ] **Step 4: Critère 2 (barge-in)** — poser une question longue, puis LUI COUPER LA PAROLE en parlant pendant qu'il répond. Attendu : il se tait immédiatement et traite la nouvelle phrase.
- [ ] **Step 5: Critère 3 (outils)** — enchaîner : « passe à l'étape suivante » (l'étape avance à l'écran sans recharger), « lance un timer de 2 minutes » (compte à rebours visible), « prends une photo » (onglet Photo + webcam + cliché dans les preuves), « note que le gel a bien pris » (note visible dans les observations).
- [ ] **Step 6: Critère 4 (mémoire)** — dire « note ce que je viens de te dire il y a deux phrases » ou toute référence au contexte précédent. Attendu : il s'en souvient.
- [ ] **Step 7: Erreurs** — couper `npm run voice` puis cliquer Start conversation. Attendu : message « L'agent vocal n'a pas rejoint. Lance `npm run voice`… » sous ~8 s, pas de blocage.
- [ ] **Step 8: Qualité de voix** — si l'accent français de la voix Cartesia par défaut déçoit : choisir une voix française sur play.cartesia.ai, renseigner `CARTESIA_VOICE_ID`, relancer `npm run voice`. (Plan B spec : basculer le plugin TTS sur ElevenLabs.)
- [ ] **Step 9: Consigner** — noter les réglages retenus (voix, seuils) en commentaire dans `voice-agent/agent.ts` si modifiés, commit final.

---

## Self-review (faite à l'écriture du plan)

- **Couverture spec** : architecture 3 process (T1+T4), cerveau importé + mémoire conversationnelle (T2+T4), UI panneau + transcripts + data channel (T5+T6), suppressions (T6), env/setup (T1+T7), erreurs (T3 gardes, T4 fail-fast, T5 timeouts/messages), tests (T2+T3), critères de succès (T8). Écart assumé vs spec : plugin Anthropic natif au lieu de la couche compat OpenAI (amendement en tête de plan) ; annonce vocale de fin de timer abandonnée (notée T6) ; turn detection VAD local plutôt que sémantique cloud (contrainte globale).
- **Placeholders** : aucun TBD ; les « notes d'implémentation » pointent des vérifications de typage précises (fichiers .d.ts nommés), pas du travail non spécifié.
- **Cohérence de types** : `ClientEvent` défini dans `voice-agent/tools.ts` (T2), miroir assumé dans `useVoiceRoom.ts` (T5, justifié : pas d'import croisé client/serveur) ; `ToolDeps`, `buildExecute`, `buildAgentTools`, RPC `bench.client_event`, room `bench-run-<runId>` identiques entre T2/T3/T4/T5/T6.
