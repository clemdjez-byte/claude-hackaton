# 🐙 Octopus — wet lab operating system

**Le scientifique augmenté à plusieurs bras.** Octopus transforme une intention ou un
protocole en workflow exécutable, guide la manip **à la voix**, capture chaque preuve,
puis génère un **rapport auditable** qui alimente la **mémoire du labo**.

> « Je lance et documente une expérience entière sans jamais remplir un ELN à la main. »

Construit pour le hackathon **Built with Claude: Life Sciences** (Builder Track). Neuf,
open source (MIT), et pensé pour se brancher dans [Sylvy](https://) en drop-in — mêmes
coutures (couche `db` injectée, flags débrayables, couche LLM unique).

---

## Les 8 bras

| Brique | Rôle |
|---|---|
| **Protocol Studio** | créer / adapter (Claude) / **versionner** / publier des protocoles sourcés |
| **Workflow Builder** | composer des protocoles en template exécutable (versions épinglées) |
| **Live Bench Mode** | lancer un `Run`, **figer** le scaling déterministe, piloter étape par étape |
| **Voice Copilot** | mains-libres : Claude agit via des outils (avance, minuteur, note, mesure, déviation, mémoire) |
| **Evidence Capture** | notes / photos / mesures / déviations attachées à une étape, horodatées et sourcées |
| **Auto Report** | rapport **prévu / réellement fait / observé / interprété**, chaque observation citée |
| **Lab Memory** | mémoire sémantique interrogeable (embeddings) |
| **Knowledge Graph** | relations typées navigables (run ↔ protocole ↔ réactif ↔ preuve) |

## Ce qui rend Octopus fiable (et « Sylvy-compatible »)

- **Rigueur de labo par le code.** Tout calcul (mise à l'échelle d'un master mix,
  dilution, conversion d'unités) passe par `lib/core/calc.ts` — **fonctions pures,
  déterministes, testées**. Le LLM ne calcule jamais « de tête » : il lit les valeurs
  déjà calculées et les explique. `264 / 13,2 / 13,2 / 184,8 → 475,2 µL`, au µL près.
- **Débrayable.** Chaque brique a un flag serveur **fail-closed** (`FEATURE_*` = `true`
  strictement). Désactivée, l'app se comporte comme avant.
- **Testable et portable.** Chaque fonction serveur prend `db: Db` en premier argument.
  La démo tourne sur SQLite ; le même code se rebranche sur Postgres/pgvector via une
  autre implémentation de `Db`, sans toucher au métier.
- **Couche LLM unique** (Vercel AI SDK → Claude). Aucune brique ne parle à un SDK
  fournisseur en direct. Routage : Haiku (voix), Sonnet (protocoles), Opus (rapports).

## Démarrer

```bash
npm install
cp .env.example .env.local   # mets ta clé ANTHROPIC_API_KEY (déjà rempli en .env.local de dev)
npm run dev                  # http://localhost:3000
```

Parcours : `/protocol` (adapter / mettre à l'échelle → **Lancer un run**) → `/run/[id]`
(voix + minuteurs + preuves) → **Terminer & rapport** → `/report/[id]` → `/memory`.

Un run complet en un clic (utile pour la démo) : `POST /api/demo/run`.

Sans clé LLM, tout le socle déterministe fonctionne (scaling, run, rapport factuel,
mémoire) ; la clé débloque l'adaptation de protocole, le copilote vocal et la prose
d'interprétation du rapport.

## Tests

```bash
npm test        # 64 tests (calcul déterministe, flags fail-closed, les 8 briques)
```

## Serveur MCP + Agent Skill (Claude Use)

- **`octopus-mcp/`** — serveur MCP (stdio) qui expose la mémoire, les protocoles et les
  rapports à Claude Code / Claude Desktop. Claude interroge le vrai Octopus.
  ```bash
  cd octopus-mcp && npm install && npm run build
  claude mcp add octopus -- node octopus-mcp/build/index.js   # ou via .mcp.json
  ```
- **`skills/rt-qpcr-protocol/`** — Agent Skill (le savoir RT-qPCR : master mix, scaling,
  cyclage, Ct, MIQE, déviations).

## Architecture

```
lib/core/         # socle sans métier : db (seam), types, flags, llm, calc, embed
features/<brique>/ # 8 briques plates, communiquant par leur index.ts
app/              # Next.js App Router : pages + server actions + /api/voice
octopus-mcp/      # serveur MCP autonome (stdio)
skills/           # Agent Skill
```

Stack : Next.js 16 · React 19 · TypeScript · Tailwind 4 · Vercel AI SDK 7 (@ai-sdk/anthropic) · Zod 4 · Vitest · SQLite (better-sqlite3).

Voir [`docs/DECISIONS.md`](docs/DECISIONS.md) pour le journal des décisions (le « pourquoi »).
