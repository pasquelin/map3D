import { mdiRotateRight } from '@mdi/js'
import { BAR_INSET, GAP, LENS_PANEL_W, SELECTION_PANEL_W } from './panelGeometry'

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
//
// C'est le module NEUF qu'on appelle, jamais `injectStyles` directement : ce
// callback appartient à l'ancien module, sa closure capture donc l'ANCIENNE
// constante `CSS`. L'appeler réécrivait la feuille d'avant la modification —
// autrement dit le HMR annulait précisément ce qu'il devait propager, et le
// symptôme (« mon CSS ne bouge pas ») semblait venir du navigateur.
type StyleModule = { injectStyles: (doc?: Document) => void }
const hot = (import.meta as ImportMeta & { hot?: { accept: (cb: (mod?: StyleModule) => void) => void } }).hot
if (hot) hot.accept((mod) => mod?.injectStyles())

const CSS = `
.m3d-root{position:relative;width:100%;height:100%;overflow:hidden;
  font-family:var(--m3d-font);color:var(--m3d-text);background:var(--m3d-bg);
  -webkit-font-smoothing:antialiased;
  /* Poignées de manipulation, définies UNE fois pour les deux implémentations :
     .m3d-handle (rect SVG, sélection géo-ancrée) et .m3d-lenszone-h (span DOM,
     zone écran de la loupe). Les propriétés diffèrent par force (fill/stroke vs
     background/border), les VALEURS non — ces tokens sont l'unique source. */
  --m3d-handle-bg:#fff;
  --m3d-handle-line:rgba(0,0,0,.65);
  --m3d-handle-line-w:1.2px;
  --m3d-handle-shadow:0 1px 2px rgba(0,0,0,.45)}
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

/* Sprite d'ancre — PARTAGÉ par le marker et le cluster par défaut : carré centré
   sur son point d'ancrage (marges négatives), dont seule la TAILLE varie. Elle
   arrive par --m3d-sprite, posée en inline par le composant (même convention que
   --m3d-tiplift et --m3d-selring) : le reste n'a plus à être répété en JS.
   Le SVG interne reste en overflow visible : halos, anneaux et satellites
   débordent volontairement de la boîte. */
.m3d-marker,.m3d-cluster{position:relative;cursor:pointer;
  width:var(--m3d-sprite);height:var(--m3d-sprite);
  margin:calc(var(--m3d-sprite) / -2) 0 0 calc(var(--m3d-sprite) / -2)}
.m3d-marker > svg,.m3d-cluster > svg{width:100%;height:100%;display:block;overflow:visible}

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

/* Étiquette d'un lien de relation : même gabarit que le label de la règle — un
   chiffre posé sur la carte doit se lire pareil quelle que soit sa provenance. */
.m3d-link-label{position:absolute;left:0;top:0;background:var(--m3d-panel);
  color:var(--m3d-text);border:1px solid var(--m3d-border);backdrop-filter:blur(12px);
  font-size:10.5px;font-weight:600;font-variant-numeric:tabular-nums;padding:3px 9px;
  border-radius:var(--m3d-radius-pill);white-space:nowrap;box-shadow:var(--m3d-shadow-sm);
  display:flex;align-items:center;
  /* Interactive : elle porte la croix de fermeture. Le reste du texte ne capte
     rien d'utile, mais laisser l'étiquette transparente aux clics empêcherait
     d'atteindre le bouton. */
  pointer-events:auto}
/* ── Bouton « supprimer » PARTAGÉ (cf. core/removeButton + <RemoveButton>) ──
   Rouge partout : socle de relation, pastilles du dock, indice de retrait au drag.
   Une seule définition — le style ne peut pas diverger d'un usage à l'autre. */
.m3d-remove{display:inline-flex;align-items:center;justify-content:center;gap:4px;
  padding:0;border:none;border-radius:var(--m3d-radius-pill);cursor:pointer;
  font:inherit;font-size:11.5px;font-weight:600;line-height:1;white-space:nowrap;
  background:var(--m3d-error);color:#fff;
  transition:background-color .12s ease,transform .12s ease,opacity .12s ease}
/* Survol : le MÊME rouge, assombri. Un filter brightness ternirait aussi l'icône
   et le texte blancs ; en n'assombrissant que le fond, le contraste est préservé.
   Dérivé de --m3d-error, donc un thème qui redéfinit le rouge emporte le survol. */
.m3d-remove:hover{background:color-mix(in srgb,var(--m3d-error) 78%,#000)}
.m3d-remove svg{width:14px;height:14px;flex:none;display:block}
/* Libellé masqué quand vide : le même bouton sert en icône seule ou avec texte. */
.m3d-remove .m3d-remove-text:empty{display:none}
.m3d-remove:not(:has(.m3d-remove-text:empty)){padding:4px 10px 4px 7px}
.m3d-remove:has(.m3d-remove-text:empty){width:22px;height:22px}

/* Curseur de sélection dès qu'un trait est sous le pointeur : c'est le signal qui
   rend les liens découvrables comme cliquables. */
.m3d-hover-link canvas{cursor:pointer}
/* Badge de rang : le classement se lit en clair, il n'est jamais encodé dans le trait. */
.m3d-link-rank{display:inline-flex;align-items:center;justify-content:center;
  min-width:15px;height:15px;padding:0 3px;border-radius:var(--m3d-radius-pill);
  background:color-mix(in srgb,var(--m3d-text) 12%,transparent);font-size:9.5px;margin-right:8px;}

/* Conteneur d'un socle en mode slot : un POINT, exactement au centre du disque.
   Largeur et hauteur nulles ASSUMÉES — son contenu déborde symétriquement grâce au
   flex centré. C'est ce qui le rend utilisable comme ancre : un conteneur à la taille
   de son contenu fausserait le calcul de place disponible, et la barre basculerait de
   côté sans raison.
   Le retrait hors de l'emprise du marker est porté ICI, en padding, et non par une
   marge du contenu : le padding entre dans le clientWidth de l'ancre, donc le calcul
   de place disponible du hook le voit. Posé sur le contenu, il aurait été ignoré, et
   la barre aurait basculé de côté en croyant manquer de place. */
.m3d-link-anchor{position:absolute;left:0;top:0;width:0;height:0;
  padding:0 0 0 var(--m3d-hub-offset,26px);
  display:flex;align-items:center;overflow:visible;pointer-events:none;
  /* Montée dans la surface des markers (cf. LinkLayer.slotHost), l'ancre partage leur
     contexte d'empilement. CSS2DRenderer y écrit un z-index de 1 à N (N = nombre de
     markers rendus) pour les trier par profondeur : un plafond franc met la barre
     devant eux quel qu'en soit le nombre, là où toute valeur proche de N dépendrait
     de la densité de la carte. */
  z-index:9999}
/* Seul le contenu est cliquable : l'ancre elle-même ne doit rien intercepter. */
.m3d-link-anchor > *{pointer-events:auto}

/* Barre d'état d'une relation : ancrée au socle de SON marker source, à la place
   qu'occupait la croix de suppression. La commande se trouve ainsi là où le regard
   est déjà, et chaque barre dit sans ambiguïté de quelle relation elle parle — ce
   qu'une barre unique flottant dans un coin ne pouvait pas faire.
   Les segments sont des boutons — la barre informe ET pilote. */
.m3d-relbar{position:relative;z-index:6;
  display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;
  /* Enfant d'une ancre de largeur nulle : sans cela le flex la comprimerait. */
  flex:none;
  background:var(--m3d-panel);border:1px solid var(--m3d-border);backdrop-filter:blur(12px);
  border-radius:var(--m3d-radius-pill);box-shadow:var(--m3d-shadow-sm);
  font-size:12px;color:var(--m3d-text);white-space:nowrap}
/* Pas la place à droite : la barre passe de l'autre côté du socle plutôt que d'être
   coupée par le bord du conteneur. Le hook de placement (useNudgeInside) en décide
   sur la place réelle autour de l'ANCRE — jamais sur la position courante, qui
   oscillerait — et écrit par ailleurs la marge corrective verticale. */
.m3d-relbar.m3d-flip{transform:translateX(calc(-100% - 2 * var(--m3d-hub-offset,26px)))}
.m3d-relbar-swatch{width:9px;height:9px;border-radius:50%;flex:none}
.m3d-relbar-text{font-weight:600}
.m3d-relbar-scope{color:var(--m3d-muted)}
/* Le menu est le FRÈRE du bouton, jamais son enfant : un menuitem focusable dans un
   <button> est du HTML invalide, et le contenu du menu entrerait dans le nom
   accessible du bouton. C'est donc le wrapper qui porte le repère de position. */
.m3d-relbar-segwrap{position:relative;display:inline-flex}
.m3d-relbar-seg{font:inherit;color:inherit;cursor:pointer;
  padding:3px 9px;border:1px solid var(--m3d-border);border-radius:var(--m3d-radius-pill);
  background:color-mix(in srgb,var(--m3d-text) 5%,transparent)}
.m3d-relbar-seg:hover{background:color-mix(in srgb,var(--m3d-text) 10%,transparent)}
/* Le menu d'un segment s'ouvre VERS LE HAUT : la barre est collée au bas de la carte. */
.m3d-relbar-menu{position:absolute;left:0;bottom:100%;margin-bottom:6px;
  display:block;text-align:left;cursor:default}
/* La barre n'a plus de bouton propre : effacer une relation passe par le bouton
   partagé (.m3d-remove), comme sur le socle et dans la dock. */

/* Overlay SVG de l'outil sélection : contours marching-ants, bbox, marquee/lasso.
   pointer-events:none — le SVG n'intercepte rien, seules les poignées (plus tard)
   réactivent les événements. Tout est en px écran, resynchronisé chaque frame. */
.m3d-edit-svg{position:absolute;inset:0;width:100%;height:100%;z-index:15;
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

/* APPARENCE des infobulles de barre (react-tooltip), au langage visuel de
   .m3d-markertip (panneau thémé) plutôt qu'au gris #222 par défaut du paquet.
   Répartition des responsabilités, à ne pas confondre :
   — react-tooltip injecte LUI-MÊME, au runtime, ses styles « core » (position,
     opacité 0 → show, transitions, variables --rt-*). On les garde : c'est le
     COMPORTEMENT, et il n'est pas à nous.
   — les <Tooltip> passent disableStyleInjection pour couper son style « base »
     (couleurs, radius, padding). Sans ça, ses variants entreraient en concurrence
     avec les règles ci-dessous à spécificité égale — l'apparence dépendrait alors
     de l'ORDRE d'insertion des balises <style>, donc de l'ordre de montage.
   L'import de react-tooltip/dist/react-tooltip.css a été retiré : redondant avec
   l'injection runtime, et Vite l'extrayait en dist/map3d.css — un fichier que le
   champ "exports" du package.json ne déclare pas, donc un artefact mort.
   On ne cible QUE les classes d'état STABLES (react-tooltip__show, __closing,
   __place-*), jamais les classes CSS-modules hashées
   (core-styles-module_tooltip__xxxxx), dont le hash change à chaque version. */
.m3d-tip{z-index:90;width:max-content;max-width:260px;padding:6px 9px;
  background:var(--m3d-panel);color:var(--m3d-text);
  border:1px solid var(--m3d-border);border-radius:var(--m3d-radius-md);
  box-shadow:var(--m3d-shadow-lg);backdrop-filter:blur(12px);
  font-size:11.5px;font-weight:500;line-height:1.35}
/* Deux classes = spécificité supérieure au « show » du core (opacité .9) : opaque
   franc, comme les autres surfaces de la lib. */
.m3d-tip.react-tooltip__show{opacity:1}
/* Flèche : carré hérité du fond, tourné de 45° vers le bord ancré (le core lui
   donne déjà position, background:inherit et le z-index qui la glisse SOUS le
   corps — seuls ses deux côtés extérieurs restent visibles). */
.m3d-tip-arrow{width:8px;height:8px;border:1px solid var(--m3d-border)}
[class*='react-tooltip__place-top']>.m3d-tip-arrow{transform:rotate(45deg)}
[class*='react-tooltip__place-right']>.m3d-tip-arrow{transform:rotate(135deg)}
[class*='react-tooltip__place-bottom']>.m3d-tip-arrow{transform:rotate(225deg)}
[class*='react-tooltip__place-left']>.m3d-tip-arrow{transform:rotate(315deg)}

/* HUD de sélection : badges par groupe (catégorie · type, compteur, croix de
   désélection, tout désélectionner) + hint des modificateurs. Par défaut en haut
   à droite, décalé de la barre de contrôles ; déplaçable par la poignée (le
   composant bascule alors en left/top inline, clampé au conteneur). */
/* Surfaces flottantes déplaçables — squelette PARTAGÉ par le panneau de sélection
   et celui de la loupe (cf. le composant FloatingPanel). Chaque variante ne définit
   plus que ses écarts : sa position par défaut et sa largeur (--m3d-panel-w).
   pointer-events:none sur le conteneur + auto sur ses enfants : le HUD ne capte
   jamais un clic destiné à la carte entre ses cartes. */
.m3d-floathud{position:absolute;z-index:20;display:flex;flex-direction:column;pointer-events:none}
.m3d-floathud > *{pointer-events:auto}
.m3d-floatpanel{width:var(--m3d-panel-w);padding:8px;display:flex;flex-direction:column;gap:7px}
.m3d-floathead{display:flex;align-items:center;gap:6px;padding:2px 2px 0;font-size:12.5px;font-weight:600}
.m3d-floathead-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Panneau de sélection : ancré en haut-droite, dégagé des barres verticales. */
.m3d-selhud{top:14px;right:82px;align-items:flex-end;gap:7px;max-width:min(70%,640px)}
.m3d-selpanel{--m3d-panel-w:${SELECTION_PANEL_W}px}
/* Poignée de déplacement du HUD (drag & drop). touch-action:none : le drag
   pointer ne doit pas être avalé par le scroll tactile. */
.m3d-selgrip{display:flex;align-items:center;justify-content:center;width:20px;height:22px;
  border:none;border-radius:6px;background:transparent;padding:0;cursor:grab;
  color:var(--m3d-muted);touch-action:none;flex:none}
.m3d-selgrip:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent);color:var(--m3d-text)}
.m3d-selgrip:active{cursor:grabbing}
/* Panneau liste : mêmes classes que le panneau « Couches » (m3d-taglist/-tagrow/
   -taglabel/-tagdot/-tagcount/-tagclear) — seuls les deltas sont scopés ici. */
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
  border:none;background:transparent;border-radius:9px;outline:none;
  display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--m3d-text);
  transition:background .14s}
.m3d-btn:hover{background:color-mix(in srgb,var(--m3d-text) 12%,transparent)}
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
/* Indice secondaire (compteur, valeur atteinte) : lisible mais jamais concurrent
   du libellé — c'est le libellé qui porte l'action. */
.m3d-menu-item .m3d-menu-hint{font-size:11.5px;color:var(--m3d-muted);flex:none;margin-left:8px}
/* Pastille de famille : occupe le slot d'icône, même gabarit pour un alignement
   identique qu'un item porteur d'icône. */
.m3d-menu-swatch{display:block;width:9px;height:9px;border-radius:50%;margin:0 auto;
  box-shadow:0 0 0 1px color-mix(in srgb,var(--m3d-text) 18%,transparent)}
/* Item inerte : visible (il informe qu'aucune cible ne correspond) mais insensible. */
.m3d-menu-item[aria-disabled='true']{opacity:.45;cursor:default}
.m3d-menu-item[aria-disabled='true']:hover{background:none}
.m3d-menu-item:focus-visible{outline:none;background:color-mix(in srgb,var(--m3d-text) 12%,transparent)}
/* En-tête d'un menu contextuel (titre de la cible) — était le seul style STRUCTUREL
   écrit en inline du projet, donc hors du thème et non surchargeable. */
.m3d-menu-header{padding:8px 10px 9px;border-bottom:1px solid var(--m3d-border);margin-bottom:4px}
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
/* Le fond rouge, l'icône et la taille viennent de .m3d-remove (partagé) : ici
   seuls le placement sur la pastille et sa révélation au survol. */
.m3d-pin-x{position:absolute;top:6px;right:6px;opacity:0;transform:scale(.6);
  box-shadow:0 2px 6px rgba(0,0,0,.35);
  transition:opacity .12s,transform .12s}
.m3d-pin:hover .m3d-pin-x,.m3d-pin:focus-within .m3d-pin-x{opacity:1;transform:scale(1)}
/* Ghost d'une pastille en cours de retrait : tooltip « Supprimer » au-dessus,
   visible UNIQUEMENT hors d'une cible acceptée (façon dock macOS). */
/* L'indice porte le MÊME bouton que partout ailleurs (RemoveButton withText) :
   il n'apporte donc que le placement au-dessus du ghost et son apparition. */
.m3d-pin-remove-hint{position:absolute;left:50%;top:0;transform:translate(-50%,calc(-100% - 8px));
  opacity:0;transition:opacity .12s;pointer-events:none}
.m3d-pin-remove-hint .m3d-remove{box-shadow:0 4px 12px rgba(0,0,0,.35)}
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

/* ── Loupe (LensLayer) : zone d'inspection + panneau d'inventaire ─────────────── */
/* Curseur de tracé, seulement tant qu'aucune zone n'existe (phase de dessin). */
.m3d-root.m3d-lensing canvas{cursor:crosshair}
/* Zone : cadre marching-ants déplaçable (corps) + redimensionnable (poignées).
   Fenêtre écran 2D. Le cadre lui-même réutilise les classes partagées
   .m3d-marquee-under / .m3d-marquee du sélecteur (voir plus haut) — la loupe ne
   définit donc que sa géométrie et ses affordances propres. */
.m3d-lenszone{position:absolute;z-index:16;box-sizing:border-box;pointer-events:auto;cursor:move}
.m3d-lenszone-preview{pointer-events:none;cursor:default}
/* Barre espace maintenue : le rectangle (et ses poignées) devient traversant →
   le glissé atteint la carte et la déplace, où que soit le curseur. */
.m3d-root.m3d-space-pan .m3d-lenszone,
.m3d-root.m3d-space-pan .m3d-lenszone *{pointer-events:none!important}
.m3d-lenszone-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
/* Croix de fermeture (haut-droite), neutre — pas de pastille pleine « stop ». */
.m3d-lenszone-x{position:absolute;top:-11px;right:-11px;width:22px;height:22px;z-index:2;
  display:flex;align-items:center;justify-content:center;border:1px solid var(--m3d-border);border-radius:50%;padding:0;
  background:var(--m3d-panel);color:var(--m3d-text);cursor:pointer;box-shadow:var(--m3d-shadow-sm)}
.m3d-lenszone-x:hover{background:color-mix(in srgb,var(--m3d-text) 10%,var(--m3d-panel))}
/* Poignées : mêmes tokens --m3d-handle-* que .m3d-handle (le sélecteur), y compris
   au survol — seules les PROPRIÉTÉS diffèrent (span DOM ici, rect SVG là-bas). */
.m3d-lenszone-h{position:absolute;width:11px;height:11px;box-sizing:border-box;transform:translate(-50%,-50%);
  background:var(--m3d-handle-bg);border:var(--m3d-handle-line-w) solid var(--m3d-handle-line);
  border-radius:2px;pointer-events:auto;z-index:1;box-shadow:var(--m3d-handle-shadow)}
.m3d-lenszone-h:hover{background:var(--m3d-accent);border-color:var(--m3d-handle-bg)}
/* Panneau d'inventaire, ancré à droite de la zone (position inline via le hook). */
/* Panneau de la loupe : position posée en inline (il suit la zone), d'où l'absence
   de top/right ici — seules sa largeur et sa borne de débordement le distinguent. */
.m3d-lenshud{max-width:min(60%,360px)}
.m3d-lenspanel{--m3d-panel-w:${LENS_PANEL_W}px}
.m3d-lensempty{padding:14px 8px;text-align:center;color:var(--m3d-muted);font-size:12px}

/* ── Liste de markers partagée (sélection + loupe) : 1 ligne par marker ──────── */
.m3d-mllist{display:flex;flex-direction:column;gap:1px;max-height:44vh;overflow-y:auto;margin:0 -2px;padding:0 2px}
.m3d-mlrow{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;text-align:left;color:inherit}
.m3d-mlrow:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-mlrow:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:-2px}
.m3d-mldot{width:10px;height:10px;border-radius:50%;flex:none}
.m3d-mlavatar{width:20px;height:20px;border-radius:50%;object-fit:cover;flex:none;border:1.5px solid var(--m3d-border)}
.m3d-mltext{flex:1;min-width:0;display:flex;flex-direction:column}
.m3d-mltitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;line-height:1.3}
.m3d-mlsub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;line-height:1.25;color:var(--m3d-muted)}
.m3d-mlact,.m3d-mlremove{display:flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;padding:0;
  border:none;background:transparent;color:var(--m3d-muted);cursor:pointer}
.m3d-mlact{border-radius:6px}
.m3d-mlremove{border-radius:50%}
.m3d-mlact:hover,.m3d-mlremove:hover{background:color-mix(in srgb,var(--m3d-text) 12%,transparent);color:var(--m3d-text)}
/* Menu déroulant d'actions (portail) : réutilise .m3d-menu-panel/-item/-label. */
.m3d-mlmenu{position:absolute;z-index:96;min-width:160px}

@media(prefers-reduced-motion:reduce){
  .m3d-root *{animation-duration:.001ms!important;animation-iteration-count:1!important}
}
`
