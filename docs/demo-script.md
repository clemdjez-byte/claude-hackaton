# Script de démo — ~3 minutes

Objectif : montrer un run RT-qPCR piloté à la voix, de la fiche protocole au rapport
auditable, dans le bureau Octopus (fenêtres flottantes sur une galaxie de connaissances),
puis interroger la mémoire du labo. Enregistre dans **Chrome** (la voix utilise la Web
Speech API du navigateur). Renseigne `ANTHROPIC_API_KEY` dans `.env.local` pour les
moments Claude (adaptation de protocole, copilote vocal, interprétation du rapport,
chat) — le reste (scaling, run, rapport factuel) marche sans clé.

## Prépa (avant d'enregistrer)

```bash
npm run reset && npm run seed   # jeu de démo : 2 protocoles, 3 runs, 1 rapport
npm run dev                      # http://localhost:3000
```

`npm run seed` affiche les ids générés à la fin — garde-les sous la main comme filet de
sécurité (§ tout en bas). Ouvre `/` : c'est tout le bureau, il n'y a pas d'autre route à
visiter.

## 0:00 — L'accroche (15 s)

Bureau `/` : la galaxie (nœuds = protocoles, runs, rapports, reliés par leurs relations)
en fond, la pilule d'outils à gauche (Bench, Files, New protocol, Settings), la cartouche
« Ask your lab » en bas. « Octopus : protocole → run guidé à la voix → rapport auditable
→ interroge ton labo. Tout se passe dans des fenêtres, sur un seul bureau. »

## 0:15 — Wahou #1 : le calcul déterministe (35 s)

Clique **Bench** dans la toolbar → une fenêtre s'ouvre sur le hub des runs. Clique
**Protocols →**, ouvre le protocole **RT-qPCR — expression génique**. Dans le panneau
**Scale & activate**, le master mix est affiché pour 6 réactions. **Passe à 24.**
→ Le tableau se recalcule instantanément : master mix 2× = **264 µL**, eau =
**184,8 µL**, **total mix partagé = 475,2 µL**.
« Ce chiffre ne vient pas du modèle. Il vient de code déterministe et testé — en labo,
une erreur de volume est rédhibitoire. »
**Clique « Activate at the bench → ».** Une nouvelle fenêtre s'ouvre : la console du run.

## 0:50 — Wahou #2 : le bench à la voix (70 s)

Sur la fenêtre run, l'étape courante et le master mix calculé s'affichent. Passe la
fenêtre en **plein écran** (icône dans la barre de titre) pour plus de confort.
**Maintiens « Hold to talk »** et enchaîne (relâche entre chaque phrase) :
- « Next step. » → Octopus avance, l'écran se met à jour.
- « Start a 60 second timer for hybridization. » → un minuteur apparaît et décompte.
- « Note that the pellet looks cloudy. » → la preuve apparaît dans la timeline.
- Bascule sur l'onglet **Photo**, dis « take a photo » (ou clique) → la webcam capture
  et attache l'image à l'étape courante.
- **Le moment clé :** « I hybridized at 55 degrees instead of 60, is that a problem? »
  → Octopus répond (voix) que c'est **critique** en SYBR (hybridation non spécifique /
  primer-dimers, visible en melt curve) et enregistre la déviation.

## 2:00 — Le rapport auditable (35 s)

**Clique « Finish & report → ».** Une fenêtre rapport s'ouvre : les blocs
**Planned / Performed / Observed / Interpreted** — les chiffres calculés, la déviation
critique, et l'annexe **citations** (chaque observation pointe une preuve, `[type:id]`).
« Rien n'est affirmé sans source. » Clique **Files** dans la toolbar : le rapport (et le
protocole) qu'on vient de produire y apparaissent — réouvrables à tout moment.

## 2:35 — La galaxie et la mémoire du labo (25 s)

Regarde la galaxie en fond de bureau : de nouveaux nœuds et arêtes sont apparus (le run
relié à son protocole, le rapport relié au run). **Clique un nœud** → sa fenêtre s'ouvre.

Ouvre la cartouche **« Ask your lab »** (en bas) et pose 3 questions, montre les
citations `[type:id]` sous chaque réponse (cliquables, elles ouvrent la source) :
1. « What runs had a critical deviation? » → cite le run qu'on vient de faire (ou le run
   24-réactions du jeu de démo, avec l'hybridation à 55 °C et le Ct aberrant).
2. « What Ct values were measured on the reference protocol runs? »
3. « Summarize the Bradford protein assay protocol. » → montre que la mémoire couvre
   aussi le protocole sans master mix « qPCR ».

**Bonus MCP :** dans Claude Code, `claude mcp add octopus -- node octopus-mcp/build/index.js`,
puis « cherche dans la mémoire du labo les runs où l'hybridation a dévié » → Claude
appelle Octopus tout seul (`query_lab_memory`).

## Clôture (10 s)

« Huit briques, un cerveau, un bureau. Débrayable, sourcé, réutilisable comme module.
Octopus. »

---

### Filet de sécurité

Si la voix flanche pendant l'enregistrement, retombe sur le jeu de données pré-rempli :
`npm run seed` a déjà créé un run 24 réactions avec la déviation critique (hybridation à
55 °C), une mesure aberrante (Ct à 35,8 contre ~23 pour les autres réplicats) et un
rapport généré — depuis `/`, ouvre **Files** dans la toolbar et clique directement sur ce
rapport (ou son nœud dans la galaxie).
