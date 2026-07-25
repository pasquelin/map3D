const STYLE_ID = 'm3d-styles'

/**
 * Injecte **une seule fois** par document une feuille scopée sous `.m3d-root`.
 * Aucun style global n'est posé ailleurs. SSR-safe : appelée depuis un effet,
 * jamais au niveau module.
 */
export function injectStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}

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
.m3d-marker-node.m3d-enter{animation:m3d-enter var(--m3d-enter-dur,460ms)
  var(--m3d-enter-ease,cubic-bezier(.32,1.5,.5,1)) backwards}
.m3d-marker-node.m3d-selected{z-index:80}
@keyframes m3d-enter{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:scale(1)}}
@keyframes m3d-halo{0%{transform:scale(.62);opacity:.5}70%{opacity:0}100%{transform:scale(2.1);opacity:0}}
@keyframes m3d-pulse{0%,100%{transform:scale(1)}50%{transform:scale(var(--m3d-pulse-scale,1.16))}}
@keyframes m3d-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(-1 * var(--m3d-bob-amp,4px)))}}
@keyframes m3d-cluster-bloom{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes m3d-menu-in{from{opacity:0;transform:translateX(-8px) scale(.96)}}

.m3d-measure-label{position:absolute;left:0;top:0;background:#101828;color:#fff;
  font-size:11px;font-weight:600;padding:4px 9px;border-radius:6px;white-space:nowrap;
  pointer-events:none}

.m3d-panel{background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-lg);box-shadow:var(--m3d-shadow-md);
  backdrop-filter:blur(20px);color:var(--m3d-text)}

.m3d-controls{position:absolute;top:50%;transform:translateY(-50%);z-index:20;
  display:flex;flex-direction:column;gap:9px;align-items:center}
.m3d-controls.m3d-right{right:16px}
.m3d-controls.m3d-left{left:16px}
.m3d-controls-group{display:flex;flex-direction:column;gap:2px;padding:5px;
  background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-md);box-shadow:var(--m3d-shadow-sm);backdrop-filter:blur(20px)}
.m3d-btn{width:38px;height:38px;border:none;background:transparent;border-radius:9px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--m3d-text);
  transition:background .14s}
.m3d-btn:hover{background:color-mix(in srgb,var(--m3d-text) 12%,transparent)}
.m3d-btn.m3d-on{background:var(--m3d-accent);color:#fff}
.m3d-btn:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:2px}

/* Barre d'outils de dessin : sous le zoom minimal elle glisse hors écran
   (translateY conserve le centrage vertical pendant la transition). */
.m3d-drawbar{position:absolute;top:50%;z-index:20;display:flex;flex-direction:column;
  gap:2px;padding:6px;background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-lg);box-shadow:var(--m3d-shadow-sm);backdrop-filter:blur(20px);
  transform:translateY(-50%);
  transition:transform .28s cubic-bezier(.4,0,.2,1),opacity .28s}
.m3d-drawbar.m3d-left{left:16px}
.m3d-drawbar.m3d-right{right:16px}
.m3d-drawbar.m3d-hidden{opacity:0;pointer-events:none}
.m3d-drawbar.m3d-left.m3d-hidden{transform:translateY(-50%) translateX(calc(-100% - 24px))}
.m3d-drawbar.m3d-right.m3d-hidden{transform:translateY(-50%) translateX(calc(100% + 24px))}
.m3d-drawbar .m3d-btn{width:40px;height:40px}

.m3d-search{position:absolute;left:16px;top:16px;z-index:20;width:270px}
.m3d-search-box{display:flex;align-items:center;gap:9px;padding:11px 13px;
  background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-md);box-shadow:var(--m3d-shadow-sm);backdrop-filter:blur(20px)}
.m3d-search-box input{border:none;background:none;outline:none;flex:1;min-width:0;
  font-family:inherit;font-size:13.5px;color:var(--m3d-text)}
.m3d-search-results{margin-top:7px;padding:5px;max-height:300px;overflow-y:auto}
.m3d-search-item{display:flex;align-items:center;gap:10px;padding:9px 10px;
  border-radius:9px;cursor:pointer;font-size:13px}
.m3d-search-item:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}

.m3d-menu{position:absolute;z-index:95;pointer-events:none;will-change:transform}
.m3d-menu-panel{position:absolute;left:14px;top:-14px;min-width:186px;padding:5px;
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
.m3d-menu-sub{position:absolute;left:100%;top:-5px;margin-left:3px}

.m3d-popup{position:absolute;left:0;top:0;z-index:90;transform-origin:0 0;
  pointer-events:none;will-change:transform}
.m3d-popup-inner{pointer-events:auto;transform:translate(-50%,calc(-100% - 14px));
  background:var(--m3d-panel);border:1px solid var(--m3d-border);
  border-radius:var(--m3d-radius-md);box-shadow:var(--m3d-shadow-lg);padding:10px 12px;
  min-width:160px;max-width:280px}

@media(prefers-reduced-motion:reduce){
  .m3d-root *{animation-duration:.001ms!important;animation-iteration-count:1!important}
}
`
