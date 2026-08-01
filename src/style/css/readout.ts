import { BAR_INSET } from '../panelGeometry'

export const CSS_READOUT = `
/* ══ LECTURE DE LA VUE ═════════════════════════════════════════════════════════
   Bloc altitude / coordonnées / zoom, sur UNE ligne. Même retrait que les barres
   (--m3d-bar-inset), pour que les meubles se répondent d'un coin à l'autre.

   En ligne et non empilé : un bandeau d'une ligne se lit d'un balayage pendant qu'on
   déplace la carte, et il mange moins de hauteur dans un coin — celui d'en face reste
   disponible pour une autre surface. Le wrap est laissé libre pour que le bloc retombe
   sur deux lignes dans une carte étroite plutôt que de déborder.

   pointer-events:none sur le bloc, rétabli sur les valeurs : les gestes de carte
   traversent le cadre, mais une coordonnée reste sélectionnable — c'est ce pour quoi
   on l'affiche. */
.m3d-readout{position:absolute;z-index:var(--m3d-z-ui,999);margin:0;
  display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 14px;padding:13px;
  pointer-events:none;font-size:var(--m3d-size-xs);line-height:1.45;
  /* Chiffres à chasse fixe : sans eux un « 1 » plus étroit qu'un « 8 » fait danser la
     largeur du bloc à chaque rafraîchissement — et sur une ligne, chaque grandeur
     pousserait toutes celles qui la suivent. */
  font-variant-numeric:tabular-nums}
.m3d-readout.m3d-corner-tr{top:var(--m3d-bar-inset, ${BAR_INSET}px);right:var(--m3d-bar-inset, ${BAR_INSET}px)}
.m3d-readout.m3d-corner-tl{top:var(--m3d-bar-inset, ${BAR_INSET}px);left:var(--m3d-bar-inset, ${BAR_INSET}px)}
.m3d-readout.m3d-corner-br{bottom:var(--m3d-bar-inset, ${BAR_INSET}px);right:var(--m3d-bar-inset, ${BAR_INSET}px)}
.m3d-readout.m3d-corner-bl{bottom:var(--m3d-bar-inset, ${BAR_INSET}px);left:var(--m3d-bar-inset, ${BAR_INSET}px)}
/* Une paire libellé + valeur, insécable : c'est le couple qui passe à la ligne quand
   la carte est trop étroite, jamais un libellé séparé de son nombre. */
.m3d-readout-row{display:flex;align-items:baseline;gap:5px;white-space:nowrap}
.m3d-readout-key{color:var(--m3d-muted)}
.m3d-readout-val{margin:0;pointer-events:auto;font-weight:var(--m3d-weight-medium)}

/* Valeur d'une ligne du panneau de diagnostic. Chasse fixe pour la même raison que le
   bloc de lecture : sans elle la colonne des nombres danse à chaque rafraîchissement, et
   c'est précisément celle qu'on suit du regard. Le reste de la mise en page est celle des
   sous-panneaux de réglages — ce sont les mêmes lignes libellé / valeur. */
.m3d-stat{font-variant-numeric:tabular-nums;color:var(--m3d-text)}
/* Verdicts. Le vert reste DISCRET : dans un panneau où tout va bien, tout serait vert, et
   une couleur portée par toutes les lignes ne se lit plus. Ce sont le jaune et le rouge
   qui doivent attraper l'œil. Sans teintes au thème, la valeur garde la couleur de texte :
   pas de couleur plutôt qu'un verdict que le thème n'a pas voulu donner. */
.m3d-stat-ok{color:var(--m3d-stat-ok,var(--m3d-text))}
.m3d-stat-warn{color:var(--m3d-stat-warn,var(--m3d-text))}
.m3d-stat-bad{color:var(--m3d-stat-bad,var(--m3d-text))}
`
