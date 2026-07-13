# Chat Octopus — mise en page, citations numérotées, historique

**Date :** 2026-07-13
**Statut :** validé (design)

## Objectif

Rendre les réponses du chat « Ask Octopus » lisibles et sourcées proprement, et
ajouter un historique de conversations. Trois chantiers :

1. **Mise en page** — rendre le markdown (titres, gras, listes) au lieu du texte brut.
2. **Citations numérotées** — remplacer les tags `[type:id]` bruts du texte par des
   petits chiffres en exposant ¹²³ liés à une liste « Sources » en bas, avec
   surlignage réciproque au survol.
3. **Historique** — sidebar interne à la fenêtre de chat, conversations multiples
   persistées dans le navigateur.

## État actuel (ce qu'on modifie)

- `app/chat/ChatClient.tsx` — chat monté dans une **fenêtre** du bureau
  (`WindowContent` → `case "chat"`). Historique en mémoire, **une seule**
  conversation, perdue au refresh. Contenu affiché en `whitespace-pre-wrap`
  (**pas de rendu markdown**). Sources affichées en chips (`SourceChip`) sous
  chaque message, séparées des tags cités dans le texte.
- `app/api/chat/route.ts` — le system prompt **force** le modèle à citer chaque
  affirmation avec un tag `[type:id]` (d'où la pollution du texte). Envoie les hits
  RAG via un évènement NDJSON `sources`, puis streame le texte en `text_chunk`.
- Aucun moteur de rendu markdown installé. Classes CSS utiles déjà présentes dans
  `app/globals.css` : `.pill`, `.chip`, `.card`, `.accent`.
- `meta` des sources ne contient **pas** de titre lisible (`{runId}`, `{version}`,
  `{kind}`…) — un libellé sera dérivé côté serveur.

## Décisions

- **Rendu markdown maison** (≈100 lignes, testé) plutôt qu'une librairie : le
  traitement des citations est de toute façon sur-mesure, le markdown produit par
  Claude est simple et régulier, et on garde la maîtrise de l'insertion des chiffres
  au milieu du texte. Zéro nouvelle dépendance.
- **Numérotation par ordre d'apparition, dédupliquée** : une même source citée
  plusieurs fois garde le même numéro.
- **Libellés lisibles** dérivés côté serveur quand possible, sinon repli `Type · idcourt`.
- **Persistance `localStorage`** : les discussions survivent au rafraîchissement.
- **Sidebar interne** à la fenêtre de chat (pas de refonte plein écran) : respecte le
  paradigme « bureau à fenêtres » de l'app.

## Architecture (unités isolées et testables)

Découpage en petits modules à responsabilité unique — `ChatClient.tsx` fait déjà 241
lignes, on l'éclate plutôt que de le gonfler.

| Fichier | Rôle | Dépend de |
|---|---|---|
| `app/chat/citations.ts` | **Pur.** Parse un texte, extrait les tags de citation, les numérote (dédup, ordre d'apparition), renvoie les segments de texte entrecoupés de marqueurs de citation + la liste ordonnée des sources. | — |
| `app/chat/markdown.tsx` | **Pur.** Transforme le texte (déjà découpé en segments par `citations.ts`) en JSX : titres, gras/italique, listes, paragraphes, avec les `CitationMarker` insérés inline. | `citations.ts`, React |
| `app/chat/useConversations.ts` | Hook : liste de conversations persistée dans `localStorage`, conversation active, création/sélection/suppression/mise à jour. | React |
| `app/chat/ConversationSidebar.tsx` | Colonne gauche : « + Nouvelle discussion », liste cliquable, suppression, repli. | `useConversations` |
| `app/chat/AnswerBody.tsx` | Rend une réponse assistant : corps markdown + citations + liste « Sources » ; porte l'état `activeCitation` partagé entre le corps et la liste (surlignage réciproque au survol). Contient les sous-composants `CitationMarker` (le chiffre inline) et `SourceList` (la liste en bas) — pas de fichiers séparés. | `markdown.tsx`, `citations.ts` |
| `app/chat/ChatClient.tsx` | Assemble sidebar + conversation active, gère le streaming réseau (logique NDJSON inchangée). | tout ce qui précède |
| `app/api/chat/route.ts` | Ajout d'un champ `label` (titre lisible dérivé du `text` du hit) à chaque source envoyée. | — |

### `citations.ts` — contrat

- Reconnaît les tags `[type:id]` avec `type ∈ {protocol, run, report, evidence}`, et
  la forme courte `(ev_xxx)` / `[ev_xxx]` pour les preuves.
- Sortie : `{ segments: (string | { citation: number })[], sources: CitationRef[] }`
  où `CitationRef = { n, sourceType, sourceId }`.
- Le numéro `n` est attribué à la **première** apparition d'une paire `type:id` unique.
- Le texte hors tags est renvoyé tel quel (le rendu markdown vient après).

### `markdown.tsx` — périmètre volontairement borné

Gère ce que produit réellement le modèle : titres (`#`/`##`/`###`), lignes de section
en gras (`**Titre :**`), listes à puces (`-`/`*`), gras `**…**`, italique `*…*`/`_…_`,
paragraphes (séparés par une ligne vide), retours à la ligne simples. Pas de tables ni
de blocs de code (le modèle n'en produit pas dans ce contexte) — YAGNI.

### Enrichissement serveur du libellé

Dans `route.ts`, au moment d'émettre l'évènement `sources`, ajouter
`label` = première ligne significative du `hit.text`, nettoyée des marques markdown et
tronquée (~60 caractères). Donne un titre lisible pour les sources effectivement
récupérées (rapports, protocoles). Côté client, une citation dont l'id n'est pas dans
les sources récupérées reçoit le repli `Type · idcourt`.

## Flux de données

1. Saisie utilisateur → `send()` → `POST /api/chat` avec l'historique de la
   conversation **active**.
2. Stream NDJSON : `sources` (désormais avec `label`) stocké sur le message assistant ;
   `text_chunk` accumulé dans `content`.
3. À chaque rendu du message assistant : `content` (markdown + tags bruts) →
   `parseCitations()` → segments + sources numérotées → `renderMarkdown()` → JSX avec
   `CitationMarker` inline + `SourceList` en bas.
4. Après chaque changement, `useConversations` persiste la conversation dans
   `localStorage`.

## Interactions (bloc citations)

- **Survol** d'un chiffre → `activeCitation = n` → la source `n` en bas se surligne.
- **Survol** d'une source en bas → `activeCitation = n` → tous les chiffres `n` du texte
  se surlignent.
- **Clic** sur un chiffre ou une source → ouvre la fenêtre correspondante via la
  logique existante `sourceWindow()` (run/report/protocole). Si l'id cité n'a pas de
  hit (donc pas de `runId` pour un rapport), la source reste affichée mais non-cliquable.

## Cas limites / gestion d'erreurs

- **Streaming partiel** : un tag `[run:` non encore fermé pendant le stream n'est pas
  reconnu → affiché brut temporairement, remplacé par son chiffre dès l'arrivée du `]`.
  Le parse tourne à chaque frame ; ne jamais planter sur un tag incomplet.
- **Citation hors sources** : libellé de repli, cliquable seulement si le type le permet.
- **`localStorage` indisponible / SSR** : garde `typeof window`, repli mémoire.
- **Suppression de la conversation active** : sélectionner la précédente, ou en créer
  une vierge s'il n'en reste aucune.
- **Markdown malformé** (`**` non fermé) : rendu gracieux, pas d'exception.

## Tests

- `app/chat/citations.test.ts` — extraction `[type:id]` et `(ev_x)` ; dédup +
  numérotation ; ordre d'apparition ; id répété = même numéro ; texte sans citation ;
  tag incomplet (stream) ; segments corrects.
- `app/chat/markdown.test.ts` — titres, gras, italique, listes, paragraphes, gras non
  fermé, entrée vide, insertion des marqueurs de citation.
- `useConversations` — logique pure testable si extraite (titre auto tronqué,
  sélection après suppression). Sinon vérification manuelle.

## Hors périmètre (YAGNI)

- Pas de persistance serveur des conversations (navigateur seulement).
- Pas de tables/code dans le rendu markdown.
- Pas de recherche/renommage des conversations (titre auto suffit pour la démo).
- Pas de changement au moteur RAG/KG ni au system prompt (on garde les tags `[type:id]`,
  on les transforme à l'affichage).
