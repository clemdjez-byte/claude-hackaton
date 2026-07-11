# Journal des décisions — Octopus

Le « pourquoi » de chaque choix (exigence Sylvy : documentation continue).

## Cadrage (hackathon)

- **Repo neuf, open source.** Le règlement impose « new work only ». On ne soumet pas le
  code de Sylvy ; Octopus est construit de zéro avec les *coutures* de Sylvy pour rester
  réutilisable en drop-in.
- **8 briques, une par une, solides et réutilisables** (choix produit), pas une tranche
  fine. Chaque brique est testée isolément et démo-able seule.
- **Expérience de démo : RT-qPCR.** Universellement reconnue, et le « adapte pour 24
  échantillons » met en scène le recalcul déterministe du master mix (moment héros).

## Décisions techniques

- **SQLite (`better-sqlite3`) plutôt que Supabase/Docker pour la démo.** La couture
  `db: Db` rend la persistance swappable ; SQLite = zéro installation, fiable le jour J.
  Le passage à Postgres/pgvector pour Sylvy = une autre implémentation de `Db`, sans
  toucher au métier. (Dévie du plan « Supabase CLI » au profit de la fiabilité, dans
  l'esprit « léger d'abord, portable ».)
- **Voix = Web Speech API navigateur** (STT + TTS) + Claude comme cerveau. Natif, gratuit,
  fiable en démo Chrome. Push-to-talk par défaut (moins de casse). Upgrade TTS tierce
  possible derrière la même interface `speak()`.
- **Route vocale en JSON, pas en flux.** `/api/voice` renvoie `{ reply, timers, didAct }`
  plutôt qu'un UI-message-stream : moins de parsing côté client, plus robuste pour une
  démo de 3 min. `start_timer` a un `execute` no-op côté serveur ; sa charge est renvoyée
  au client qui lance le vrai décompte navigateur.
- **Claude en agent outillé** (Vercel AI SDK `tool` + `stopWhen: stepCountIs`). Outils :
  next_step, start_timer, add_note, record_measurement, flag_deviation, query_memory.
  L'état du run est **reconstruit dans le system prompt à chaque tour** (le plus simple).
- **Embedder local déterministe** (hashing bag-of-words, dim 256) dans `lib/core/embed.ts`
  — pas de dépendance/API d'embeddings pour la démo. Swappable vers Voyage/OpenAI plus
  tard. Dupliqué (documenté) dans `octopus-mcp` pour garder ce paquet autonome.
- **Modèles** : Haiku 4.5 (voix, latence), Sonnet 5 (protocoles), Opus 4.8 (rapports).
  Routage dans `lib/core/llm.ts`, jamais dans les briques.

## Resynchronisation du cœur + chat RAG (post-hackathon initial)

- **Le cœur a été resynchronisé, verbatim, depuis `lib/live-experiment` de Sylvy** —
  remplace l'ancien cœur maison `lib/core/` + `features/<brique>/` du build initial du
  hackathon. Décision : partir du code de production réel de Sylvy (mêmes tests, mêmes
  invariants de rigueur labo) plutôt que de faire diverger deux implémentations du même
  concept. `lib/live-experiment/` reste STRICTEMENT identique à Sylvy (vérifiable par
  `diff -r`), à l'exclusion de 3 fichiers de couture non copiés (`adapters.sylvy.ts`,
  `bridge.sylvy.ts`, `sylvy-session.ts`) — ce standalone n'a que sa propre couture,
  `lib/session.ts` + `lib/live-experiment/adapters.standalone.ts` (SQLite).
- **Toute l'app hôte a été réécrite en conséquence** : `app/bench/**` (bibliothèque de
  protocoles en éditeur-document Tiptap, console de run plein écran, rapport), routes
  API (photos, import de documents, voix NDJSON), `lib/rag.ts` (indexation best-effort
  de chaque entité dans la mémoire du labo après une action réussie).
- **Chat « Ask your lab » (RAG)** : nouvelle brique hôte (`app/api/chat`, `app/chat/`)
  qui interroge `lib/live-experiment/features/lab-memory` (`search`) puis laisse Claude
  répondre en streaming NDJSON, avec citation obligatoire `[type:id]` pour chaque
  affirmation — jamais de fait hors du contexte retrouvé. Nécessite `ANTHROPIC_API_KEY`
  (pas de repli hors-ligne pour le chat, contrairement au rapport).
- **97 tests verts** sur `lib/live-experiment/` après la resynchronisation (cœur non
  modifié depuis).

## Invariants de rigueur (vérifiés par le code, pas sur parole du modèle)

- **Un chiffre n'existe que s'il vient de `calc.ts`** (ou d'une `Evidence` mesurée).
  Le rapport distingue valeur brute / calculée (avec provenance) / interprétation.
- **`Quantity { value, unit }`** partout : jamais un nombre nu.
- **Version figée au `startRun`** (`protocolVersion`, `scalingContext`) → reproductibilité :
  même volume + même version = même master mix, à la goutte près.
- **Flags fail-closed** : seule la valeur `'true'` active ; garde en première ligne des
  fonctions serveur (l'UI ne fait que cacher).
