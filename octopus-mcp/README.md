# octopus-mcp

Serveur MCP (stdio) qui expose Octopus à Claude Code / Claude Desktop. Il lit la
même base `octopus.db` que l'app — Claude peut donc interroger la mémoire du labo,
lister les protocoles et lire les rapports, **sans que l'app tourne**.

## Outils

- `query_lab_memory(query, k?, ws?)` — recherche sémantique dans la mémoire (runs, protocoles, observations, rapports).
- `get_run_report(runId)` — rapport auditable d'un run (prévu / fait / observé / interprété, déviations).
- `list_protocols(ws?)` — protocoles du lab (dernière version).

## Build

```bash
cd octopus-mcp
npm install
npm run build
```

## Brancher à Claude Code

Depuis la racine du repo (le fichier `.mcp.json` y est déjà) :

```bash
claude mcp add octopus -- node octopus-mcp/build/index.js
# ou laisse Claude Code découvrir .mcp.json automatiquement
```

Puis, dans Claude Code : *« cherche dans la mémoire du labo les runs où l'hybridation a dévié »* → Claude appelle `query_lab_memory` tout seul.

## Note

L'embedder (hashing bag-of-words, dim 256) est dupliqué depuis
`lib/live-experiment/core/embed.ts` pour garder ce paquet autonome. Garder les deux en
phase (même dimension, même hachage) pour que les vecteurs stockés par l'app restent
comparables.

**Vérifié (Task 8) :** ce paquet n'importe rien de `lib/core`/`features/` (l'ancien
cœur, supprimé) — il parle SQL directement à `octopus.db` (schéma `page`/`embedding`,
inchangé par la resynchronisation du cœur) et duplique volontairement son propre
embedder. Aucune mise à jour de code nécessaire, seuls les commentaires ci-dessus et
dans `src/index.ts` référençaient encore l'ancien chemin `lib/core/embed.ts`.
