# Script de démo — 3 minutes

Objectif : montrer un run RT-qPCR entier, lancé et documenté à la voix, sans jamais
remplir un ELN à la main. Enregistre l'écran dans **Chrome** (voix = Web Speech API).
Assure-toi que `ANTHROPIC_API_KEY` est dans `.env.local` pour les moments LLM.

## Prépa (avant d'enregistrer)
```bash
npm run dev            # http://localhost:3000
```
Ouvre `/protocol`.

## 0:00 — L'accroche (15 s)
Page d'accueil `/`. « Octopus : le scientifique augmenté à plusieurs bras. Du protocole
au rapport auditable, à la voix. » Montre la grille des 8 modules.

## 0:15 — Wahou #1 : le calcul déterministe (35 s)
Sur `/protocol`, le master mix est affiché pour 6 réactions. **Clique 24.**
→ Le tableau se recalcule instantanément : master mix 2× = **264 µL**, eau = **184,8 µL**,
**total mix partagé = 475,2 µL**.
Dis à la caméra : « Ce chiffre ne vient pas du modèle. Il vient de code déterministe et
testé — en labo, une erreur de volume est rédhibitoire. » (Optionnel : tape « adapte pour
24 échantillons » dans le champ *Adapter* → Claude régénère le protocole.)
**Clique « Lancer un run → ».**

## 0:50 — Wahou #2 : le bench à la voix (70 s)
Sur `/run/[id]`, l'étape courante et le master mix calculé s'affichent.
**Maintiens « Parler »** et enchaîne (relâche entre chaque) :
- « Étape suivante. » → Octopus avance, l'écran se met à jour.
- « Démarre un minuteur d'hybridation de 60 secondes. » → un minuteur apparaît et décompte.
- « Note : NTC inclus, SYBR protégé de la lumière. » → la preuve apparaît.
- **Le moment clé :** « J'ai hybridé à 55 degrés au lieu de 60, c'est grave ? »
  → Octopus répond (voix) : oui, **critique en SYBR** (amorçage non-spécifique / primer-dimers,
  visible en melt curve) et enregistre la déviation. Contraste : « Et si j'avais juste
  allongé l'élongation à 90 secondes ? » → non critique.

## 2:00 — Le rapport auditable (35 s)
**Clique « Terminer & rapport ».** Sur `/report/[id]`, montre les blocs **Prévu /
Réellement fait / Observé / Interprété** : les chiffres (475,2 µL, Ct), la déviation
critique en rouge, et l'annexe **citations** (chaque observation pointe une preuve).
« Rien n'est affirmé sans source. »

## 2:35 — La mémoire + Claude Use (25 s)
Sur `/memory`, clique le chip **« runs où l'hybridation a dévié »** → réponses sourcées
(dont le run qu'on vient de faire).
**Bonus MCP :** dans Claude Code, `claude mcp add octopus -- node octopus-mcp/build/index.js`,
puis « cherche dans la mémoire du labo les runs où l'hybridation a dévié » → Claude appelle
Octopus tout seul. « Claude utilise notre produit. »

## Clôture (10 s)
« Huit bras, un cerveau. Débrayable, sourcé, réutilisable dans Sylvy. Octopus. »

---
### Filet de sécurité
Un run complet pré-rempli en un clic si la voix flanche pendant l'enregistrement :
```bash
curl -X POST localhost:3000/api/demo/run   # renvoie runUrl + reportUrl
```
