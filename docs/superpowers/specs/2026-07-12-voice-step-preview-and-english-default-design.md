# Spec — Copilote vocal : prévisualisation d'étape + anglais par défaut

Date : 2026-07-12 · Statut : approuvé (Clément)

## Problème

En l'utilisant, l'opérateur a demandé « qu'y a-t-il à l'étape 3 ? » par simple
curiosité. Le copilote n'a que trois verbes de navigation (`next_step`,
`skip_step`, `step_back`) et, dans son prompt, ne dispose de **l'instruction
complète que de l'étape COURANTE** (les autres étapes ne sont listées qu'en
titre + statut). Pour « lire » l'étape 3 il a donc **avancé** dessus, ce qui a
**marqué comme faites** des étapes non réalisées → corruption de la traçabilité
du cahier de labo (invariant de rigueur d'Octopus).

Deuxième demande, indépendante : la **langue par défaut** du copilote doit être
l'**anglais** (le tout premier message toujours en anglais), tout en restant
capable de répondre dans la langue de l'opérateur.

## Objectifs

1. Le copilote peut **décrire n'importe quelle étape** (passée / courante /
   future) **sans modifier l'état du run**.
2. Il **ne valide plus** d'étapes à tort pour « montrer » une étape.
3. Langue **par défaut anglaise**, **adaptative** à la langue de l'opérateur ;
   message d'accueil **toujours en anglais** (« Copilot ready. »).

Hors périmètre : « sauter directement à l'étape N » (n'adresse pas la curiosité
et repose le problème « les étapes intermédiaires ont-elles été faites ? »).

## Conception

### A. Prompt enrichi — `buildSystemPrompt` (`lib/bench/voice-copilot/index.ts`)

- La section « TOUTES LES ÉTAPES » liste, pour **chaque** étape :
  `index. titre (statut) [CRITIQUE?] — instruction complète`.
  La donnée existe déjà : `ctx.protocol.steps[].instruction`.
- Ajouter une **règle de rigueur** explicite :
  > « Tu peux décrire n'importe quelle étape (passée, courante, future) à partir
  > de la liste ci-dessous **sans avancer**. N'utilise `next_step` / `skip_step`
  > **que** lorsque l'opérateur a réellement fait (ou veut sauter) l'étape
  > courante — **jamais** pour simplement montrer/consulter une étape. »

### B. Outil lecture seule — `read_step` (`lib/bench/voice-copilot/tools.ts`)

- Signature : `read_step({ index: number })`.
- Comportement : `getRunContext` → trouve l'étape de protocole `p.index === index`
  (titre / instruction / critical) et l'étape de run correspondante
  (`s.protocolStepIndex === index`) pour le statut. Retour :
  `{ index, title, instruction, status, critical }`.
  Si l'index n'existe pas : `{ found: false, index }`.
- **Aucune mutation.** N'est donc PAS ajouté à `MUTATING_TOOLS`
  (`voice-agent/tools.ts`) → ne déclenche pas `onMutation` (pas de resynchro,
  pas de validation). Partagé automatiquement par le chemin web
  (`handleVoiceCommand`/`streamVoiceCommand`) et l'agent LiveKit.
- Le prompt mentionne `read_step` comme moyen privilégié de « consulter » une
  étape.

### C. Anglais par défaut, adaptatif

- `buildSystemPrompt(ctx, lang: VoiceLang = "en")` — défaut passe de `"fr"` à `"en"`.
- La consigne de langue (`voiceLine`) devient **adaptative** :
  > « Speak English by default. If the operator speaks another language (e.g.
  > French), reply in that same language. » (idem en tête FR conservée si besoin)
- Accueil : `voice-agent/agent.ts` → `session.say("Copilote prêt.")` devient
  `session.say("Copilot ready.")`.
- TTS ElevenLabs (`voice-agent/agent.ts`) : ne plus forcer `language: "fr"` afin
  que la synthèse **suive la langue du texte** généré (vérifié en direct sur le
  stack qui tourne). STT Deepgram déjà `language: "multi"` — inchangé.

## Tests (TDD, Vitest)

- `buildSystemPrompt` :
  - contient l'**instruction complète** de chaque étape (pas que le titre) ;
  - contient la règle « décrire sans avancer / ne valider que si réellement fait » ;
  - défaut anglais + consigne adaptative présentes.
- `read_step` (via `buildVoiceTools`) :
  - renvoie `{ index, title, instruction, status, critical }` corrects pour une
    étape passée / courante / future ;
  - **ne modifie pas** l'état du run : les statuts des steps sont identiques
    avant/après l'appel (assert sur `listSteps`) ;
  - index inexistant → `{ found: false }`.
- Greeting : la chaîne d'accueil de l'agent est en anglais (« Copilot ready. »).

## Fichiers touchés

- `lib/bench/voice-copilot/index.ts` (prompt : A + C)
- `lib/bench/voice-copilot/tools.ts` (outil `read_step` : B)
- `voice-agent/agent.ts` (greeting + TTS : C)
- tests : `lib/bench/voice-copilot/index.test.ts` (+ éventuellement un test dédié)

Zéro nouvelle dépendance. Vérifs de fin : `npm test`, `npx tsc --noEmit`,
`npm run lint` verts, puis test vocal en direct (anglais + `read_step`).
