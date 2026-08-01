export const CSS_MENU = `
.m3d-menu{position:absolute;z-index:var(--m3d-z-menu,9999);pointer-events:none;will-change:transform}
/* flex column + align-content : support du passage en colonnes (useFitColumns)
   quand le menu est plus haut que la carte. */
.m3d-menu-panel{position:absolute;left:14px;top:-14px;min-width:186px;padding:5px;z-index:var(--m3d-z-menu,9999);
  display:flex;flex-direction:column;align-content:flex-start;
  pointer-events:auto;
  animation:m3d-menu-in var(--m3d-menu-dur,200ms) cubic-bezier(.32,1.3,.5,1) backwards}
.m3d-menu-item{display:flex;align-items:center;gap:9px;padding:7px 10px;
  border-radius:8px;font-size:var(--m3d-size-sm);cursor:pointer;user-select:none;color:var(--m3d-text);
  position:relative}
.m3d-menu-item:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
/* Action destructive (rouge du thème colors.ui.error) — DÉFINITION PARTAGÉE : entrée de
   menu contextuel ET corbeille du panneau de sélection (m3d-selrow-x). Sélecteurs composés
   pour primer sur la couleur et le survol de base de chaque élément, quel que soit l'ordre
   d'injection. Le survol refixe la couleur : sinon le hover de m3d-selrow-x la ramènerait
   au neutre. */
.m3d-menu-item.m3d-danger,.m3d-selrow-x.m3d-danger{color:var(--m3d-error)}
.m3d-menu-item.m3d-danger:hover,.m3d-selrow-x.m3d-danger:hover{
  color:var(--m3d-error);background:color-mix(in srgb,var(--m3d-error) 14%,transparent)}
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
`
