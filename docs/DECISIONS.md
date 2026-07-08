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

## Invariants de rigueur (vérifiés par le code, pas sur parole du modèle)

- **Un chiffre n'existe que s'il vient de `calc.ts`** (ou d'une `Evidence` mesurée).
  Le rapport distingue valeur brute / calculée (avec provenance) / interprétation.
- **`Quantity { value, unit }`** partout : jamais un nombre nu.
- **Version figée au `startRun`** (`protocolVersion`, `scalingContext`) → reproductibilité :
  même volume + même version = même master mix, à la goutte près.
- **Flags fail-closed** : seule la valeur `'true'` active ; garde en première ligne des
  fonctions serveur (l'UI ne fait que cacher).
