export const CSS_DRAG = `

/* ── Drag-and-drop générique (engine.drag) ─────────────────────────────────
   Élément saisissable : touch-action none pour que le long-press tactile ne
   soit pas avalé par le scroll. Le curseur reste celui de l'élément (pointer). */
.m3d-draggable{touch-action:none}
/* Marker repositionnable : touch-action none pour que le geste tactile ne parte
   pas en scroll, et une main qui annonce qu'on peut le déplacer. Pendant le geste
   la poigne fermée est forcée sur TOUT le document — le pointeur sort du marker. */
.m3d-repositionable{touch-action:none;cursor:grab}
.m3d-repositionable:active{cursor:grabbing}
/* Point au sol devenu poignée de repositionnement : il doit recevoir le pointeur
   (le calque CSS2D est en pointer-events:none) et offrir une cible plus large que
   ses 7 px — un ::before transparent centré, sans changer le visuel.
   Sélecteur volontairement spécifique (ancre + dot) pour passer devant toute règle
   de curseur héritée du marker.
   move et non grab : le CANVAS est deja en grab (pan de la carte), donc un grab sur
   la poignee ne se distinguerait de rien — le curseur ne changerait pas a l'oeil en
   la survolant. */
.m3d-marker-anchor .m3d-marker-dot.m3d-repositionable,
.m3d-marker-dot.m3d-repositionable{pointer-events:auto;cursor:move}
.m3d-marker-anchor .m3d-marker-dot.m3d-repositionable:active,
.m3d-marker-dot.m3d-repositionable:active{cursor:grabbing}
.m3d-marker-dot.m3d-repositionable::before{content:'';position:absolute;
  left:50%;top:50%;width:var(--m3d-reposition-hit,22px);height:var(--m3d-reposition-hit,22px);transform:translate(-50%,-50%)}
/* Poignée plus lisible : le point s'agrandit légèrement au survol. */
.m3d-marker-dot.m3d-repositionable:hover{transform:scale(1.5)}
/* Geste en cours (saisie vers la dock OU repositionnement) : curseur de préhension
   partout + pas de sélection de texte parasite pendant qu'on glisse. */
.m3d-root.m3d-dragging,.m3d-root.m3d-dragging *,
.m3d-root.m3d-repositioning,
.m3d-root.m3d-repositioning *{cursor:grabbing!important;user-select:none}
/* Ghost accroché au curseur : positionné en px conteneur (left/top posés inline),
   centré sur le point, transparent aux événements (le hit-test DOM voit à travers).
   Les marges négatives de recentrage des icônes marker sont annulées → translate
   centre n'importe quel contenu (icône marker OU pastille de dock). */
.m3d-drag-ghost{position:absolute;z-index:var(--m3d-z-menu,9999);pointer-events:none;
  transform:translate(-50%,-50%) scale(2);transform-origin:center;
  filter:drop-shadow(0 8px 18px rgba(0,0,0,.4));opacity:.92;
  transition:transform .12s cubic-bezier(.2,.8,.3,1)}
.m3d-drag-ghost > *{margin:0!important}
/* Élément « en main » agrandi ×2 ; un cran de plus au-dessus d'une cible qui accepte. */
.m3d-drag-ghost.m3d-drag-over{transform:translate(-50%,-50%) scale(2.2)}
/* Ghost déclaré « compact » par le consommateur (classe posée via useDraggable,
   ex. pastille du dock) : grossissement discret, pas le ×2 de l'ajout depuis la
   carte. Le second sélecteur égale la spécificité de .m3d-drag-over pour primer. */
.m3d-drag-ghost-pin,
.m3d-drag-ghost-pin.m3d-drag-over{transform:translate(-50%,-50%) scale(1.3)}
`
