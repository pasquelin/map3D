export const CSS_BASE = `
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
.m3d-root canvas{position:absolute;inset:0;display:block;width:100%;height:100%;cursor:grab;touch-action:none;
  filter:var(--m3d-tiles-filter,none)}
.m3d-root canvas:active{cursor:grabbing}
.m3d-root.m3d-drawing canvas{cursor:crosshair}
/* overflow visible : sinon les menus/sous-menus ancrés aux markers sont coupés */
/* +1 sur la surface des markers, à dessein : les poignées d'édition et la zone de
   loupe doivent rester devant les markers (la zone se saisit à la souris, un marker
   par-dessus la rendrait inattrapable). Un seul réglage porte donc les deux plans,
   et leur ordre relatif ne peut plus être cassé par inadvertance. */
.m3d-overlay{position:absolute;inset:0;z-index:calc(var(--m3d-z-map-overlay,100) + 1);pointer-events:none;overflow:visible;transition:opacity var(--m3d-intro-fade,500ms)}
.m3d-overlay > *{pointer-events:auto}
/* Intro : labels/popups ancrés à la carte masqués avec les markers (fondu à l'entrée). */
.m3d-root.m3d-intro .m3d-overlay{opacity:0}
.m3d-root.m3d-intro .m3d-overlay > *{pointer-events:none!important}
/* Overlay HTML piloté par le CSS2DRenderer (superposé au canvas). */
/* Le z-index est ici pour créer un CONTEXTE D'EMPILEMENT (l'élément est déjà en
   position:absolute, posée en ligne par MapEngine). CSS2DRenderer écrit un z-index de
   1 à N sur chaque ancre pour les trier par profondeur ; sans contexte, ces valeurs
   remontaient jusqu'à la racine et concurrençaient les surfaces d'UI — le 21ᵉ marker
   à l'écran passait devant le HUD flottant. Enfermées ici, elles ne trient plus que
   les markers entre eux, ce qui est leur seul rôle. */
.m3d-css2d{z-index:var(--m3d-z-map-overlay,100);pointer-events:none;
  transition:opacity var(--m3d-intro-fade,500ms)}
/* Intro (vol globe → cible) : markers/clusters masqués jusqu'à l'atterrissage —
   sinon ils flottent sur le vide pendant que la planète streame. Fondu à l'entrée. */
.m3d-root.m3d-intro .m3d-css2d{opacity:0}
.m3d-root.m3d-intro .m3d-css2d *{pointer-events:none!important}
/* Carte inerte (<Map interactive={false}>) : les markers réactivent pointer-events
   élément par élément, seule une règle DESCENDANTE peut les recouvrir. Le curseur
   redevient neutre : plus rien n'est saisissable. Même mécanique que l'intro. */
.m3d-root.m3d-inert canvas{cursor:default}
.m3d-root.m3d-inert .m3d-css2d *,
.m3d-root.m3d-inert .m3d-overlay > *{pointer-events:none!important}
/* Mode piéton, phase de placement : le curseur DIT si le clic passerait. Deux curseurs
   natifs plutôt qu'un SVG teinté — le retour est instantané et net à tout facteur
   d'échelle, là où une image de curseur se pixellise et arrive avec une frame de retard. */
.m3d-root.m3d-pedestrian-place canvas{cursor:crosshair}
.m3d-root.m3d-pedestrian-place.m3d-pedestrian-blocked canvas{cursor:not-allowed}
/* Liseré : le placement est un état MODAL, il doit se voir sans masquer la carte qu'on est
   en train de viser. Sa couleur dit la validité, comme le curseur. */
.m3d-root.m3d-pedestrian-place::after{content:'';position:absolute;inset:0;pointer-events:none;
  z-index:var(--m3d-z-ui,999);
  box-shadow:inset 0 0 0 2px var(--m3d-pedestrian-valid,transparent)}
.m3d-root.m3d-pedestrian-place.m3d-pedestrian-blocked::after{
  box-shadow:inset 0 0 0 2px var(--m3d-pedestrian-blocked,transparent)}
/* Immersion totale (Pointer Lock) : l'interface de CONTRÔLE s'efface pour laisser la rue
   plein cadre. On masque les barres, jamais la scène (canvas, markers .m3d-css2d) ni le
   HUD piéton — c'est « interface masquée », pas « écran vidé ». */
.m3d-root.m3d-immersive .m3d-drawbar,
.m3d-root.m3d-immersive .m3d-controls,
.m3d-root.m3d-immersive .m3d-search,
.m3d-root.m3d-immersive .m3d-readout,
.m3d-root.m3d-immersive .m3d-pindock{display:none}
/* Réticule : point de visée central, montré par le HUD seulement en immersion totale. Sa
   couleur vient du thème (--m3d-pedestrian-reticle) ; le halo sombre le garde lisible sur
   un décor clair comme sur un décor sombre. */
.m3d-reticle{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;
  border-radius:50%;background:var(--m3d-pedestrian-reticle,#f8fafc);pointer-events:none;
  z-index:var(--m3d-z-ui,999);box-shadow:0 0 0 1.5px rgba(0,0,0,.45)}
/* Invite « Échap pour quitter » et bouton d'entrée en immersion : centrés en bas, hors de
   la ligne de visée. Le bouton n'existe qu'en exploration ; l'invite qu'en immersion. */
.m3d-pedestrian-hint,.m3d-pedestrian-immerse{position:absolute;left:50%;bottom:24px;
  transform:translateX(-50%);z-index:var(--m3d-z-ui,999);font:inherit;font-size:13px;
  padding:6px 12px;border-radius:999px;background:var(--m3d-panel,#0b1220);
  color:var(--m3d-text,#f8fafc);border:1px solid var(--m3d-border,transparent);
  box-shadow:0 2px 8px rgba(0,0,0,.35);pointer-events:none;white-space:nowrap}
.m3d-pedestrian-immerse{pointer-events:auto;cursor:pointer;border-color:var(--m3d-accent,#2563eb)}
.m3d-pedestrian-immerse:hover{background:var(--m3d-accent,#2563eb);color:#fff}
/* Enveloppe ancrée : positionnée (transform) par le CSS2DRenderer chaque frame.
   PAS de will-change : la promotion en couche GPU désynchronise le marker du
   canvas WebGL pendant le déplacement (les 2 couches sont présentées à ~1 frame
   d'écart → « nage » visible). Sans promotion, le transform est peint dans la
   même frame que la carte. */
.m3d-marker-anchor{pointer-events:none}
.m3d-marker-node{pointer-events:none}
.m3d-marker-node > *{pointer-events:auto}

`
