export const CSS_SETTINGS = `
/* Panneau « Réglages des outils » : ancré au bouton engrenage de la drawbar,
   une ligne par outil (aperçu live) + ligne « Raccourcis clavier ». Chaque ligne
   ouvre un SOUS-PANNEAU latéral (éditeur de style / liste des raccourcis) du côté
   opposé à la barre, aligné sur la ligne — jamais coupé par le scroll de la liste.
   Ancré en bas → grandit vers le haut (le bouton est en bas de barre). */
.m3d-settingswrap{position:relative}
.m3d-settings{width:252px;padding:10px;display:flex;flex-direction:column;gap:8px}
.m3d-settings-head{display:flex;align-items:center;justify-content:space-between;
  font-size:var(--m3d-size-sm);font-weight:var(--m3d-weight-semibold);padding:2px 2px 0}
.m3d-settings-reset{display:flex;align-items:center;justify-content:center;width:26px;height:26px;
  border:none;border-radius:7px;background:transparent;color:var(--m3d-muted);cursor:pointer}
.m3d-settings-reset:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent);color:var(--m3d-text)}
.m3d-settings-list{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
.m3d-settings-toolhead{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;
  border:none;border-radius:8px;background:transparent;color:var(--m3d-text);cursor:pointer;
  font-family:inherit;font-size:var(--m3d-size-sm);text-align:left;transition:background .14s}
.m3d-settings-toolhead:hover,
.m3d-settings-toolhead.m3d-on{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-settings-toolname{flex:1;display:flex;align-items:center;gap:6px}
.m3d-settings-dot{width:6px;height:6px;border-radius:50%;background:var(--m3d-accent);flex:none}
.m3d-settings-preview{width:34px;height:18px;flex:none;opacity:.95}
.m3d-settings-footer{border-top:1px solid var(--m3d-border);padding-top:6px;flex:none}
/* Sous-panneau latéral (éditeur d'un outil / liste des raccourcis) : positionné
   par le composant (top = ligne survolée, clampé au viewport). Le franchissement
   de l'écart ligne↔sous-panneau est couvert par la fermeture différée du
   composant (timer) — pas de pont ::before. */
/* Positionnement et animation viennent de .m3d-dropdown : ce sous-menu passe par la
   MEME surface que tous les autres. Ne restent ici que sa largeur et son gabarit. */
.m3d-settings-sub{width:212px;padding:11px;display:flex;flex-direction:column;gap:9px;overflow-y:auto}
/* Récap raccourcis : trois colonnes, donc surface plus large que les autres sous-panneaux. */
.m3d-settings-sub-wide{width:568px}
/* Préférences : plus large que le sous-panneau par défaut (212) pour que les groupes
   segmentés (Auto/Élevé/Moyen/Léger) et les touches en bout de ligne ne soient pas rognés. */
.m3d-settings-sub-pref{width:300px}
/* Habillage partagé avec les autres intertitres (cf. CSS_CHASSIS). */
.m3d-settings-subtitle{margin-bottom:2px}
.m3d-shortcuts{display:flex;flex-direction:column;gap:3px}
/* column-count équilibre seul les trois colonnes (hauteurs égales à une ligne près) ;
   break-inside:avoid empêche qu'une ligne soit coupée en bas de colonne. */
.m3d-shortcut-cols{column-count:3;column-gap:26px}
.m3d-shortcut-row{display:flex;align-items:center;justify-content:space-between;gap:8px;
  font-size:11.5px;color:var(--m3d-text)}
.m3d-shortcut-cols .m3d-shortcut-row{break-inside:avoid;margin-bottom:7px}
.m3d-shortcut-cols .m3d-shortcut-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m3d-shortcut-row .m3d-kbd{flex:none}
/* Séparateur d'une liste en sections (récap raccourcis d'antan, panneau Stats). */
.m3d-shortcut-sep{border-top:1px solid var(--m3d-border);margin:5px 0}

/* ── Panneau « Préférences » (qualité 3D + contrôles) ─────────────────────────
   Vit dans la même surface .m3d-settings-sub ; largeur un peu plus généreuse pour que
   les groupes segmentés (Auto/Élevé/Moyen/Léger) tiennent sur une ligne. */
.m3d-pref{display:flex;flex-direction:column;gap:9px;width:100%}
/* Boutons exclusifs : un rail segmenté, l'actif prend l'accent. */
.m3d-pref-seg{display:flex;gap:2px;background:color-mix(in srgb,var(--m3d-text) 6%,transparent);
  border-radius:8px;padding:2px}
.m3d-pref-segbtn{flex:1;min-width:0;padding:5px 6px;border:0;border-radius:6px;background:transparent;
  color:var(--m3d-muted);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.m3d-pref-segbtn:hover{color:var(--m3d-text)}
.m3d-pref-segbtn.m3d-on{background:var(--m3d-panel);color:var(--m3d-text);
  box-shadow:0 1px 2px color-mix(in srgb,#000 18%,transparent)}
/* Étiquette ↔ contrôle sur une ligne (Vitesse). */
.m3d-pref-field{display:flex;align-items:center;gap:8px}
.m3d-pref-fieldlabel{flex:none;width:56px;font-size:11.5px;color:var(--m3d-text)}
.m3d-pref-field .m3d-pref-seg{flex:1}
/* <kbd> ÉDITABLE du récap : même taille/place que les autres, mais SIGNALÉ cliquable —
   pleine opacité, bordure teintée accent, petit crayon. 'm3d-on' = capture en cours,
   'm3d-kbd-bad' = touche déjà prise (refus). La grille du récap ne change pas. */
.m3d-kbd-edit{cursor:pointer;opacity:1;display:inline-flex;align-items:center;gap:3px;
  border-color:color-mix(in srgb,var(--m3d-accent) 45%,transparent);
  transition:background .12s,color .12s,border-color .12s}
.m3d-editpen{opacity:.5;flex:none}
.m3d-kbd-edit:hover{background:color-mix(in srgb,var(--m3d-accent) 16%,transparent);border-color:var(--m3d-accent)}
.m3d-kbd-edit:hover .m3d-editpen{opacity:.95}
.m3d-kbd-edit:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:1px}
.m3d-kbd-edit.m3d-on{background:var(--m3d-accent);color:#fff;border-color:transparent}
.m3d-kbd-edit.m3d-on .m3d-editpen{opacity:0}
.m3d-kbd-edit.m3d-kbd-bad{color:#fff;background:var(--m3d-error);border-color:transparent}
`
