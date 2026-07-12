---
name: rt-qpcr-protocol
description: Génère et valide des protocoles RT-qPCR (SYBR Green) — composition du master mix par réaction, mise à l'échelle du nombre de réactions avec excès de pipetage, programme de cyclage, interprétation des Ct, contrôles MIQE. À utiliser quand l'utilisateur planifie une qPCR, RT-qPCR ou une expérience d'expression génique, ou demande de calculer/adapter un master mix qPCR.
metadata:
  author: octopus
  version: "1.0"
---

# Protocole RT-qPCR (SYBR Green, two-step)

Two-step = transcription inverse (RT) séparée, puis qPCR sur le cDNA. Un pool de cDNA sert plusieurs cibles.

## Master mix qPCR — PAR RÉACTION (20 µL)

| Composant | Volume/réaction | Conc. finale |
|---|---|---|
| Master mix 2× SYBR Green | 10 µL | 1× |
| Amorce F (10 µM) | 0,5 µL | 250 nM |
| Amorce R (10 µM) | 0,5 µL | 250 nM |
| Eau nuclease-free | 7 µL | — |
| **Sous-total mix partagé** | **18 µL** | — |
| Template cDNA (ajouté par puits) | 2 µL | — |

## Mise à l'échelle (déterministe)

`volume/composant = volume_unitaire × n_réactions × (1 + excès%)`, appliqué **aux composants partagés uniquement**. Le template est ajouté puits par puits, **sans excès**. Excès standard : **+10 %** (+15–20 % si beaucoup de puits ou pipetage manuel).

Exemple 24 réactions, +10 % (facteur 26,4) : master mix 2× = **264 µL**, amorces = **13,2 µL** chacune, eau = **184,8 µL**, **total mix partagé = 475,2 µL** (réserve morte 43,2 µL). Ne calcule jamais ces volumes « de tête » : pose la formule ci-dessus.

## Cyclage (amorces Tm ≥ 60 °C)

50 °C 2 min (UDG) → 95 °C 2 min (hot-start) → **40 × [95 °C 15 s, 60 °C 60 s]** → melt curve (95 °C 15 s → 60 °C 60 s → rampe 60→95 °C). Durée ≈ 1 h 15–1 h 45.

## Interprétation des Ct (Cq, MIQE)

Ct ∝ −log(quantité initiale). +3,32 cycles = ÷10. Plage exploitable ~15–35 ; Ct bas = cible abondante. **NTC** obligatoire (eau) : attendu « Undetermined » ou ≥ 38–40, ≥ 5 Ct après l'échantillon le plus tardif. Melt curve : pic unique = amplicon spécifique ; pics multiples = non-spécifique / primer-dimers. Qualité : efficacité 90–110 %, R² > 0,98, réplicats dans ~0,5 Ct.

## Déviations fréquentes

- **Hybridation trop basse (55 vs 60 °C)** → **critique** en SYBR : amorçage non-spécifique / primer-dimers (visibles en melt curve).
- **Élongation prolongée (90 vs 60 s)** → non critique pour amplicons courts.
- **NTC oublié** → critique pour la validité : contamination / primer-dimers non exclus (non publiable, MIQE).
- **Dégels répétés des amorces** → non critique ; ceux du master mix SYBR / du cDNA → dommageables.

Voir `references/MIQE.md` pour les standards de reporting et `assets/plate-96.csv` pour un gabarit de plaque.
