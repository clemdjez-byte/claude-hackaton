# Assistant vocal temps réel (LiveKit) — Design

Date : 2026-07-11 · Statut : validé en brainstorming avec Clément, en attente de relecture du spec
Branche : `feat/voice-livekit` (créée depuis `feat/desktop-shell` @ 51491aa)

## Contexte et problème

Le « Voice copilot » de la console de run repose entièrement sur la Web Speech API du
navigateur : STT et TTS 100 % côté client, texte pur entre le navigateur et le serveur.
Défauts constatés (vérifiés dans le code) :

1. **Pas de vrai barge-in** — le micro est coupé pendant que l'assistant parle (anti-écho
   par exclusion mutuelle dans `app/bench/useVoice.ts`). Impossible de l'interrompre en
   parlant ; il faut re-cliquer « Hold to talk ».
2. **Voix TTS non déterministe et robotique** — `pickVoice()` dépend des voix installées
   sur la machine.
3. **Pas de mémoire conversationnelle** — chaque tour n'envoie que le transcript courant
   (`prompt: transcript`), aucun historique de dialogue.
4. **STT opaque** — Chrome envoie l'audio chez Google ; vocabulaire scientifique
   (µL, Ct, primer…) souvent mal transcrit ; Chrome/Edge uniquement.

La partie « cerveau » (system prompt reconstruisant l'état du run + 10 outils) est saine
et réutilisable : c'est la couche audio qu'on remplace.

## Objectif

Une vraie conversation vocale continue avec l'assistant pendant une manip : micro ouvert
en permanence, on peut lui couper la parole naturellement (barge-in), voix naturelle,
latence ~1 s, mémoire de la conversation. Démo **en local sur le Mac de Clément**.

## Non-objectifs

- Pas de voix sur le chat « Ask your lab » (`app/chat`) — console de run uniquement.
- Pas de déploiement en ligne (LiveKit Cloud non requis).
- Pas de conservation de l'ancien système Web Speech en secours : il est supprimé.

## Décisions de cadrage (validées par Clément)

- OK pour ajouter des clés API en plus d'`ANTHROPIC_API_KEY` (tiers gratuits).
- Tout tourne en local : serveur LiveKit en mode dev + agent vocal Node.
- Périmètre : console de run uniquement ; suppression de l'ancien système.

## Architecture

Trois process en local (le site + deux nouveaux lancés par **une seule commande
`npm run voice`**) :

```
Navigateur (RunConsole)                    Agent vocal (voice-agent/, Node)
  micro ──────► LiveKit Server ──────────► STT Deepgram (streaming, multilingue)
  audio ◄────── (mode dev local) ◄──────── TTS Cartesia (streaming)
  data channel ◄────────────────────────── actions client (photo, caméra, timer)
                                           LLM : Claude Haiku 4.5
                                           Outils : lib/bench/voice-copilot (10 outils)
                                           DB : même SQLite que le site (WAL)
```

- **Serveur LiveKit** : binaire `livekit-server` (installé une fois via
  `brew install livekit`), lancé en mode dev (`--dev`, clés par défaut
  `devkey`/`secret`). Transporte l'audio en WebRTC.
- **Agent vocal** : nouveau dossier `voice-agent/` dans le repo, script TypeScript lancé
  avec `tsx`, basé sur `@livekit/agents` (framework Node officiel). Pipeline
  VAD (Silero) → STT (Deepgram) → LLM (Claude Haiku) → TTS (Cartesia), avec le
  turn-detection et l'interruption gérés par le framework.
- **`npm run voice`** : lance `livekit-server --dev` + l'agent via `concurrently`
  (dépendance dev à ajouter), à côté du `npm run dev` habituel.

### Pourquoi LiveKit Agents (approches écartées)

- *Pipeline maison (WebSocket + Deepgram + TTS)* : moins de process, mais on
  réimplémente turn-taking et barge-in — la partie difficile. Écarté.
- *API speech-to-speech (OpenAI Realtime, Gemini Live)* : latence imbattable mais le
  cerveau ne serait plus Claude, et il faudrait re-brancher les 10 outils. Écarté.
- *Pipecat* : excellent turn-taking mais serveur Python dans un repo TypeScript, et
  impossible d'importer les outils/DB existants. Écarté.

## Composants

### 1. `voice-agent/agent.ts` — l'agent

- Session `@livekit/agents` : `vad: silero`, `stt: Deepgram` (modèle multilingue
  nova-3, détection de langue auto FR/EN), `tts: Cartesia`, `turnDetection` du
  framework (modèle multilingue).
- **LLM = Claude Haiku 4.5** (`claude-haiku-4-5-20251001`, comme aujourd'hui — choisi
  pour la latence) via le plugin OpenAI de LiveKit pointé sur la **couche de
  compatibilité OpenAI d'Anthropic** (`baseURL: https://api.anthropic.com/v1/`,
  clé `ANTHROPIC_API_KEY`). **Plan B** si les tool-calls passent mal par cette couche :
  petit adaptateur LLM maison (~100 lignes) implémentant l'interface LLM de
  `@livekit/agents` au-dessus du SDK Anthropic. Rien d'autre ne change.
- **Instructions** : `buildSystemPrompt(runContext)` importé de
  `lib/bench/voice-copilot` — même prompt qu'aujourd'hui. Rafraîchi via
  `session.updateInstructions()` après chaque outil qui modifie l'état du run
  (next_step, add_note…), pour que l'agent voie toujours l'état à jour.
- **Mémoire conversationnelle** : fournie par la session LiveKit (historique du
  dialogue conservé pendant toute la conversation) — corrige le défaut n°3.
- L'agent retrouve le run grâce au nom de la room (`bench-run-<runId>`) et charge son
  contexte avec les mêmes fonctions de `lib/bench` que la route voix actuelle (qui, elle,
  disparaît).

### 2. `voice-agent/tools.ts` — l'adaptateur d'outils

Seule pièce vraiment nouvelle avec de la logique. Traduit les 10 outils de
`buildVoiceTools(ctx)` (format Vercel AI SDK : description + schéma zod + execute)
vers le format d'outils de `@livekit/agents`. Deux familles :

- **Outils serveur** (next_step, skip_step, step_back, add_note, record_measurement,
  flag_deviation, query_memory) : `execute` inchangé, écrit dans la même SQLite
  (mode WAL, multi-process OK — le site et l'agent lisent/écrivent la même base).
- **Outils client** (capture_photo, close_camera, start_timer) : aujourd'hui no-op
  serveur rejoués par le navigateur via NDJSON ; demain l'agent envoie un événement
  sur le **data channel LiveKit** (RPC `performRpc` vers le participant navigateur),
  et la page exécute (webcam, timer) — comportement identique à aujourd'hui.

Après tout outil qui modifie l'état : notification `did_act` au navigateur (même canal)
pour déclencher `router.refresh()` comme aujourd'hui.

### 3. Route token — `app/api/bench/voice-token/route.ts`

Le navigateur a besoin d'un ticket pour entrer dans la room. Petite route POST
`{ runId }` → JWT signé avec `livekit-server-sdk` (clés dev par défaut,
surchargeables par env). Garde le même contrôle d'accès que la route voix actuelle
(session Bench + flag `voiceCopilot`).

### 4. UI — panneau Voice copilot de `RunConsole.tsx`

Remplace le panneau actuel (colonne 3) :

- Bouton **« Démarrer la conversation »** → fetch du token, connexion à la room
  (`livekit-client`), publication du micro (echo cancellation native du navigateur),
  lecture de l'audio de l'agent.
- **Indicateur d'état** : écoute / réfléchit / parle (événements d'état de l'agent).
- **Transcription en direct** des deux côtés (événements de transcription LiveKit),
  remplace l'affichage interim/reply actuel.
- Boutons **mute** et **raccrocher**. C'est tout : plus de push-to-talk, plus de mode
  ambient, plus de sélecteur FR/EN (langue auto-détectée par Deepgram).
- Écoute du data channel : capture_photo → onglet Photo + webcam ; close_camera ;
  start_timer → même compte à rebours qu'aujourd'hui ; did_act → `router.refresh()`.
- L'earcon (bip d'accusé de réception) disparaît : l'indicateur d'état et la latence
  réduite le rendent inutile.

## Supprimé

- `app/bench/useVoice.ts` (toute la Web Speech API)
- `app/bench/sentences.ts` (découpage en phrases pour le TTS client)
- `app/api/bench/voice/route.ts` (route NDJSON) — `streamVoiceCommand` /
  `handleVoiceCommand` restent dans `lib/bench/voice-copilot` (non modifiés) mais ne
  sont plus appelés par l'app ; on garde `buildSystemPrompt` et `buildVoiceTools`.
- Dans `RunConsole.tsx` : push-to-talk, mode ambient, earcon, parsing NDJSON,
  persistance `bench.voice.lang`.
- devDependency `@types/dom-speech-recognition`.

`lib/bench/voice-copilot` n'est **pas modifié** (on importe, on n'édite pas) — l'esprit
« les adaptations vivent dans le code hôte » est conservé, l'hôte étant ici
`voice-agent/` et `app/`.

## Configuration & setup

`.env` (ajouts) :

```
DEEPGRAM_API_KEY=...    # STT — tier gratuit ($200 de crédits), console.deepgram.com
CARTESIA_API_KEY=...    # TTS — tier gratuit, play.cartesia.ai
# LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET : défauts dev, pas requis en local
```

Setup une fois : `brew install livekit`. Ensuite : `npm run dev` + `npm run voice`.
README mis à jour (section Voice, liens d'inscription aux deux services).

Nouvelles dépendances npm : `@livekit/agents` + plugins (silero, deepgram, cartesia,
openai, turn-detector), `livekit-client`, `livekit-server-sdk`, `concurrently` (dev),
`tsx` (dev, si absent).

## Gestion d'erreurs

- **Serveur LiveKit éteint / agent pas lancé** : la connexion échoue ou aucun agent ne
  rejoint la room → message dans le panneau : « Lance `npm run voice` dans un
  terminal ». Timeout explicite (~5 s) sur l'attente de l'agent.
- **Clé manquante** (Deepgram/Cartesia) : l'agent refuse de démarrer avec un message
  clair en console ; le panneau affiche l'absence d'agent comme ci-dessus.
- **Micro refusé** : message explicite dans le panneau (comme aujourd'hui).
- **Deepgram/Cartesia tombe en cours de conversation** : l'agent l'annonce à voix haute
  si le TTS marche encore, sinon message écrit dans le panneau via data channel ;
  la session se ferme proprement au lieu de se figer.

## Tests

- Les tests existants (96 verts au moment du design) restent verts.
- **Nouveaux tests unitaires sur `voice-agent/tools.ts`** : le mapping des 10 outils
  (noms, schémas, routage serveur vs client), l'exécution des outils serveur contre une
  SQLite de test, l'émission des événements client. C'est la seule pièce nouvelle qui se
  teste bien sans micro.
- Le reste (barge-in, latence, qualité voix) se valide à la voix en conditions réelles,
  avec un scénario de QA manuel documenté dans le plan d'implémentation.

## Risques & plans B

| Risque | Plan B |
| --- | --- |
| Tool-calls Claude instables via la couche de compatibilité OpenAI | Adaptateur LLM maison (~100 lignes) sur le SDK Anthropic |
| Qualité du français de Cartesia décevante | Basculer le plugin TTS sur ElevenLabs (même interface, 1 ligne + clé) |
| Écriture SQLite concurrente site/agent | Mode WAL déjà actif ; les writes des outils sont courts et séquentiels |
| Une autre session agent travaille sur `feat/desktop-shell` en parallèle | Branche dédiée `feat/voice-livekit`, merge coordonné par Clément |

## Critères de succès (démo)

1. Je parle sans toucher de bouton, l'assistant répond en < ~1,5 s avec une voix naturelle.
2. Je lui coupe la parole en parlant : il se tait et prend en compte ce que je dis.
3. « Passe à l'étape suivante », « lance un timer de 2 minutes », « prends une photo »,
   « note que le gel a pris » fonctionnent comme avant (mêmes effets dans le run).
4. Il se souvient des échanges précédents de la conversation.
5. Tout tourne en local avec `npm run dev` + `npm run voice`.
