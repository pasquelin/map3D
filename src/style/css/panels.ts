import { mdiRotateRight } from '@mdi/js'
import { SELECTION_PANEL_W } from '../panelGeometry'

/** Curseur de rotation : pas de curseur CSS natif → data-URI construit sur l'icône mdi.
 *  Noir à liseré blanc, comme les curseurs système. */
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#000" stroke="#fff" stroke-width="1.6" paint-order="stroke" d="${mdiRotateRight}"/></svg>`,
)}") 12 12, grabbing`

export const CSS_PANELS = `
/* HUD de sélection : badges par groupe (catégorie · type, compteur, croix de
   désélection, tout désélectionner) + hint des modificateurs. Par défaut en haut
   à droite, décalé de la barre de contrôles ; déplaçable par la poignée (le
   composant bascule alors en left/top inline, clampé au conteneur). */
/* Surfaces flottantes déplaçables — squelette PARTAGÉ par le panneau de sélection
   et celui de la loupe (cf. le composant FloatingPanel). Chaque variante ne définit
   plus que ses écarts : sa position par défaut et sa largeur (--m3d-panel-w).
   pointer-events:none sur le conteneur + auto sur ses enfants : le HUD ne capte
   jamais un clic destiné à la carte entre ses cartes. */
.m3d-floathud{position:absolute;z-index:var(--m3d-z-floating-hud,20);display:flex;flex-direction:column;pointer-events:none}
.m3d-floathud > *{pointer-events:auto}
.m3d-floatpanel{width:var(--m3d-panel-w);padding:8px;display:flex;flex-direction:column;gap:7px}
.m3d-floathead{display:flex;align-items:center;gap:6px;padding:2px 2px 0;font-size:var(--m3d-size-sm);font-weight:var(--m3d-weight-semibold)}
.m3d-floathead-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Panneau de sélection : ancré en haut-droite, dégagé des barres verticales. */
.m3d-selhud{top:14px;right:82px;align-items:flex-end;gap:7px;max-width:min(70%,640px)}
.m3d-selpanel{--m3d-panel-w:var(--m3d-selection-panel-w, ${SELECTION_PANEL_W}px)}
/* Poignée de déplacement du HUD (drag & drop). touch-action:none : le drag
   pointer ne doit pas être avalé par le scroll tactile. */
.m3d-selgrip{display:flex;align-items:center;justify-content:center;width:20px;height:22px;
  border:none;border-radius:var(--m3d-radius-sm);background:transparent;padding:0;cursor:grab;
  color:var(--m3d-muted);touch-action:none;flex:none}
.m3d-selgrip:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent);color:var(--m3d-text)}
.m3d-selgrip:active{cursor:grabbing}
/* Panneau liste : mêmes classes que le panneau « Couches » (m3d-taglist/-tagrow/
   -taglabel/-tagdot/-tagcount/-tagclear) — seuls les deltas sont scopés ici. */
/* Rangées non cliquables (seule la croix agit) + liste bornée. */
.m3d-selpanel .m3d-taglist{max-height:44vh}
.m3d-selpanel .m3d-tagrow{cursor:default}
.m3d-selrow-x{display:flex;align-items:center;justify-content:center;width:20px;height:20px;
  border:none;border-radius:50%;background:transparent;padding:0;cursor:pointer;
  color:var(--m3d-muted);transition:background .14s,color .14s;flex:none}
.m3d-selrow-x:hover{background:color-mix(in srgb,var(--m3d-text) 12%,transparent);
  color:var(--m3d-text)}
/* La corbeille rouge (.m3d-selrow-x.m3d-danger) partage le style de l'action destructive
   avec l'entrée de menu : définition unique dans css/menu.ts. */
/* Chevron de dépliage d'un groupe de formes, calqué sur le catalogue : tourne à 90° ouvert. */
.m3d-selrow-chevron{display:flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;
  border:none;background:transparent;padding:0;cursor:pointer;color:var(--m3d-muted);
  transition:transform .14s,color .14s}
.m3d-selrow-chevron:hover{color:var(--m3d-text)}
.m3d-selrow-chevron.m3d-on{transform:rotate(90deg)}
/* Mini-camembert d'un groupe de cluster (badges) : disque conic-gradient aux couleurs des
   parts, à la place de l'icône générique — la ligne ressemble au cluster sur la carte. */
.m3d-clusterpie{width:16px;height:16px;border-radius:50%;flex:none;
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--m3d-text) 30%,transparent)}
/* Formes individuelles d'un groupe déplié : indentées sous la ligne du groupe, chacune
   avec sa corbeille. Un clic sur l'étiquette ne fait rien (pas de fiche par forme ici). */
.m3d-selchildren{display:flex;flex-direction:column;gap:1px}
.m3d-selchild{display:flex;align-items:center;gap:8px;padding:5px 8px 5px 30px;border-radius:8px;
  font-size:var(--m3d-size-sm)}
.m3d-selchild:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
/* Pied du panneau : rappel des modificateurs — vit et meurt avec la liste. */
.m3d-selfoot{border-top:1px solid var(--m3d-border);padding-top:6px;
  display:flex;flex-direction:column;gap:3px}
/* Poignées : blanches à bord sombre (Figma/Illustrator) — lisibles partout.
   Valeurs via --m3d-handle-* (cf. .m3d-root) : partagées avec .m3d-lenszone-h. */
.m3d-handle{fill:var(--m3d-handle-bg);stroke:var(--m3d-handle-line);
  stroke-width:var(--m3d-handle-line-w);pointer-events:all;
  filter:drop-shadow(var(--m3d-handle-shadow))}
.m3d-handle:hover{fill:var(--m3d-accent);stroke:var(--m3d-handle-bg)}
.m3d-vhandle{stroke:rgba(0,0,0,.75)}
.m3d-lockflash{animation:m3d-lockflash .8s ease-out forwards}
.m3d-lockflash path:first-child{fill:none;stroke:var(--m3d-muted);stroke-width:2}
.m3d-lockflash-icon{fill:var(--m3d-text);stroke:none;
  filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}
@keyframes m3d-lockflash{0%{opacity:0}12%{opacity:1}70%{opacity:1}100%{opacity:0}}
/* Outil sélection : curseur flèche (pas le crosshair de dessin), « déplacer » sur une forme. */
.m3d-root.m3d-selecting canvas{cursor:default}
/* En mode sélection, le pointer (main) des markers cliquables est neutralisé —
   la main brouillait sélection vs pan. Les clusters gardent le pointer (clic = zoom).
   !important : le cursor du contenu marker est posé en style inline. */
.m3d-root.m3d-selecting .m3d-marker-content,
.m3d-root.m3d-selecting .m3d-marker-content *{cursor:default!important}
.m3d-root.m3d-selecting.m3d-hover-shape canvas{cursor:move}
/* Rotation de forme (Maj + glisser) : curseur de rotation dédié, partout. */
.m3d-root.m3d-rotating canvas,.m3d-root.m3d-rotating .m3d-handle{cursor:${ROTATE_CURSOR}!important}
/* Barre espace maintenue : pan caméra temporaire (prioritaire sur tous les modes). */
.m3d-root.m3d-space-pan canvas{cursor:grab!important}
.m3d-root.m3d-space-pan canvas:active{cursor:grabbing!important}

/* react-tooltip pose z-index:1 : sous les barres (20) et les panneaux (30/31), un
   tooltip de bouton passait derrière la barre — illisible dès qu'elle est en
   colonnes. Il flotte au-dessus de toutes les surfaces d'UI, sous le menu (95). */
.react-tooltip{z-index:var(--m3d-z-menu,9999)}

/* Scrollbar du thème, pour toutes les zones scrollables des surfaces flottantes —
   déclarée une fois : les cinq listes doivent rester visuellement identiques. */
.m3d-stylepanel,.m3d-settings-list,.m3d-settings-sub,.m3d-taglist,.m3d-search-results{
  scrollbar-width:thin;
  scrollbar-color:color-mix(in srgb,var(--m3d-text) 25%,transparent) transparent}
`
