import { mdiRotateRight } from '@mdi/js'
import { BAR_INSET, GAP } from './panelGeometry'

const STYLE_ID = 'm3d-styles'

/** Curseur de rotation : pas de curseur CSS natif → data-URI construit sur l'icône mdi.
 *  Noir à liseré blanc, comme les curseurs système. */
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#000" stroke="#fff" stroke-width="1.6" paint-order="stroke" d="${mdiRotateRight}"/></svg>`,
)}") 12 12, grabbing`

/**
 * Injecte **une seule fois** par document une feuille scopée sous `.m3d-root`.
 * Aucun style global n'est posé ailleurs. SSR-safe : appelée depuis un effet,
 * jamais au niveau module. Une feuille déjà présente mais périmée (HMR en dev,
 * mise à jour de la lib sur page ouverte) est resynchronisée — sinon les
 * nouveaux composants s'affichent sans leurs styles. Comparaison de chaîne
 * directe : appelée seulement au montage d'un `<Map>`, et sûre cross-realm
 * (iframe/popup), contrairement à un `instanceof HTMLElement`.
 */
export function injectStyles(doc: Document = document): void {
  const existing = doc.getElementById(STYLE_ID)
  if (existing) {
    if (existing.textContent !== CSS) existing.textContent = CSS
    return
  }
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}

// HMR (dev) : re-synchronise la feuille dès que ce module change, sinon les
// styles ne suivraient qu'au prochain montage de `<Map>` (il faut sinon un reload
// complet à chaque retouche CSS). No-op en build : `import.meta.hot` est absent.
const hot = (import.meta as ImportMeta & { hot?: { accept: (cb: () => void) => void } }).hot
if (hot) hot.accept(() => injectStyles())

const CSS = `
.m3d-root{position:relative;width:100%;height:100%;overflow:hidden;
  font-family:var(--m3d-font);color:var(--m3d-text);background:var(--m3d-bg);
  -webkit-font-smoothing:antialiased}
/* width/height:100% : un <canvas> est un élément remplacé ; sans taille CSS
   explicite il garde sa largeur intrinsèque (attribut = ×devicePixelRatio) et
   s'affiche 2× trop grand. On force la taille d'affichage = conteneur. */
.m3d-root canvas{position:absolute;inset:0;display:block;width:100%;height:100%;cursor:grab;touch-action:none}
.m3d-root canvas:active{cursor:grabbing}
.m3d-root.m3d-drawing canvas{cursor:crosshair}
/* overflow visible : sinon les menus/sous-menus ancrés aux markers sont coupés */
.m3d-overlay{position:absolute;inset:0;z-index:5;pointer-events:none;overflow:visible;transition:opacity .5s}
.m3d-overlay > *{pointer-events:auto}
/* Intro : labels/popups ancrés à la carte masqués avec les markers (fondu à l'entrée). */
.m3d-root.m3d-intro .m3d-overlay{opacity:0}
.m3d-root.m3d-intro .m3d-overlay > *{pointer-events:none!important}
/* Overlay HTML piloté par le CSS2DRenderer (superposé au canvas). */
.m3d-css2d{pointer-events:none;transition:opacity .5s}
/* Intro (vol globe → cible) : markers/clusters masqués jusqu'à l'atterrissage —
   sinon ils flottent sur le vide pendant que la planète streame. Fondu à l'entrée. */
.m3d-root.m3d-intro .m3d-css2d{opacity:0}
.m3d-root.m3d-intro .m3d-css2d *{pointer-events:none!important}
/* Enveloppe ancrée : positionnée (transform) par le CSS2DRenderer chaque frame.
   PAS de will-change : la promotion en couche GPU désynchronise le marker du
   canvas WebGL pendant le déplacement (les 2 couches sont présentées à ~1 frame
   d'écart → « nage » visible). Sans promotion, le transform est peint dans la
   même frame que la carte. */
.m3d-marker-anchor{pointer-events:none}
.m3d-marker-node{pointer-events:none}
.m3d-marker-node > *{pointer-events:auto}

.m3d-marker-node{position:absolute;left:0;top:0}
/* Leader line : le badge est relevé de --m3d-leader-lift px et relié par un fil
   vertical à un point d'ancrage posé au sol EXACT. L'alerte reste toujours visible
   (badge par-dessus la 3D) tout en montrant sans ambiguïté sa position au sol —
   même en vue rasante où le badge se dessine « en l'air » par-dessus l'avant-plan.
   Transform statique (pas de will-change) → peint dans la même frame que la carte. */
.m3d-marker-lift{position:absolute;left:0;top:0;transform:translateY(calc(-1 * var(--m3d-leader-lift,44px)))}
.m3d-marker-leader{position:absolute;left:0;top:calc(-1 * var(--m3d-leader-lift,44px));
  width:2px;height:var(--m3d-leader-lift,44px);margin-left:-1px;border-radius:1px;
  background:linear-gradient(to top,rgba(17,24,39,.5),rgba(17,24,39,.12));pointer-events:none}
.m3d-marker-dot{position:absolute;left:0;top:0;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;
  border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px rgba(17,24,39,.5);pointer-events:none}
/* Zone de clic invisible alignée sur le sprite WebGL (le visuel du marker). */
.m3d-hit{cursor:pointer;border-radius:50%;background:transparent}
/* Avatar de marker (MarkerData.avatar) : photo ronde cerclée de la couleur du
   type (border-color inline) + liseré blanc — prioritaire sur l'icône custom. */
.m3d-marker-img{max-width:none;max-height:none}
.m3d-marker-avatar{border-radius:50%;object-fit:cover;box-sizing:border-box;
  border:2.5px solid;background:var(--m3d-panel);
  box-shadow:0 0 0 1.5px rgba(255,255,255,.9),0 2px 6px rgba(0,0,0,.4)}
.m3d-marker-node.m3d-enter{animation:m3d-enter var(--m3d-enter-dur,460ms)
  var(--m3d-enter-ease,cubic-bezier(.32,1.5,.5,1)) backwards}
.m3d-marker-node.m3d-selected{z-index:80}
@keyframes m3d-enter{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:scale(1)}}
@keyframes m3d-halo{0%{transform:scale(.62);opacity:.5}70%{opacity:0}100%{transform:scale(2.1);opacity:0}}
@keyframes m3d-pulse{0%,100%{transform:scale(1)}50%{transform:scale(var(--m3d-pulse-scale,1.16))}}
@keyframes m3d-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(-1 * var(--m3d-bob-amp,4px)))}}
@keyframes m3d-cluster-bloom{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes m3d-menu-in{from{opacity:0;transform:translateX(-8px) scale(.96)}}

.m3d-measure-label{position:absolute;left:0;top:0;background:var(--m3d-panel);
  color:var(--m3d-text);border:1px solid var(--m3d-border);backdrop-filter:blur(12px);
  font-size:10.5px;font-weight:600;font-variant-numeric:tabular-nums;padding:3px 9px;
  border-radius:var(--m3d-radius-pill);white-space:nowrap;box-shadow:var(--m3d-shadow-sm);
  pointer-events:none}

/* Overlay SVG de l'outil sélection : contours marching-ants, bbox, marquee/lasso.
   pointer-events:none — le SVG n'intercepte rien, seules les poignées (plus tard)
   réactivent les événements. Tout est en px écran, resynchronisé chaque frame. */
.m3d-edit-svg{position:absolute;inset:0;width:100%;height:100%;z-index:15;
  pointer-events:none!important;overflow:visible}
/* Marching ants noir/blanc (Photoshop) : blanc plein dessous + tirets noirs animés
   dessus = alternance N/B visible sur tout fond (satellite, eau, toits, neige). */
.m3d-ants-under{fill:none;stroke:#fff;stroke-width:1.6}
.m3d-ants-over{fill:none;stroke:#000;stroke-width:1.6;stroke-dasharray:5 4;
  animation:m3d-ants .5s linear infinite}
.m3d-selbox{fill:none;stroke:#fff;stroke-width:1;stroke-dasharray:4 4;opacity:.9;
  filter:drop-shadow(0 0 1.5px rgba(0,0,0,.9));animation:m3d-ants .6s linear infinite}
/* Marquee : même double trait marching ants que les contours de formes (blanc
   plein dessous + tirets noirs animés dessus), avec un voile translucide. */
.m3d-marquee-under{fill:rgba(255,255,255,.10);stroke:#fff;stroke-width:1.6}
.m3d-marquee{fill:none;stroke:#000;stroke-width:1.6;stroke-dasharray:5 4;
  animation:m3d-ants .5s linear infinite}
@keyframes m3d-ants{to{stroke-dashoffset:-9}}
/* Boilerplate COMMUN des anneaux de décoration centrés sur l'ancre du marker
   (multi-sélection, sonar, viseur) : chaque variante ne définit plus que son
   diamètre (--ring-d), son trait et son animation. Le CSS2DRenderer déplace le
   nœud — zéro JS par frame. --m3d-selring (posé par la couche React) = taille
   du marker + marge. Les glows sont en box-shadow (peints avec l'anneau,
   composables avec l'animation transform) — pas de filter:drop-shadow qui
   re-rastérise le sous-arbre à chaque frame d'animation. */
.m3d-marker-node.m3d-multisel::before,.m3d-marker-node.m3d-multisel::after,
.m3d-sonar::before,.m3d-sonar::after,
.m3d-target::before,.m3d-target::after{content:'';position:absolute;left:0;top:0;
  box-sizing:border-box;width:var(--ring-d);height:var(--ring-d);
  margin:calc(var(--ring-d) / -2) 0 0 calc(var(--ring-d) / -2);
  border-radius:50%;pointer-events:none}

/* Marker multi-sélectionné : anneau blanc plein + anneau noir en tirets qui
   tourne lentement — même langage N/B que les formes. */
.m3d-marker-node.m3d-multisel::before,
.m3d-marker-node.m3d-multisel::after{--ring-d:var(--m3d-selring,52px)}
.m3d-marker-node.m3d-multisel::before{border:1.6px solid #fff}
.m3d-marker-node.m3d-multisel::after{border:1.6px dashed #000;
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
  color:var(--m3d-target-color,var(--m3d-error,#ef4444))}
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

/* Infobulle de marker (survol) : title + content ReactNode fournis par l'hôte.
   Ancrée au-dessus du marker (--m3d-tiplift = rayon + marge), non interactive. */
.m3d-markertip{position:absolute;left:0;top:0;pointer-events:none;z-index:90;
  transform:translate(-50%,calc(-100% - var(--m3d-tiplift,32px)));
  background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-md);box-shadow:var(--m3d-shadow-lg);
  backdrop-filter:blur(12px);padding:8px 11px;min-width:120px;max-width:240px;
  animation:m3d-tip-in .16s ease-out}
.m3d-markertip-title{font-size:12.5px;font-weight:600;color:var(--m3d-text);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Le contenu est une LISTE : une information par ligne (m3d-markertip-row),
   jamais de concaténation wrappée sur une ligne. */
.m3d-markertip-content{display:flex;flex-direction:column;gap:3px;
  font-size:11.5px;color:var(--m3d-muted);margin-top:2px}
.m3d-markertip-title + .m3d-markertip-content{margin-top:5px}
.m3d-markertip-row{display:flex;align-items:center;gap:6px;white-space:nowrap}
.m3d-markertip-row span{overflow:hidden;text-overflow:ellipsis}
/* Marker urgent : infobulle en style URGENCE — bordure, titre et halo rouges
   (couleur thème attention.target), distincte au premier coup d'œil. */
.m3d-markertip.m3d-markertip-urgent{
  border:2.5px solid color-mix(in srgb,var(--m3d-target-color,#ff3b30) 85%,transparent);
  box-shadow:var(--m3d-shadow-lg),0 0 12px color-mix(in srgb,var(--m3d-target-color,#ff3b30) 45%,transparent)}
.m3d-markertip-urgent .m3d-markertip-title{color:var(--m3d-target-color,#ff3b30)}
@keyframes m3d-tip-in{from{opacity:0;transform:translate(-50%,calc(-100% - var(--m3d-tiplift,32px) + 4px))}}

/* HUD de sélection : badges par groupe (catégorie · type, compteur, croix de
   désélection, tout désélectionner) + hint des modificateurs. Par défaut en haut
   à droite, décalé de la barre de contrôles ; déplaçable par la poignée (le
   composant bascule alors en left/top inline, clampé au conteneur). */
.m3d-selhud{position:absolute;top:14px;right:82px;z-index:20;
  display:flex;flex-direction:column;align-items:flex-end;gap:7px;pointer-events:none;
  max-width:min(70%,640px)}
.m3d-selhud > *{pointer-events:auto}
/* Poignée de déplacement du HUD (drag & drop). touch-action:none : le drag
   pointer ne doit pas être avalé par le scroll tactile. */
.m3d-selgrip{display:flex;align-items:center;justify-content:center;width:20px;height:22px;
  border:none;border-radius:6px;background:transparent;padding:0;cursor:grab;
  color:var(--m3d-muted);touch-action:none;flex:none}
.m3d-selgrip:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent);color:var(--m3d-text)}
.m3d-selgrip:active{cursor:grabbing}
/* Panneau liste : mêmes classes que le panneau « Couches » (m3d-taglist/-tagrow/
   -taglabel/-tagdot/-tagcount/-tagclear) — seuls les deltas sont scopés ici. */
.m3d-selpanel{width:236px;padding:8px;display:flex;flex-direction:column;gap:7px}
.m3d-selhead{display:flex;align-items:center;gap:6px;padding:2px 2px 0;
  font-size:12.5px;font-weight:600}
.m3d-selhead span{flex:1}
/* Rangées non cliquables (seule la croix agit) + liste bornée. */
.m3d-selpanel .m3d-taglist{max-height:40vh}
.m3d-selpanel .m3d-tagrow{cursor:default}
.m3d-selrow-x{display:flex;align-items:center;justify-content:center;width:20px;height:20px;
  border:none;border-radius:50%;background:transparent;padding:0;cursor:pointer;
  color:var(--m3d-muted);transition:background .14s,color .14s;flex:none}
.m3d-selrow-x:hover{background:color-mix(in srgb,var(--m3d-text) 12%,transparent);
  color:var(--m3d-text)}
/* Pied du panneau : rappel des modificateurs — vit et meurt avec la liste. */
.m3d-selfoot{border-top:1px solid var(--m3d-border);padding-top:6px;
  display:flex;flex-direction:column;gap:3px}
/* Poignées : blanches à bord sombre (Figma/Illustrator) — lisibles partout. */
.m3d-handle{fill:#fff;stroke:rgba(0,0,0,.65);stroke-width:1.2;pointer-events:all;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
.m3d-handle:hover{fill:var(--m3d-accent);stroke:#fff}
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
.react-tooltip{z-index:60}

/* Scrollbar du thème, pour toutes les zones scrollables des surfaces flottantes —
   déclarée une fois : les cinq listes doivent rester visuellement identiques. */
.m3d-stylepanel,.m3d-settings-list,.m3d-settings-sub,.m3d-taglist,.m3d-search-results{
  scrollbar-width:thin;
  scrollbar-color:color-mix(in srgb,var(--m3d-text) 25%,transparent) transparent}

.m3d-panel{background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-lg);box-shadow:var(--m3d-shadow-md);
  backdrop-filter:blur(20px);color:var(--m3d-text)}

/* Barres : toute la géométrie est proportionnelle à --m3d-bar-scale, que
   useFitColumns réduit quand la carte est trop courte (puis passe en colonnes).
   Variable absente = 1 : aucun effet hors barre. */
.m3d-controls{position:absolute;top:50%;transform:translateY(-50%);z-index:20;
  display:flex;flex-direction:column;gap:calc(9px * var(--m3d-bar-scale,1));
  align-items:center;align-content:flex-start}
.m3d-controls.m3d-right{right:${BAR_INSET}px}
.m3d-controls.m3d-left{left:${BAR_INSET}px}
.m3d-controls-group{display:flex;flex-direction:column;gap:2px;
  padding:calc(5px * var(--m3d-bar-scale,1));
  background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-md);box-shadow:var(--m3d-shadow-sm);backdrop-filter:blur(20px)}
.m3d-btn{width:calc(38px * var(--m3d-bar-scale,1));height:calc(38px * var(--m3d-bar-scale,1));
  border:none;background:transparent;border-radius:9px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--m3d-text);
  transition:background .14s}
.m3d-btn:hover{background:color-mix(in srgb,var(--m3d-text) 12%,transparent)}
.m3d-btn.m3d-on{background:var(--m3d-accent);color:#fff}
/* :focus-visible ne s'active qu'au clavier (pas au clic) : indispensable pour
   naviguer les barres à la tabulation (WCAG 2.4.7). */
.m3d-btn:focus-visible,.m3d-flyout-item:focus-visible,.m3d-preset:focus-visible,
.m3d-palette-dot:focus-visible,.m3d-swatch:focus-visible,.m3d-swap:focus-visible,
.m3d-settings-toolhead:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:1px}
.m3d-btn:disabled{opacity:.35;cursor:default;background:transparent}
.m3d-btn-move{margin-bottom:calc(4px * var(--m3d-bar-scale,1))}
.m3d-btn-delete{margin-top:calc(4px * var(--m3d-bar-scale,1)); color:var(--m3d-error)}

/* Barre d'outils de dessin : sous le zoom minimal elle glisse hors écran
   (translateY conserve le centrage vertical pendant la transition). */
.m3d-drawbar{position:absolute;top:50%;z-index:20;display:flex;flex-direction:column;
  align-content:flex-start;gap:calc(2px * var(--m3d-bar-scale,1));
  padding:calc(6px * var(--m3d-bar-scale,1));
  background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-lg);box-shadow:var(--m3d-shadow-sm);backdrop-filter:blur(20px);
  transform:translateY(-50%);
  transition:transform .28s cubic-bezier(.4,0,.2,1),opacity .28s}
.m3d-drawbar.m3d-left{left:${BAR_INSET}px}
.m3d-drawbar.m3d-right{right:${BAR_INSET}px}
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
.m3d-flyout{position:absolute;top:0;display:flex;flex-direction:column;gap:2px;padding:5px;z-index:30;
  min-width:150px;animation:m3d-menu-in var(--m3d-menu-dur,200ms) cubic-bezier(.32,1.3,.5,1) backwards}
.m3d-flyout.m3d-left{left:calc(100% + ${GAP}px)}
.m3d-flyout.m3d-right{right:calc(100% + ${GAP}px)}
.m3d-flyout.m3d-left::before{content:'';position:absolute;left:-14px;top:0;bottom:0;width:14px}
.m3d-flyout.m3d-right::before{content:'';position:absolute;right:-14px;top:0;bottom:0;width:14px}
.m3d-flyout-item{display:flex;align-items:center;gap:9px;padding:8px 10px;border:none;
  background:transparent;border-radius:8px;font-family:inherit;font-size:12.5px;cursor:pointer;
  color:var(--m3d-text);text-align:left;transition:background .14s}
.m3d-flyout-item:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-flyout-item.m3d-on{background:var(--m3d-accent);color:#fff}
.m3d-flyout-label{flex:1;white-space:nowrap}
.m3d-kbd{font-family:inherit;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;
  border:1px solid color-mix(in srgb,currentColor 35%,transparent);opacity:.75;line-height:1.5}

/* Panneau de style : à côté de la drawbar (défauts de l'outil actif OU restyle de
   la sélection). Swatches fond/bordure superposés façon Photoshop + palette +
   presets visuels (épaisseur, style de trait, opacité, angles). */
.m3d-stylepanel{position:absolute;top:50%;transform:translateY(-50%);z-index:19;
  width:212px;padding:11px;display:flex;flex-direction:column;gap:9px;overflow-y:auto;
  animation:m3d-style-in var(--m3d-menu-dur,200ms) cubic-bezier(.32,1.3,.5,1) backwards}
/* Décalé de la largeur RÉELLE de la drawbar (publiée par useFitColumns) : en deux
   colonnes elle double, et un offset figé la ferait recouvrir. */
.m3d-stylepanel.m3d-left{left:calc(${BAR_INSET + GAP}px + var(--m3d-drawbar-w,52px));--m3d-fly-dx:-10px}
.m3d-stylepanel.m3d-right{right:calc(${BAR_INSET + GAP}px + var(--m3d-drawbar-w,52px));--m3d-fly-dx:10px}
/* Fermeture = animation inverse (le composant reste monté le temps de la jouer).
   Les keyframes embarquent le translateY(-50%) de centrage, sinon il sauterait. */
.m3d-stylepanel.m3d-closing{animation:m3d-style-out var(--m3d-menu-dur,200ms) ease-in forwards}
@keyframes m3d-style-in{from{opacity:0;transform:translateY(-50%) translateX(var(--m3d-fly-dx,-10px)) scale(.97)}
  to{opacity:1;transform:translateY(-50%)}}
@keyframes m3d-style-out{from{opacity:1;transform:translateY(-50%)}
  to{opacity:0;transform:translateY(-50%) translateX(var(--m3d-fly-dx,-10px)) scale(.97)}}
.m3d-style-head{display:flex;align-items:center;gap:12px}
.m3d-style-title{font-size:11.5px;color:var(--m3d-muted)}
.m3d-swatches{position:relative;width:46px;height:46px;flex:none}
.m3d-swatch{position:absolute;width:28px;height:28px;border-radius:7px;padding:0;cursor:pointer;
  border:2px solid var(--m3d-panel);box-shadow:0 0 0 1px var(--m3d-border)}
.m3d-swatch-fill{left:0;top:0;z-index:2}
.m3d-swatch-stroke{right:0;bottom:0;z-index:1;background:transparent}
.m3d-swatch-stroke span{position:absolute;inset:1px;border:5px solid;border-radius:5px;display:block}
.m3d-swatch.m3d-active{outline:2px solid var(--m3d-accent);outline-offset:1px;z-index:3}
.m3d-swap{position:absolute;right:-3px;top:-5px;z-index:4;width:18px;height:18px;padding:0;
  display:flex;align-items:center;justify-content:center;border:none;border-radius:50%;
  background:var(--m3d-panel);color:var(--m3d-muted);cursor:pointer;box-shadow:0 0 0 1px var(--m3d-border)}
.m3d-swap:hover{color:var(--m3d-text)}
.m3d-palette{display:flex;gap:6px;flex-wrap:wrap}
.m3d-palette-dot{width:22px;height:22px;border-radius:50%;padding:0;cursor:pointer;
  border:2px solid color-mix(in srgb,#fff 30%,transparent);transition:transform .12s}
.m3d-palette-dot:hover{transform:scale(1.15)}
.m3d-palette-custom{background:conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);
  position:relative;overflow:hidden;display:block}
.m3d-palette-custom input{position:absolute;inset:0;opacity:0;cursor:pointer}
.m3d-style-row{display:flex;align-items:center;gap:8px}
.m3d-style-label{font-size:11px;color:var(--m3d-muted);width:42px;flex:none}
.m3d-presets{display:flex;gap:3px;flex:1;min-width:0}
.m3d-preset{flex:1;height:26px;min-width:0;display:flex;align-items:center;justify-content:center;
  border:1px solid var(--m3d-border);background:transparent;border-radius:6px;cursor:pointer;
  color:var(--m3d-text);padding:0;transition:background .14s,border-color .14s}
.m3d-preset:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-preset.m3d-on{border-color:var(--m3d-accent);
  background:color-mix(in srgb,var(--m3d-accent) 20%,transparent)}
.m3d-preset-bar{display:block;width:64%;border-radius:99px;background:currentColor;min-height:1.5px}
.m3d-preset-none{font-size:13px;opacity:.7;line-height:1}
.m3d-preset-line{display:block;width:64%;border-top:2px solid currentColor}
.m3d-preset-checker{width:16px;height:16px;border-radius:4px;overflow:hidden;position:relative;
  background:repeating-conic-gradient(color-mix(in srgb,var(--m3d-text) 30%,transparent) 0% 25%,transparent 0% 50%) 0 0/8px 8px;
  box-shadow:inset 0 0 0 1px var(--m3d-border)}
.m3d-preset-checker span{position:absolute;inset:0;background:currentColor;display:block}
.m3d-preset-corner{width:13px;height:13px;border-top:2px solid currentColor;
  border-left:2px solid currentColor;display:block}

/* Panneau « Réglages des outils » : ancré au bouton engrenage de la drawbar,
   une ligne par outil (aperçu live) + ligne « Raccourcis clavier ». Chaque ligne
   ouvre un SOUS-PANNEAU latéral (éditeur de style / liste des raccourcis) du côté
   opposé à la barre, aligné sur la ligne — jamais coupé par le scroll de la liste.
   Ancré en bas → grandit vers le haut (le bouton est en bas de barre). */
.m3d-settingswrap{position:relative}
.m3d-settings{position:absolute;bottom:0;width:252px;padding:10px;z-index:30;
  display:flex;flex-direction:column;gap:8px;
  animation:m3d-menu-in var(--m3d-menu-dur,200ms) cubic-bezier(.32,1.3,.5,1) backwards}
.m3d-settings.m3d-left{left:calc(100% + ${GAP}px)}
.m3d-settings.m3d-right{right:calc(100% + ${GAP}px)}
.m3d-settings-head{display:flex;align-items:center;justify-content:space-between;
  font-size:12.5px;font-weight:600;padding:2px 2px 0}
.m3d-settings-reset{display:flex;align-items:center;justify-content:center;width:26px;height:26px;
  border:none;border-radius:7px;background:transparent;color:var(--m3d-muted);cursor:pointer}
.m3d-settings-reset:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent);color:var(--m3d-text)}
.m3d-settings-list{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
.m3d-settings-toolhead{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;
  border:none;border-radius:8px;background:transparent;color:var(--m3d-text);cursor:pointer;
  font-family:inherit;font-size:12.5px;text-align:left;transition:background .14s}
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
.m3d-settings-sub{position:absolute;width:212px;padding:11px;z-index:31;
  display:flex;flex-direction:column;gap:9px;overflow-y:auto;
  animation:m3d-menu-in var(--m3d-menu-dur,200ms) cubic-bezier(.32,1.3,.5,1) backwards}
/* 12px comme toutes les surfaces ancrées : c'est l'écart que le GAP de panelFit
   suppose pour calculer la place disponible de chaque côté. */
.m3d-settings-sub.m3d-left{left:calc(100% + ${GAP}px)}
.m3d-settings-sub.m3d-right{right:calc(100% + ${GAP}px)}
.m3d-settings-subtitle{font-size:11px;font-weight:600;color:var(--m3d-muted);
  text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
.m3d-shortcuts{display:flex;flex-direction:column;gap:3px}
.m3d-shortcut-row{display:flex;align-items:center;justify-content:space-between;
  font-size:11.5px;color:var(--m3d-text)}
.m3d-shortcut-sep{border-top:1px solid var(--m3d-border);margin:5px 0}

/* Panneau « Couches » (filtre par tag) : ancré au groupe du bouton, ouvert du
   côté opposé à la barre (m3d-right = barre à droite → panneau à gauche).
   Les top / max-height ci-dessous ne sont que des valeurs de départ : useAnchoredPanel
   les recalcule (styles inline) pour que le panneau reste dans le conteneur de carte,
   et bascule de côté si la place manque. */
.m3d-tags{position:relative}
.m3d-tagbtn{position:relative}
.m3d-tag-badge{position:absolute;top:-10px;right:-10px;min-width:15px;height:15px;padding:0 4px;
  border-radius:8px;background:var(--m3d-accent);color:#fff;font-size:9.5px;font-weight:700;
  display:flex;align-items:center;justify-content:center;pointer-events:none;
  box-shadow:0 0 0 2px var(--m3d-panel)}
.m3d-btn.m3d-on .m3d-tag-badge{background:#fff;color:var(--m3d-accent)}
.m3d-tagpanel{position:absolute;top:0;width:236px;padding:8px;z-index:30;
  display:flex;flex-direction:column;gap:7px;
  animation:m3d-menu-in var(--m3d-menu-dur,200ms) cubic-bezier(.32,1.3,.5,1) backwards}
.m3d-tagpanel.m3d-right{right:calc(100% + ${GAP}px)}
.m3d-tagpanel.m3d-left{left:calc(100% + ${GAP}px)}
.m3d-tagsearch{display:flex;align-items:center;gap:2px;padding:7px 9px;
  border:1px solid var(--m3d-border);border-radius:9px;color:var(--m3d-muted)}
.m3d-tagsearch input{border:none;background:none;outline:none;flex:1;min-width:0;
  font-family:inherit;font-size:12.5px;color:var(--m3d-text)}
/* Seule la liste scrolle : recherche (au-dessus) et « Tout afficher » (en dessous)
   restent visibles quand le panneau atteint sa hauteur max. */
.m3d-taglist{display:flex;flex-direction:column;gap:1px;flex:1 1 auto;min-height:0;overflow-y:auto}
.m3d-tagrow{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;
  cursor:pointer;font-size:12.5px;user-select:none}
.m3d-tagrow:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
/* Checkbox custom au style du thème (case arrondie + coche dessinée en CSS). */
.m3d-tagrow input{appearance:none;-webkit-appearance:none;margin:0;flex:none;cursor:pointer;
  width:15px;height:15px;border:1.5px solid color-mix(in srgb,var(--m3d-text) 35%,transparent);
  border-radius:5px;background:transparent;display:grid;place-items:center;
  transition:background .14s,border-color .14s}
.m3d-tagrow:hover input{border-color:color-mix(in srgb,var(--m3d-text) 55%,transparent)}
.m3d-tagrow input:checked{background:var(--m3d-accent);border-color:var(--m3d-accent)}
.m3d-tagrow input::after{content:'';width:8px;height:4.5px;margin-top:-1.5px;opacity:0;
  border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg) scale(.5);
  transition:opacity .12s,transform .12s}
.m3d-tagrow input:checked::after{opacity:1;transform:rotate(-45deg) scale(1)}
.m3d-tagrow input:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:2px}
.m3d-tagdot{width:9px;height:9px;border-radius:50%;flex:none}
.m3d-taglabel{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m3d-tagcount{font-size:10.5px;color:var(--m3d-muted);font-variant-numeric:tabular-nums}
.m3d-tagempty{padding:10px 8px;font-size:12px;color:var(--m3d-muted);text-align:center}
/* width:100% : un <button> ne s'étire pas seul hors parent flex (panneau recherche). */
.m3d-tagclear{display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 9px;width:100%;margin-top:6px;
  border:1px solid var(--m3d-border);border-radius:9px;background:transparent;cursor:pointer;
  font-family:inherit;font-size:12px;color:var(--m3d-text);transition:background .14s}
.m3d-tagclear:hover:not(:disabled){background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-tagclear:disabled{opacity:.45;cursor:default}

.m3d-search{position:absolute;left:16px;top:16px;z-index:20;width:270px}
.m3d-search-box{display:flex;align-items:center;gap:9px;padding:11px 13px;
  background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-md);box-shadow:var(--m3d-shadow-sm);backdrop-filter:blur(20px)}
.m3d-search-box input{border:none;background:none;outline:none;flex:1;min-width:0;
  font-family:inherit;font-size:13.5px;color:var(--m3d-text)}
.m3d-search-box input::-webkit-search-cancel-button{-webkit-appearance:none;display:none}
.m3d-search-icon{color:var(--m3d-muted);flex:none}
.m3d-search-clear{border:none;background:none;padding:0;display:flex;align-items:center;
  cursor:pointer;color:var(--m3d-muted)}
.m3d-search-clear:hover{color:var(--m3d-text)}
.m3d-search-results{margin-top:7px;padding:5px;overflow-y:auto}
.m3d-search-item{display:flex;align-items:center;gap:10px;padding:9px 10px;
  border-radius:9px;cursor:pointer;font-size:13px}
/* Survol ET surbrillance clavier (↑/↓) partagent le même état visuel. */
.m3d-search-item:hover,.m3d-search-item.m3d-active{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-search-text{min-width:0}
.m3d-search-text b{display:block;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m3d-search-text small{display:block;font-size:11px;color:var(--m3d-muted);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m3d-search-empty{padding:10px;font-size:12px;color:var(--m3d-muted);text-align:center}
.m3d-search-subtitle{padding:4px 10px 0}

.m3d-menu{position:absolute;z-index:95;pointer-events:none;will-change:transform}
/* flex column + align-content : support du passage en colonnes (useFitColumns)
   quand le menu est plus haut que la carte. */
.m3d-menu-panel{position:absolute;left:14px;top:-14px;min-width:186px;padding:5px;
  display:flex;flex-direction:column;align-content:flex-start;
  background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-md);box-shadow:var(--m3d-shadow-lg);pointer-events:auto;
  animation:m3d-menu-in var(--m3d-menu-dur,200ms) cubic-bezier(.32,1.3,.5,1) backwards}
.m3d-menu-item{display:flex;align-items:center;gap:9px;padding:7px 10px;
  border-radius:8px;font-size:12.5px;cursor:pointer;user-select:none;color:var(--m3d-text);
  position:relative}
.m3d-menu-item:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-menu-item .m3d-menu-icon{width:17px;text-align:center;flex:none}
.m3d-menu-item .m3d-menu-label{flex:1}
.m3d-menu-item .m3d-menu-arrow{font-size:10px;color:var(--m3d-muted)}
.m3d-menu-sep{height:1px;background:var(--m3d-border);margin:4px 6px}
/* Sous-menu : à droite du parent, ou à gauche (m3d-flip, posé par useNudgeInside)
   quand le bord du conteneur est trop proche. Le panneau ne prend NI overflow NI
   max-height : ils clipperaient les sous-menus — il est rabattu par marges. */
.m3d-menu-sub{position:absolute;left:100%;top:-5px;margin-left:3px}
.m3d-menu-sub.m3d-flip{left:auto;right:100%;margin-left:0;margin-right:3px}


/* ── Drag-and-drop générique (engine.drag) ─────────────────────────────────
   Élément saisissable : touch-action none pour que le long-press tactile ne
   soit pas avalé par le scroll. Le curseur reste celui de l'élément (pointer). */
.m3d-draggable{touch-action:none}
/* Drag en cours : curseur de préhension partout + pas de sélection de texte
   parasite pendant qu'on glisse. */
.m3d-root.m3d-dragging,.m3d-root.m3d-dragging *{cursor:grabbing!important;user-select:none}
/* Ghost accroché au curseur : positionné en px conteneur (left/top posés inline),
   centré sur le point, transparent aux événements (le hit-test DOM voit à travers).
   Les marges négatives de recentrage des icônes marker sont annulées → translate
   centre n'importe quel contenu (icône marker OU pastille de dock). */
.m3d-drag-ghost{position:absolute;z-index:200;pointer-events:none;
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

/* ── Dock des favoris épinglés (PinnedDock) ────────────────────────────────
   Barre ancrée en bas à gauche (largeur bornée, même marge des deux côtés) ;
   repliable en une pastille compacte. Chaque état (barre / pastille) apparaît
   avec un petit « pop » — l'animation se rejoue à la bascule (élément remonté). */
.m3d-pindock{position:absolute;left:16px;bottom:16px;z-index:20;max-width:calc(100% - 32px);
  display:flex;align-items:center;gap:10px;padding:10px;overflow:visible;box-sizing:border-box;
  background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-lg);box-shadow:var(--m3d-shadow-md);backdrop-filter:blur(20px);
  transform-origin:bottom left;animation:m3d-pindock-in .24s cubic-bezier(.32,1.25,.5,1) backwards}
@keyframes m3d-pindock-in{from{opacity:0;transform:translateY(8px) scale(.9)}}
/* Cible de dépôt active : liseré accent en pointillé + voile teinté. */
.m3d-pindock-over{border-color:var(--m3d-accent);border-style:dashed;
  background:color-mix(in srgb,var(--m3d-accent) 14%,var(--m3d-panel))}
/* Bouton « réduire » à droite de la barre déployée. */
.m3d-pindock-toggle{flex:none;align-self:stretch;display:flex;align-items:center;justify-content:center;
  width:20px;padding:0;border:none;background:transparent;cursor:pointer;
  color:var(--m3d-muted);border-radius:10px;transition:background .14s,color .14s}
.m3d-pindock-toggle:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent);color:var(--m3d-text)}
.m3d-pindock-toggle:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:1px}
/* Repliée : pastille compacte (épingle + compteur + chevron), cliquable. */
.m3d-pindock-collapsed{-webkit-appearance:none;appearance:none;font:inherit;cursor:pointer;
  gap:7px;padding:9px 12px;color:var(--m3d-text)}
.m3d-pindock-collapsed:hover{background:color-mix(in srgb,var(--m3d-text) 6%,var(--m3d-panel))}
.m3d-pindock-collapsed:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:1px}
.m3d-pindock-count{min-width:18px;height:18px;padding:0 5px;border-radius:9px;
  background:var(--m3d-accent);color:#fff;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;
  display:flex;align-items:center;justify-content:center}
.m3d-pindock-chev{color:var(--m3d-muted)}
/* Languette d'invite : carré pointillé « + Ajouter un marqueur », le libellé
   revient à la ligne. Léger grossissement au survol. */
.m3d-pindock-add{flex:none;box-sizing:border-box;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  padding:8px;border:1.5px dashed color-mix(in srgb,var(--m3d-text) 22%,transparent);
  border-radius:18px;color:var(--m3d-muted);
  transition:transform .12s cubic-bezier(.2,.8,.3,1),border-color .12s,color .12s}
.m3d-pindock-add:hover{transform:scale(1.04);color:var(--m3d-text)}
.m3d-pindock-over .m3d-pindock-add{border-color:var(--m3d-accent);color:var(--m3d-accent)}
.m3d-pindock-addlabel{font-size:11px;font-weight:600;text-align:center;line-height:1.25}
/* Liste des pastilles : défile en X quand elle dépasse la largeur bornée. padding
   + margin opposés = le grossissement au survol (-3px) n'est pas rogné par le clip. */
.m3d-pindock-items{display:flex;align-items:center;gap:10px;min-width:0;
  overflow-x:auto;overflow-y:hidden;padding:8px 16px;margin:-8px;
  scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--m3d-text) 25%,transparent) transparent;
  /* Fondu doux aux deux bords : les pastilles qui débordent s'estompent. */
  -webkit-mask-image:linear-gradient(to right,transparent 0,#000 18px,#000 calc(100% - 18px),transparent 100%);
  mask-image:linear-gradient(to right,transparent 0,#000 18px,#000 calc(100% - 18px),transparent 100%)}

/* Carré épinglé : vignette arrondie (avatar/icône), croix de retrait dedans en
   haut-droite ; saisissable (glisser-hors = retrait). */
.m3d-pin{position:relative;flex:none;box-sizing:border-box;padding:0;border:none;
  border-radius:10px;overflow:hidden;cursor:pointer;background:var(--m3d-panel);
  box-shadow:0 0 0 1px var(--m3d-border),0 2px 8px rgba(0,0,0,.28);
  transition:transform .12s cubic-bezier(.2,.8,.3,1)}
.m3d-pin:hover{transform:translateY(-3px) scale(1.04)}
.m3d-pin:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:2px}
/* Média de la vignette : avatar en cover (remplit), badge coloré sinon. */
.m3d-pin-media{width:100%;height:100%;display:block}
img.m3d-pin-media{object-fit:cover}
.m3d-pin-badge{display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;line-height:1}
.m3d-pin-badge img{width:62%;height:62%;object-fit:contain}
/* Légende (titre) posée EN BAS par-dessus la vignette, sur un dégradé sombre —
   l'info « c'est quoi » lisible d'un coup d'œil. UNE seule ligne : le texte trop
   long défile au survol (marquee CSS, sans <marquee> déprécié). container-type +
   cqw = mesure la largeur visible ; min(0px, cqw - largeurTexte) ne défile QUE
   si le texte déborde réellement (sinon 0 → immobile). */
/* Voile sombre : couvre TOUTE la largeur (jamais masqué) → jusqu'au bord droit. */
.m3d-pin-caption{position:absolute;left:0;right:0;bottom:0;padding:34px 10px 6px;
  background:linear-gradient(to top,rgba(0,0,0,.88),rgba(0,0,0,.5) 42%,rgba(0,0,0,.16) 72%,transparent);
  pointer-events:none;overflow:hidden}
/* Couche du TEXTE : c'est ELLE (pas le voile) qui porte le fondu à droite + le
   clip du défilement. container-type ici → 100cqw = largeur de texte visible. */
.m3d-pin-caption-clip{display:block;overflow:hidden;container-type:inline-size;
  -webkit-mask-image:linear-gradient(to right,#000 calc(100% - 24px),transparent);
  mask-image:linear-gradient(to right,#000 calc(100% - 34px),transparent)}
.m3d-pin-caption-text{display:inline-block;white-space:nowrap;
  font-size:10px;font-weight:600;line-height:1.2;color:#fff}
/* Défile au survol seulement si ça déborde ; s'arrête en laissant ~22px de marge
   à droite → la fin du titre reste NETTE (hors de la zone de fondu). */
.m3d-pin:hover .m3d-pin-caption-text,
.m3d-pin:focus-within .m3d-pin-caption-text{
  animation:m3d-caption-scroll 4.5s linear infinite alternate}
@keyframes m3d-caption-scroll{
  0%,12%{transform:translateX(0)}
  88%,100%{transform:translateX(min(0px,calc(100cqw - 100% - 34px)))}}
/* Croix de retrait : dans le coin haut-droit à 6px, révélée au survol/focus. */
.m3d-pin-x{position:absolute;top:6px;right:6px;width:20px;height:20px;padding:0;
  display:flex;align-items:center;justify-content:center;border:none;border-radius:50%;
  background:color-mix(in srgb,#000 55%,transparent);color:#fff;cursor:pointer;
  backdrop-filter:blur(4px);opacity:0;transform:scale(.6);
  transition:opacity .12s,transform .12s,background .12s}
.m3d-pin:hover .m3d-pin-x,.m3d-pin:focus-within .m3d-pin-x{opacity:1;transform:scale(1)}
.m3d-pin-x:hover{background:var(--m3d-error)}
/* Ghost d'une pastille en cours de retrait : tooltip « Supprimer » au-dessus,
   visible UNIQUEMENT hors d'une cible acceptée (façon dock macOS). */
.m3d-pin-remove-hint{position:absolute;left:50%;top:0;transform:translate(-50%,calc(-100% - 8px));
  padding:3px 10px;border-radius:7px;background:var(--m3d-error);color:#fff;
  font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.35);
  opacity:0;transition:opacity .12s;pointer-events:none}
.m3d-drag-ghost:not(.m3d-drag-over) .m3d-pin-remove-hint{opacity:1}

/* Infobulle au survol d'une pastille : rendue en PORTAL dans .m3d-root (hors du
   conteneur scrollable, sinon rognée). Elle porte AUSSI la classe .m3d-markertip
   → elle hérite du fond/bordure/min-max-width des infobulles de markers (et donc
   de tout override hôte). Ici on ne surcharge QUE le positionnement (left/top
   inline via le portail + lift) et l'animation. */
.m3d-pin-tip{z-index:100;transform:translate(-50%,calc(-100% - 12px));
  animation:m3d-fade-in .16s ease-out}
@keyframes m3d-fade-in{from{opacity:0}}

/* Pendant un drag, les pastilles sous le curseur ne réagissent pas — on dépose
   librement n'importe où dans la dock : ni croix de retrait, ni grossissement,
   ni infobulle du voisin survolé. */
.m3d-root.m3d-dragging .m3d-pin:hover{transform:none}
.m3d-root.m3d-dragging .m3d-pin-x{opacity:0!important;pointer-events:none}
.m3d-root.m3d-dragging .m3d-pin-tip{display:none}

@media(prefers-reduced-motion:reduce){
  .m3d-root *{animation-duration:.001ms!important;animation-iteration-count:1!important}
}
`
