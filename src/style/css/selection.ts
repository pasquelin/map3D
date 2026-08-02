export const CSS_SELECTION = `
/* Overlay SVG de l'outil sélection : contours marching-ants, bbox, marquee/lasso.
   pointer-events:none — le SVG n'intercepte rien, seules les poignées (plus tard)
   réactivent les événements. Tout est en px écran, resynchronisé chaque frame. */
.m3d-edit-svg{position:absolute;inset:0;width:100%;height:100%;z-index:var(--m3d-z-edit-overlay,15);
  pointer-events:none!important;overflow:visible}
/* Marching ants (Photoshop) — langage visuel UNIQUE de la sélection : deux traits
   superposés, trait plein clair dessous + tirets sombres animés dessus, dont
   l'alternance reste lisible sur tout fond (satellite, eau, toits, neige).
   Employé par les TROIS surfaces qui « pointillent » à l'écran :
     .m3d-ants-*      contour des formes sélectionnées (SelectionOverlay, <path>)
     .m3d-marquee*    tracé du sélecteur rect/poly/lasso (SelectionOverlay, <path>)
     .m3d-lenszone-*  → réutilise .m3d-marquee* (zone de la loupe, LensZone, <rect>)
   Mêmes règles pour tous : la dérive entre outils est structurellement impossible.
   Couleurs pilotées par le thème (theme.colors.marquee -> --m3d-marquee-*), repli
   blanc/noir — c'est donc au thème de préserver l'alternance clair/sombre. */
.m3d-ants-under,.m3d-marquee-under{stroke:var(--m3d-marquee-under,#fff);stroke-width:1.6}
.m3d-ants-over,.m3d-marquee{fill:none;stroke:var(--m3d-marquee-stroke,#000);stroke-width:1.6;
  stroke-dasharray:5 4;animation:m3d-ants .5s linear infinite}
/* Voile de fond : seules les surfaces FERMÉES du sélecteur/de la loupe le portent —
   un contour de forme doit rester creux (il cerne, il ne remplit pas). */
.m3d-ants-under{fill:none}
.m3d-marquee-under{fill:var(--m3d-marquee-fill,rgba(255,255,255,.12))}
/* Bbox englobante : volontairement PLUS discrète que le marquee (trait fin, tirets
   serrés, défilement plus lent) — elle informe de l'étendue, elle n'appelle pas
   l'action. Reste en dur : c'est un repère technique, pas une surface de thème. */
.m3d-selbox{fill:none;stroke:#fff;stroke-width:1;stroke-dasharray:4 4;opacity:.9;
  filter:drop-shadow(0 0 1.5px rgba(0,0,0,.9));animation:m3d-ants .6s linear infinite}
@keyframes m3d-ants{to{stroke-dashoffset:-9}}
/* Boilerplate COMMUN des anneaux de décoration centrés sur l'ancre du marker
   (multi-sélection, sonar, viseur) : chaque variante ne définit plus que son
   diamètre (--ring-d), son trait et son animation. Le CSS2DRenderer déplace le
   nœud — zéro JS par frame. --m3d-selring (posé par la couche React) = taille
   du marker + marge. Les glows sont en box-shadow (peints avec l'anneau,
   composables avec l'animation transform) — pas de filter:drop-shadow qui
   re-rastérise le sous-arbre à chaque frame d'animation. */
.m3d-marker-node.m3d-multisel::before,.m3d-marker-node.m3d-multisel::after,
.m3d-marker-node.m3d-selected:not(.m3d-multisel)::after,
.m3d-ants-ring::before,.m3d-ants-ring::after,
.m3d-sonar::before,.m3d-sonar::after,
.m3d-target::before,.m3d-target::after{content:'';position:absolute;left:0;top:0;
  box-sizing:border-box;width:var(--ring-d);height:var(--ring-d);
  margin:calc(var(--ring-d) / -2) 0 0 calc(var(--ring-d) / -2);
  border-radius:50%;pointer-events:none}

/* Anneau du marker sélectionné. Sa couleur vient de la DONNÉE (--m3d-selcolor,
   posée par la couche) : l'anneau peut ainsi porter une information — statut d'un
   agent, source d'une alerte — au lieu d'une teinte fixe. Repli sur l'accent du
   thème. Écarté quand la multi-sélection est active : ses marching ants blanc/noir
   occupent déjà ce gabarit, deux anneaux concentriques seraient illisibles.
   Centrage par le boilerplate ci-dessus : un left/top à 50% viserait le milieu de la
   boîte du nœud, qui n'est pas l'ancre — le contenu s'y décale par marge négative. */
.m3d-marker-node.m3d-selected:not(.m3d-multisel)::after{
  --ring-d:var(--m3d-selring,52px);
  border:2px solid var(--m3d-selcolor,var(--m3d-accent))}

/* Marker à AVATAR : même anneau DÉTACHÉ, mais dimensionné sur la taille réelle du
   marker (--m3d-avatarring) et non sur --m3d-selring. Un avatar occupe tout le carré
   du marker, là où la pastille visible d'un sprite n'en couvre qu'une fraction — et
   c'est sur cette pastille que l'appelant cale selectionRing. Le même diamètre
   passerait donc à l'intérieur de la photo.
   Un anneau ACCOLÉ à la photo serait pire qu'un anneau détaché : il viendrait
   s'empiler sur la bordure de type que l'avatar porte déjà, et l'état sélectionné se
   lirait comme un simple épaississement. */
.m3d-marker-node.m3d-selected:has(.m3d-marker-avatar)::after{
  --ring-d:var(--m3d-avatarring,var(--m3d-selring,52px))}

/* Marker multi-sélectionné : anneau blanc plein + anneau noir en tirets qui
   tourne lentement — même langage N/B que les formes. */
.m3d-marker-node.m3d-multisel::before,
.m3d-marker-node.m3d-multisel::after{--ring-d:var(--m3d-selring,52px)}
/* Marker à AVATAR en multi-sélection : le ring doit ceinturer la PHOTO (comme la
   sélection simple, ligne ~66), pas rester au diamètre du sprite — sinon le pointillé
   passe DANS l'avatar. Même correctif de diamètre que le ring simple avatar. */
.m3d-marker-node.m3d-multisel:has(.m3d-marker-avatar)::before,
.m3d-marker-node.m3d-multisel:has(.m3d-marker-avatar)::after{
  --ring-d:var(--m3d-avatarring,var(--m3d-selring,52px))}
/* .m3d-ants-ring : le MÊME anneau marching-ants, réutilisable par un nœud non-marker
   (pastille de cluster) — son diamètre vient de --ring-d posé en style inline. Trait
   épaissi (2.4px) : à 1.6px les tirets étaient trop fins pour distinguer un élément
   sélectionné, surtout plusieurs voisins dans un cluster. Marker et cluster partagent
   ce trait → aucune différence visuelle possible entre eux. */
.m3d-marker-node.m3d-multisel::before,
.m3d-ants-ring::before{border:2.4px solid #fff}
.m3d-marker-node.m3d-multisel::after,
.m3d-ants-ring::after{border:2.4px dashed #000;
  animation:m3d-selring-spin 7s linear infinite}
@keyframes m3d-selring-spin{to{transform:rotate(360deg)}}

/* Sonar « nouvel élément » : signal opérationnel À TRAITER — anneaux épais très
   voyants (couleur thème attention.sonar, jaune vif par défaut) + glow, en
   expansion continue, éteints au premier clic sur le marker (état « vu » côté React). */
.m3d-sonar{position:absolute;left:0;top:0;pointer-events:none;
  color:var(--m3d-sonar-color,#ffd60a)}
.m3d-sonar::before,.m3d-sonar::after{--ring-d:var(--m3d-selring,52px);
  border:3.5px solid currentColor;box-shadow:0 0 6px currentColor;
  animation:m3d-sonar 1.8s cubic-bezier(.2,.6,.35,1) infinite}
.m3d-sonar::after{animation-delay:.9s}
@keyframes m3d-sonar{0%{transform:scale(.7);opacity:1}70%{opacity:.35}
  100%{transform:scale(2.6);opacity:0}}

/* Viseur « urgent » : réticule rouge qui pulse + anneau tireté en rotation +
   4 crans clignotants — conçu pour capter l'œil immédiatement, tant que le
   flag est vrai. Couleur thème attention.target (rouge vif par défaut). */
.m3d-target{position:absolute;left:0;top:0;pointer-events:none;
  color:var(--m3d-target-color,#ff3b30)}
.m3d-target::before{--ring-d:calc(var(--m3d-selring,52px) + 10px);
  border:3.5px solid currentColor;box-shadow:0 0 5px currentColor;
  animation:m3d-target-pulse 1s ease-in-out infinite}
.m3d-target::after{--ring-d:calc(var(--m3d-selring,52px) + 22px);
  border:3px dashed currentColor;animation:m3d-selring-spin 3s linear infinite}
/* Crans du réticule (haut/droite/bas/gauche), pointés vers le centre. */
.m3d-target i{position:absolute;left:0;top:0;width:4px;height:12px;
  margin:-2px 0 0 -2px;border-radius:2px;background:currentColor;
  box-shadow:0 0 4px currentColor;
  --m3d-target-r:calc(var(--m3d-selring,52px) / 2 + 17px);
  animation:m3d-target-blink 1s ease-in-out infinite}
.m3d-target i:nth-child(1){transform:translateY(calc(-1 * var(--m3d-target-r)))}
.m3d-target i:nth-child(2){transform:rotate(90deg) translateY(calc(-1 * var(--m3d-target-r)))}
.m3d-target i:nth-child(3){transform:translateY(var(--m3d-target-r))}
.m3d-target i:nth-child(4){transform:rotate(90deg) translateY(var(--m3d-target-r))}
@keyframes m3d-target-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.12);opacity:.75}}
@keyframes m3d-target-blink{0%,100%{opacity:1}50%{opacity:.35}}
`
