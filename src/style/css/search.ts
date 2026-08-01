export const CSS_SEARCH = `
.m3d-search{position:absolute;left:16px;top:16px;z-index:var(--m3d-z-ui,999);width:320px}
.m3d-search-box{display:flex;align-items:center;gap:9px;padding:11px 13px;
  }
.m3d-search-box input{border:none;background:none;outline:none;flex:1;min-width:0;
  font-family:inherit;font-size:var(--m3d-size-md);color:var(--m3d-text)}
.m3d-search-box input::-webkit-search-cancel-button{-webkit-appearance:none;display:none}
.m3d-search-icon{color:var(--m3d-muted);flex:none}
.m3d-search-clear{border:none;background:none;padding:0;display:flex;align-items:center;
  cursor:pointer;color:var(--m3d-muted)}
.m3d-search-clear:hover{color:var(--m3d-text)}

/* Sélecteur de portée : à DROITE, dans la boîte, séparé par un filet — un seul
   objet à l'œil, deux gestes distincts (« quel nom » puis « dans quoi »). Largeur
   bornée pour qu'une rubrique au nom long ne mange pas le champ de saisie. */
.m3d-search-scope{position:relative;flex:none;margin:-11px -13px -11px 0;align-self:stretch;display:flex}
.m3d-search-scopebtn{display:flex;align-items:center;gap:3px;max-width:112px;padding:0 13px 0 9px;
  border:none;border-left:1px solid var(--m3d-border);background:transparent;cursor:pointer;
  font-family:inherit;font-size:12px;color:var(--m3d-muted);transition:color .14s}
.m3d-search-scopebtn:hover{color:var(--m3d-text)}
.m3d-search-scopebtn > span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Aligné à DROITE sur son bouton : ouvert vers la gauche, il ne sort pas de la carte. */
/* Pas de max-height figée : useFitHeight('dropdown') la calcule sur la place réelle. */
.m3d-search-scopemenu{position:absolute;right:0;top:calc(100% + 7px);z-index:calc(var(--m3d-z-ui,999) + 1);min-width:172px;
  padding:5px;overflow-y:auto}
.m3d-search-scopeitem{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;
  padding:7px 10px;border:none;border-radius:8px;background:transparent;cursor:pointer;
  font-family:inherit;font-size:var(--m3d-size-sm);color:var(--m3d-text);text-align:left}
.m3d-search-scopeitem:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-search-scopeitem.m3d-active{background:color-mix(in srgb,var(--m3d-accent) 18%,transparent)}
.m3d-search-scopeitem > small{color:var(--m3d-muted);font-size:11px;flex:none}
/* Pastille de rubrique : la couleur des éléments correspondants sur la carte, ce qui
   relie l'entrée du sélecteur à ce qu'on voit. Même gabarit que .m3d-mldot. */
.m3d-search-scopename{display:flex;align-items:center;gap:8px;min-width:0}
.m3d-search-scopename,.m3d-search-scopeitem > span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m3d-search-scopedot{width:8px;height:8px;border-radius:50%;flex:none}

/* ABSOLUE, hors du flux : le bloc de recherche garde la hauteur de son seul champ.
   Sinon la liste ouverte l'agrandit et repousse ce qui est calé dessous (la barre
   d'outils), qui se met à sauter à chaque frappe. */
.m3d-search-results{position:absolute;left:0;right:0;top:calc(100% + 7px);padding:5px;overflow-y:auto}
/* En-tête de rubrique COLLANT : en défilant dans une longue liste, on doit toujours
   savoir de quelle rubrique vient la ligne qu'on lit. Le compte est celui d'AVANT
   troncature — voir qu'il y en a 12 pour 6 affichées est une information. */
.m3d-search-group{position:sticky;top:-5px;z-index:1;display:flex;align-items:baseline;justify-content:space-between;
  gap:10px;padding:7px 10px 4px;background:var(--m3d-panel);
  font-size:var(--m3d-size-xs);font-weight:var(--m3d-weight-semibold);letter-spacing:.04em;text-transform:uppercase;color:var(--m3d-muted)}
.m3d-search-group > small{font-size:var(--m3d-size-xs);font-weight:var(--m3d-weight-medium);letter-spacing:0}
.m3d-search-item{display:flex;align-items:center;gap:10px;padding:9px 10px;
  border-radius:9px;cursor:pointer;font-size:13px}
/* Survol ET surbrillance clavier (↑/↓) partagent le même état visuel. */
.m3d-search-item:hover,.m3d-search-item.m3d-active{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-search-text{min-width:0;flex:1}
.m3d-search-text b{display:block;font-size:var(--m3d-size-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m3d-search-text small{display:block;font-size:11px;color:var(--m3d-muted);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m3d-search-empty{padding:10px;font-size:12px;color:var(--m3d-muted);text-align:center}
.m3d-search-subtitle{padding:4px 10px 0}
`
