import { BAR_INSET } from '../panelGeometry'

export const CSS_CHASSIS = `
/* ══ CHÂSSIS DES SURFACES ══════════════════════════════════════════════════════
   Fond, bordure et flou : UNE déclaration pour les onze surfaces. Ils étaient recopiés
   à la main partout, et chaque copie avait dérivé — flou 20px / 12px / aucun. Le menu
   contextuel était le seul à ne pas être flouté, une infobulle portait une ombre PLUS
   forte qu'un panneau. C'est cette dérive qu'on lit comme « un design par élément ».

   Ce qui reste distinct est nommé et volontaire : DEUX profondeurs, parce que les deux
   familles ne jouent pas le même rôle. Une barre est un meuble, toujours là, elle ne
   doit pas peser ; une surface flottante vient de s'ouvrir PAR-DESSUS et doit se
   détacher. Le rayon suit la taille de la surface, pas son rôle. */
.m3d-panel,.m3d-markertip,.m3d-tip,.m3d-menu-panel,.m3d-relbar,
.m3d-controls-group,.m3d-drawbar,.m3d-search-box,.m3d-pindock,.m3d-pindock-toggle,.m3d-lenszone-x,.m3d-readout{
  background:var(--m3d-panel);border:1px solid var(--m3d-border);
  backdrop-filter:blur(20px);color:var(--m3d-text)}
/* Meubles : posés sur la carte, ombre discrète. */
.m3d-controls-group,.m3d-drawbar,.m3d-search-box,.m3d-pindock,.m3d-pindock-toggle,.m3d-lenszone-x,.m3d-readout{
  box-shadow:var(--m3d-shadow-sm)}
/* Surfaces flottantes : ouvertes au-dessus, elles se détachent. */
.m3d-panel,.m3d-markertip,.m3d-tip,.m3d-menu-panel,.m3d-relbar{box-shadow:var(--m3d-shadow-md)}
/* Tout le mobilier — barres, champ de recherche, dock, panneaux — partage le même
   rayon. Les deux barres d'outils l'avaient différent (10 d'un côté, 14 de l'autre) :
   deux meubles jumeaux posés face à face, aux coins qui ne se répondaient pas. */
.m3d-panel,.m3d-drawbar,.m3d-pindock,.m3d-controls-group,.m3d-search-box,.m3d-readout{
  border-radius:var(--m3d-radius-lg)}
/* Seules les surfaces TRANSITOIRES et petites gardent le rayon moyen : 14px sur une
   infobulle de deux lignes mange le texte. */
.m3d-markertip,.m3d-tip,.m3d-menu-panel{border-radius:var(--m3d-radius-md)}
/* Formes qui PORTENT du sens, pas des écarts de charte : la barre de relation se lit
   comme un badge posé sur son marker, la croix de la loupe est un bouton rond. */
.m3d-relbar{border-radius:var(--m3d-radius-pill)}

/* Panneau d'une surface déroulante. PORTÉ à la racine de la carte, jamais rendu dans la
   barre qui l'ouvre : une barre porte backdrop-filter, ce qui en fait une racine de
   fond, et un panneau rendu dedans ne peut plus flouter la carte — seulement la barre.
   Deux panneaux au CSS identique n'avaient donc pas le même fond selon leur origine.
   Position écrite par useAnchoredPortal : plus de left:calc(100%+gap) ni de top, qui
   supposaient un parent-ancre. Les variantes ne gardent que largeur et padding. */
.m3d-dropdown{position:absolute;top:0;left:0;z-index:var(--m3d-z-ui,999);
  animation:m3d-menu-in var(--m3d-menu-dur,200ms) cubic-bezier(.32,1.3,.5,1) backwards}

/* Barres : toute la géométrie est proportionnelle à --m3d-bar-scale, que
   useFitColumns réduit quand la carte est trop courte (puis passe en colonnes).
   Variable absente = 1 : aucun effet hors barre. */
.m3d-controls{position:absolute;top:50%;transform:translateY(-50%);z-index:var(--m3d-z-ui,999);
  display:flex;flex-direction:column;gap:calc(9px * var(--m3d-bar-scale,1));
  align-items:center;align-content:flex-start}
.m3d-controls.m3d-right{right:var(--m3d-bar-inset, ${BAR_INSET}px)}
.m3d-controls.m3d-left{left:var(--m3d-bar-inset, ${BAR_INSET}px)}
.m3d-controls-group{display:flex;flex-direction:column;gap:2px;
  padding:calc(5px * var(--m3d-bar-scale,1));
  }
.m3d-btn{width:calc(38px * var(--m3d-bar-scale,1));height:calc(38px * var(--m3d-bar-scale,1));
  border:none;background:transparent;border-radius:9px;outline:none;
  display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--m3d-text);
  transition:background .14s}
.m3d-btn:hover{background:color-mix(in srgb,var(--m3d-text) 12%,transparent)}
/* Panneau ouvert : plus de survol sur les boutons de barre. Un bouton survolé pendant
   qu'une surface est ouverte s'allumait en plus de l'outil actif ET du bouton du
   panneau — trois boutons marqués, sans qu'aucun ne dise lequel compte. Les boutons
   ACTIFS gardent leur état : c'est l'information, pas le survol. */
.m3d-root.m3d-dropdown-open .m3d-btn:hover:not(.m3d-on){background:transparent}
.m3d-btn.m3d-on{background:var(--m3d-accent);color:#fff}
/* :focus-visible ne s'active qu'au clavier (pas au clic) : indispensable pour
   naviguer les barres à la tabulation (WCAG 2.4.7). .m3d-btn en est retiré
   VOLONTAIREMENT (outline:none assumé ci-dessus) ; les autres surfaces focusables
   gardent leur anneau. */
.m3d-flyout-item:focus-visible,.m3d-preset:focus-visible,
.m3d-palette-dot:focus-visible,.m3d-swatch:focus-visible,.m3d-swap:focus-visible,
.m3d-settings-toolhead:focus-visible,.m3d-relbar-seg:focus-visible,
.m3d-remove:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:1px}
.m3d-btn:disabled{opacity:.35;cursor:default;background:transparent}
.m3d-btn-move{margin-bottom:calc(4px * var(--m3d-bar-scale,1))}
.m3d-btn-delete{margin-top:calc(4px * var(--m3d-bar-scale,1)); color:var(--m3d-error)}

/* Barre d'outils de dessin : sous le zoom minimal elle glisse hors écran
   (translateY conserve le centrage vertical pendant la transition). */
.m3d-drawbar{position:absolute;top:50%;z-index:var(--m3d-z-ui,999);display:flex;flex-direction:column;
  align-content:flex-start;gap:calc(2px * var(--m3d-bar-scale,1));
  padding:calc(6px * var(--m3d-bar-scale,1));
  transform:translateY(-50%);
  transition:transform .28s cubic-bezier(.4,0,.2,1),opacity .28s}
.m3d-drawbar.m3d-left{left:var(--m3d-bar-inset, ${BAR_INSET}px)}
.m3d-drawbar.m3d-right{right:var(--m3d-bar-inset, ${BAR_INSET}px)}
.m3d-drawbar.m3d-hidden{opacity:0;pointer-events:none}
.m3d-drawbar.m3d-left.m3d-hidden{transform:translateY(-50%) translateX(calc(-100% - 24px))}
.m3d-drawbar.m3d-right.m3d-hidden{transform:translateY(-50%) translateX(calc(100% + 24px))}
.m3d-drawbar .m3d-btn{width:calc(40px * var(--m3d-bar-scale,1));height:calc(40px * var(--m3d-bar-scale,1))}
/* Bouton à flyout (sélection) : flèche en coin = « il y a des sous-outils ». */
.m3d-selectwrap{position:relative}
.m3d-btn-flyout{position:relative}
.m3d-btn-flyout::after{content:'';position:absolute;right:5px;bottom:5px;
  border-left:4px solid transparent;border-bottom:4px solid currentColor;opacity:.55}
/* Flyout vertical ouvert au survol : rangées auto-explicatives (icône + libellé
   + raccourci) — pas de tooltips. Le ::before comble l'écart bouton↔flyout pour
   que le survol ne se coupe pas en traversant les 12px de vide. */
/* Positionnement et animation viennent de .m3d-dropdown : ce sous-menu passe par la
   MEME surface que les autres. Il était rendu dans la barre, qui porte backdrop-filter
   et fait donc racine de fond — son flou ne pouvait pas jouer comme ailleurs, et il
   paraissait venir d'un autre composant. Ne restent ici que son gabarit et le pont
   invisible qui laisse traverser l'écart au pointeur. */
.m3d-flyout{display:flex;flex-direction:column;gap:2px;padding:5px;min-width:150px}
.m3d-flyout.m3d-left::before{content:'';position:absolute;left:calc(-1 * (var(--m3d-gap,12px) + 2px));top:0;bottom:0;width:calc(var(--m3d-gap,12px) + 2px)}
.m3d-flyout.m3d-right::before{content:'';position:absolute;right:calc(-1 * (var(--m3d-gap,12px) + 2px));top:0;bottom:0;width:calc(var(--m3d-gap,12px) + 2px)}
.m3d-flyout-item{display:flex;align-items:center;gap:9px;padding:8px 10px;border:none;
  background:transparent;border-radius:8px;font-family:inherit;font-size:var(--m3d-size-sm);cursor:pointer;
  color:var(--m3d-text);text-align:left;transition:background .14s}
.m3d-flyout-item:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-flyout-item.m3d-on{background:var(--m3d-accent);color:#fff}
.m3d-flyout-label{flex:1;white-space:nowrap}

.m3d-kbd{font-family:inherit;font-size:10px;font-weight:var(--m3d-weight-bold);padding:1px 5px;border-radius:4px;
  border:1px solid color-mix(in srgb,currentColor 35%,transparent);opacity:.75;line-height:1.5}
`
