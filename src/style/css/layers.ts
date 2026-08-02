export const CSS_LAYERS = `
/* Panneau « Couches » (filtre par tag) : ancré au groupe du bouton, ouvert du
   côté opposé à la barre (m3d-right = barre à droite → panneau à gauche).
   Les top / max-height ci-dessous ne sont que des valeurs de départ : useAnchoredPanel
   les recalcule (styles inline) pour que le panneau reste dans le conteneur de carte,
   et bascule de côté si la place manque. */
.m3d-tags{position:relative}
.m3d-tagbtn{position:relative}
.m3d-tag-badge{position:absolute;top:-10px;right:-10px;min-width:15px;height:15px;padding:0 4px;
  border-radius:8px;background:var(--m3d-accent);color:#fff;font-size:9.5px;font-weight:var(--m3d-weight-bold);
  display:flex;align-items:center;justify-content:center;pointer-events:none;
  box-shadow:0 0 0 2px var(--m3d-panel)}
.m3d-btn.m3d-on .m3d-tag-badge{background:#fff;color:var(--m3d-accent)}
/* Flyout ancré à un bouton de barre — partagé avec la palette de symboles
   (.m3d-sympanel), qui ne surcharge que sa largeur. */
.m3d-tagpanel,.m3d-sympanel{width:236px;padding:8px;display:flex;flex-direction:column;gap:7px}
.m3d-tagsearch{display:flex;align-items:center;gap:2px;padding:7px 9px;
  border:1px solid var(--m3d-border);border-radius:9px;color:var(--m3d-muted)}
.m3d-tagsearch input{border:none;background:none;outline:none;flex:1;min-width:0;
  font-family:inherit;font-size:var(--m3d-size-sm);color:var(--m3d-text)}
/* Seule la liste scrolle : recherche (au-dessus) et « Tout afficher » (en dessous)
   restent visibles quand le panneau atteint sa hauteur max. */
.m3d-taglist{display:flex;flex-direction:column;gap:1px;flex:1 1 auto;min-height:0;overflow-y:auto}
.m3d-tagrow{display:flex;align-items:center;gap:8px;padding:6px 4px;border-radius:8px;
  cursor:pointer;font-size:var(--m3d-size-sm);user-select:none}
.m3d-tagrow:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
/* Checkbox custom au style du thème (case arrondie + coche dessinée en CSS). Réutilisée
   telle quelle par les listes à toggle (plugins, réglages catalogue) et les champs
   booléens de la config — même apparence, pas de coche dupliquée. */
.m3d-tagrow input,.m3d-togglerow input[type='checkbox'],.m3d-plugin-checkbox,.m3d-catcheck{
  appearance:none;-webkit-appearance:none;margin:0;flex:none;cursor:pointer;
  width:15px;height:15px;border:1.5px solid color-mix(in srgb,var(--m3d-text) 35%,transparent);
  border-radius:5px;background:transparent;display:grid;place-items:center;
  transition:background .14s,border-color .14s}
.m3d-tagrow:hover input,.m3d-plugin-checkbox:hover,.m3d-togglerow input[type='checkbox']:hover,.m3d-catrow:hover .m3d-catcheck{
  border-color:color-mix(in srgb,var(--m3d-text) 55%,transparent)}
.m3d-tagrow input:checked,.m3d-togglerow input[type='checkbox']:checked,.m3d-plugin-checkbox:checked,.m3d-catcheck:checked{
  background:var(--m3d-accent);border-color:var(--m3d-accent)}
.m3d-tagrow input::after,.m3d-togglerow input[type='checkbox']::after,.m3d-plugin-checkbox::after,.m3d-catcheck::after{
  content:'';width:8px;height:4.5px;margin-top:-1.5px;opacity:0;
  border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg) scale(.5);
  transition:opacity .12s,transform .12s}
.m3d-tagrow input:checked::after,.m3d-togglerow input[type='checkbox']:checked::after,
.m3d-plugin-checkbox:checked::after,.m3d-catcheck:checked::after{opacity:1;transform:rotate(-45deg) scale(1)}
.m3d-tagrow input:focus-visible,.m3d-togglerow input[type='checkbox']:focus-visible,
.m3d-plugin-checkbox:focus-visible,.m3d-catcheck:focus-visible{outline:2px solid var(--m3d-accent);outline-offset:2px}
.m3d-tagdot{width:9px;height:9px;border-radius:50%;flex:none}
.m3d-taglabel{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m3d-tagcount{font-size:var(--m3d-size-xs);color:var(--m3d-muted);font-variant-numeric:tabular-nums}
.m3d-tagempty{padding:10px 8px;font-size:12px;color:var(--m3d-muted);text-align:center}
/* width:100% : un <button> ne s'étire pas seul hors parent flex (panneau recherche). */
.m3d-tagclear{display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 9px;width:100%;margin-top:6px;
  border:1px solid var(--m3d-border);border-radius:9px;background:transparent;cursor:pointer;
  font-family:inherit;font-size:12px;color:var(--m3d-text);transition:background .14s}
.m3d-tagclear:hover:not(:disabled){background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-tagclear:disabled{opacity:.45;cursor:default}
`
