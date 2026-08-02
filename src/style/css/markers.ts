/** Hauteur (px écran) dont le leader line RELÈVE le badge au-dessus de son ancre au sol.
 *  Source unique : sert de fallback à la var CSS `--m3d-leader-lift` (ci-dessous) ET de
 *  décalage vertical aux silhouettes de sélection (cercles) des markers/clusters, qui
 *  doivent cercler le badge RELEVÉ, pas l'ancre. Les deux ne peuvent donc plus diverger. */
export const LEADER_LIFT_PX = 44

export const CSS_MARKERS = `/* Sprite d'ancre — PARTAGÉ par le marker et le cluster par défaut : carré centré
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
.m3d-marker-lift{position:absolute;left:0;top:0;transform:translateY(calc(-1 * var(--m3d-leader-lift,${LEADER_LIFT_PX}px)))}
.m3d-marker-leader{position:absolute;left:0;top:calc(-1 * var(--m3d-leader-lift,${LEADER_LIFT_PX}px));
  width:2px;height:var(--m3d-leader-lift,${LEADER_LIFT_PX}px);margin-left:-1px;border-radius:1px;
  background:linear-gradient(to top,rgba(17,24,39,.5),rgba(17,24,39,.12));pointer-events:none}
.m3d-marker-dot{position:absolute;left:0;top:0;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;
  border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px rgba(17,24,39,.5);pointer-events:none}
/* Avatar de marker (MarkerData.avatar) : photo ronde cerclée de la couleur du
   type (border-color inline) + liseré blanc — prioritaire sur l'icône custom. */
.m3d-marker-img{max-width:none;max-height:none}
.m3d-marker-avatar{border-radius:50%;object-fit:cover;box-sizing:border-box;
  border:var(--m3d-marker-ring-w,3px) solid;background:var(--m3d-panel);
  box-shadow:0 0 0 1.5px rgba(255,255,255,.9),0 2px 6px rgba(0,0,0,.4)}
.m3d-marker-node.m3d-enter{animation:m3d-enter var(--m3d-enter-dur,460ms)
  var(--m3d-enter-ease,cubic-bezier(.32,1.5,.5,1)) backwards}
.m3d-marker-node.m3d-selected{z-index:var(--m3d-z-marker-selected,80)}
@keyframes m3d-enter{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:scale(1)}}
@keyframes m3d-halo{0%{transform:scale(.62);opacity:.5}70%{opacity:0}100%{transform:scale(2.1);opacity:0}}
@keyframes m3d-pulse{0%,100%{transform:scale(1)}50%{transform:scale(var(--m3d-pulse-scale,1.16))}}
@keyframes m3d-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(-1 * var(--m3d-bob-amp,4px)))}}
@keyframes m3d-cluster-bloom{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes m3d-menu-in{from{opacity:0;transform:translateX(-8px) scale(.96)}}

.m3d-measure-label{position:absolute;left:0;top:0;background:var(--m3d-panel);
  color:var(--m3d-text);border:1px solid var(--m3d-border);backdrop-filter:blur(12px);
  font-size:var(--m3d-size-xs);font-weight:var(--m3d-weight-semibold);font-variant-numeric:tabular-nums;padding:3px 9px;
  border-radius:var(--m3d-radius-pill);white-space:nowrap;box-shadow:var(--m3d-shadow-sm);
  pointer-events:none}

/* Étiquette d'un lien de relation : même gabarit que le label de la règle — un
   chiffre posé sur la carte doit se lire pareil quelle que soit sa provenance. */
.m3d-link-label{position:absolute;left:0;top:0;background:var(--m3d-panel);
  color:var(--m3d-text);border:1px solid var(--m3d-border);backdrop-filter:blur(12px);
  font-size:var(--m3d-size-xs);font-weight:var(--m3d-weight-semibold);font-variant-numeric:tabular-nums;padding:3px 9px;
  border-radius:var(--m3d-radius-pill);white-space:nowrap;box-shadow:var(--m3d-shadow-sm);
  display:flex;align-items:center;
  /* Interactive : elle porte la croix de fermeture. Le reste du texte ne capte
     rien d'utile, mais laisser l'étiquette transparente aux clics empêcherait
     d'atteindre le bouton. */
  pointer-events:auto}
`
