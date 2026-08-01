export const CSS_TEMPLATES = `
/* ── Gestionnaire de templates ──
   MÊME structure que « Couches » : bouton dans un .m3d-controls-group de la barre,
   flyout latéral ancré au bouton (mêmes règles de côté/animation que .m3d-tagpanel).
   Réutilise .m3d-tagrow/checkbox (catégories) et .m3d-tag-badge (compteur). */
.m3d-templates{position:relative}
.m3d-tplbtn{position:relative}
.m3d-tplpanel{width:var(--m3d-templates-panel-w,288px);max-height:var(--m3d-templates-panel-maxh,460px);
  padding:8px;display:flex;flex-direction:column;gap:8px}
.m3d-tplpanel *{box-sizing:border-box}
.m3d-tplsave{display:flex;flex-direction:column;gap:7px}
.m3d-tplsave-hint{font-size:var(--m3d-size-xs);color:var(--m3d-muted);margin-top:-2px}
.m3d-tplname-input,.m3d-tplname-edit{width:100%;border:1px solid var(--m3d-border);background:transparent;
  border-radius:8px;padding:7px 9px;font-family:inherit;font-size:var(--m3d-size-sm);color:var(--m3d-text);outline:none}
.m3d-tplname-input:focus,.m3d-tplname-edit:focus{border-color:var(--m3d-accent)}
/* Rangée de sélection (contenu d'un template, modes d'application) : colonnes égales,
   posée sur une pilule discrète — même habillage pour les deux lignes. Le NOMBRE de
   colonnes est passé par le composant (--m3d-tplcats-n), les catégories offertes étant
   réglables ; 3 reste le défaut, celui de la rangée des modes d'application. */
.m3d-tplcats{display:grid;grid-template-columns:repeat(var(--m3d-tplcats-n,3),1fr);gap:3px;
  padding:4px 7px;border-radius:8px;background:color-mix(in srgb,var(--m3d-text) 6%,transparent)}
.m3d-tplcat{cursor:pointer;gap:5px;padding:5px 4px;min-width:0}
/* Le libellé REVIENT À LA LIGNE ici, contrairement au nowrap des listes de tags : à quatre
   colonnes une case tient un mot, pas deux, et l'ellipsis ne montrerait que « Main l… ».
   « Main levée » passe donc sur deux lignes — entre les mots, sans coupure au milieu de
   l'un d'eux (la largeur du panneau est calée sur le mot le plus long, cf. panelGeometry).
   Ciblé sur cette rangée seule : le panneau « Couches » doit garder ses tags sur une ligne. */
.m3d-tplcat .m3d-taglabel{font-size:var(--m3d-size-xs);white-space:normal;line-height:1.2;
  text-overflow:clip;overflow:visible}
/* Boutons pleine largeur uniformes (Sauvegarder + Importer) : même hauteur, même
   langage. Le principal en accent, le secondaire bordé (ghost). */
.m3d-tplbtn-full{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:8px 9px;
  border:1px solid transparent;border-radius:9px;background:var(--m3d-accent);color:#fff;cursor:pointer;
  font-family:inherit;font-size:var(--m3d-size-sm);transition:opacity .14s,background .14s}
.m3d-tplbtn-full:disabled{opacity:.4;cursor:default}
.m3d-tplbtn-full svg{width:16px;height:16px}
.m3d-tplbtn-ghost{background:transparent;border-color:var(--m3d-border);color:var(--m3d-text)}
.m3d-tplbtn-ghost:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-tpllist{display:flex;flex-direction:column;gap:4px;flex:1 1 auto;min-height:0;overflow-y:auto;
  scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--m3d-text) 25%,transparent) transparent}
/* Section « mode d'application » : phrase d'explication au-dessus de sa rangée de modes. */
.m3d-tplapply{display:flex;flex-direction:column;gap:4px}
/* Ligne : le geste principal (charger) est un vrai bouton frère des actions — l'anneau
   de focus reste dessiné sur la LIGNE via :has(). L'actif se voit (bordure accent). */
.m3d-tplrow{display:flex;gap:9px;padding:7px;border-radius:10px;
  border:1px solid transparent;background:color-mix(in srgb,var(--m3d-text) 4%,transparent);
  transition:background .14s,border-color .14s}
.m3d-tplrow:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-tplrow:has(.m3d-tplmain:focus-visible){outline:2px solid var(--m3d-accent);outline-offset:1px}
.m3d-tplmain{flex:1;min-width:0;display:flex;gap:9px;padding:0;border:none;background:transparent;
  font:inherit;color:inherit;text-align:left;cursor:pointer}
.m3d-tpl-thumb{flex:0 0 auto;border:1px solid var(--m3d-border);border-radius:7px;
  background:color-mix(in srgb,var(--m3d-text) 6%,transparent)}
.m3d-tplmeta{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;justify-content:center}
.m3d-tplrow-head{display:flex;align-items:center;gap:5px;min-width:0}
.m3d-tplname{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:var(--m3d-size-sm);font-weight:var(--m3d-weight-medium);color:var(--m3d-text)}
.m3d-tplname-edit{padding:2px 5px;font-weight:var(--m3d-weight-medium)}
.m3d-tpl-tag{flex:0 0 auto;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:var(--m3d-muted);
  border:1px solid var(--m3d-border);border-radius:999px;padding:1px 5px}
.m3d-tpl-ro{display:inline-flex;align-items:center;padding:1px 3px}
.m3d-tpl-ro svg{width:11px;height:11px}
.m3d-tplstats{font-size:var(--m3d-size-xs);color:var(--m3d-muted);font-variant-numeric:tabular-nums;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Actions en grille 2×2 compacte, alignée verticalement à la vignette. */
.m3d-tplactions{flex:0 0 auto;display:grid;grid-template-columns:repeat(2,24px);gap:2px;align-content:center}
.m3d-tplico{width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:none;
  background:transparent;border-radius:6px;cursor:pointer;color:var(--m3d-muted);transition:background .14s,color .14s}
.m3d-tplico:hover{background:color-mix(in srgb,var(--m3d-text) 12%,transparent);color:var(--m3d-text)}
.m3d-tplico svg{width:15px;height:15px}
/* Suppression : croix ROUGE (pas un rond) ; validation / mise à jour : accent. */
.m3d-tplico-danger{color:var(--m3d-error)}
.m3d-tplico-danger:hover{background:color-mix(in srgb,var(--m3d-error) 16%,transparent);color:var(--m3d-error)}
.m3d-tplico-ok{color:var(--m3d-accent)}
.m3d-tplico-ok:hover{background:color-mix(in srgb,var(--m3d-accent) 16%,transparent);color:var(--m3d-accent)}
.m3d-tplempty{padding:14px 8px;font-size:12px;color:var(--m3d-muted);text-align:center}
`
