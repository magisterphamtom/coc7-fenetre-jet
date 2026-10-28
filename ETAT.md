# État — coc7-fenetre-jet

## v2.0.0 — nouvelle présentation
- `scripts/main.js` : au rendu de la fenêtre `bonus-selection`, construit la nouvelle interface (tuiles, crans, chances) ; les champs CoC7 (difficulty, poolModifier, cardType, threshold, modificateurs) restent dans le formulaire, cachés ou déplacés, et sont tenus à jour.
- Valeur du jet : demande de `CoC7RollDialog.create` (enveloppée au premier passage dans `DialogV2.prompt`) ou dernier clic sur une fiche (.attribute, .skill, .item, comme CoC7). Sans valeur (macro, HUD) : pas de chances affichées.
- Thèmes : variables `--c7cc-*` ; police du corps de carte (machine à écrire) écartée volontairement.
- coc7-cartes-chat passe de « requis » à « recommandé ». Réglage client `actif`.
- Testé en Chromium (gabarit bonus.hbs de CoC7 8.16 et CSS réels, 5 thèmes + sans thème) ; à tester dans Foundry.

## Fait (v1.0.0)
- CSS seul : habille `.application.coc7.dialog.bonus-selection` (fenêtre de jet CoC7 8.16) avec les variables `--c7cc-*` posées sur `<body>` par coc7-cartes-chat, sans aucune donnée propre.
- Réglages propres à chaque thème (`--c7fj-*`) : fond plein des listes, couleurs bonus/malus, arrondi, majuscules.
- Test Chromium avec le vrai CSS de Foundry 14.368, CoC7 8.16 et coc7-cartes-chat, sur les 5 thèmes.

## À tester par Stéphane
- Faire un jet dans chaque thème (bascule d'époque 1933 ↔ 2025-2026) : lisibilité, liste déroulante de difficulté, curseur bonus/malus.
- Voir si d'autres fenêtres CoC7 (dépense de Chance, perte de SAN…) doivent aussi être habillées.

## Idées
- Habiller aussi la fenêtre de dépense de Chance et celle de perte de SAN.
- Lier au thème de la fiche si les fiches thématiques suivent un jour un thème propre.
