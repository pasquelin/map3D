export const CSS_CATALOG = `
/* ── Catalogue ──
   MÊME châssis que « Couches » : bouton dans le .m3d-controls-group partagé de la barre,
   flyout ancré au bouton. Deux vues dans le même panneau — la liste des types, puis la
   liste d'un type. */
.m3d-catalog{position:relative}
.m3d-catbtn{position:relative}
/* Le panneau ancré à la barre ne contient QUE le menu des types : la liste vit dans
   .m3d-catsub, accolé du côté opposé (même châssis que .m3d-settings-sub).
   Deux largeurs distinctes bien qu'égales par défaut : les surfaces sont ACCOLÉES, donc
   c'est leur somme que le cadrage doit réserver (cf. useCatalog.fit). */
.m3d-catpanel,.m3d-catsub{padding:8px;display:flex;flex-direction:column;gap:7px}
.m3d-catpanel{width:var(--m3d-catalog-panel-w)}
.m3d-catsub{width:var(--m3d-catalog-sub-panel-w)}
/* Menu des types : familles séparées par un filet, pas par un titre — à cinq entrées,
   un en-tête par famille prend plus de place que ce qu'il classe. */
.m3d-cattypes{display:flex;flex-direction:column;gap:1px;overflow-y:auto;min-height:0}
.m3d-catfamily+.m3d-catfamily{margin-top:6px;padding-top:6px;border-top:1px solid var(--m3d-border)}
.m3d-cattype-row{position:relative}
.m3d-cattype{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;width:100%;
  border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:var(--m3d-size-sm);
  color:var(--m3d-text);text-align:left}
.m3d-cattype:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-cattype.m3d-on{background:color-mix(in srgb,var(--m3d-accent) 22%,transparent)}
.m3d-cattype-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m3d-cattype-total{font-size:var(--m3d-size-xs);color:var(--m3d-muted);font-variant-numeric:tabular-nums}
/* Le viewport scrolle, pas le panneau : la recherche reste visible en haut. */
.m3d-catviewport{flex:1 1 auto;min-height:0;max-height:var(--m3d-catalog-panel-maxh);
  overflow-y:auto;position:relative}
.m3d-catrow{display:flex;align-items:center;gap:6px;padding:0 6px;border-radius:8px;
  height:var(--m3d-catalog-row-h);font-size:var(--m3d-size-sm);box-sizing:border-box}
.m3d-catrow:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-catrow.m3d-child{padding-left:calc(6px + var(--m3d-catalog-indent))}
/* Le chevron et sa gouttière de remplacement partagent LA MÊME variable : deux valeurs
   séparées finissaient par diverger, et les noms d'une même liste cessaient de
   s'aligner selon que la ligne portait un chevron ou non. */
.m3d-catchevron{display:grid;place-items:center;width:var(--m3d-catalog-chevron-w);height:var(--m3d-catalog-chevron-w);
  flex:none;border:none;border-radius:5px;
  background:transparent;cursor:pointer;color:var(--m3d-muted);transition:transform .14s}
.m3d-catchevron.m3d-on{transform:rotate(90deg);color:var(--m3d-text)}
.m3d-catchevron-spacer{width:var(--m3d-catalog-chevron-w);flex:none}
/* Le NOM : c'est lui qui cède la place, et lui seul — d'où min-width:0. */
/* Pas de soulignement au survol : la ligne s'éclaire déjà (.m3d-catrow:hover), et
   souligner un nom sur deux au passage de la souris fait clignoter la liste. */
.m3d-catmain{flex:1;min-width:0;display:flex;align-items:center;gap:7px;padding:0;border:none;
  background:transparent;cursor:pointer;font-family:inherit;font-size:inherit;color:var(--m3d-text);
  text-align:left;overflow:hidden}
.m3d-cattitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m3d-catbadge{display:inline-flex;align-items:center;gap:3px;flex:none;padding:0 5px;height:16px;
  border-radius:8px;font-size:var(--m3d-size-xs);font-variant-numeric:tabular-nums;
  background:color-mix(in srgb,var(--m3d-text) 10%,transparent)}
/* Colonne d'actions à gabarit FIXE : sans elle, un bouton à fond peint (la bascule
   active) paraissait plus large que ses voisins transparents et la colonne semblait
   décalée d'une ligne à l'autre. Tous les boutons ont désormais la même boîte, et
   l'icône y est normalisée quelle que soit la marge interne du glyphe @mdi. */
.m3d-catactions{display:flex;align-items:center;gap:2px;flex:none;margin-left:2px}
.m3d-cataction{display:grid;place-items:center;width:22px;height:22px;flex:none;
  padding:0;border:none;border-radius:6px;background:transparent;cursor:pointer;color:var(--m3d-muted);
  box-sizing:border-box}
.m3d-cataction svg,.m3d-catchevron svg{width:15px;height:15px}
.m3d-cataction:hover:not(:disabled){background:color-mix(in srgb,var(--m3d-text) 12%,transparent);color:var(--m3d-text)}
.m3d-cataction:disabled{opacity:.35;cursor:default}
/* Afficher/retirer est une case à cocher, pas un bouton : c'est un ÉTAT persistant, et
   c'est déjà comme cela que « Couches » exprime « ce calque est affiché ». Le dessin de
   la coche vient du groupe de sélecteurs partagé plus haut — rien n'est redéfini ici,
   sinon la marge qui l'aligne sur la colonne d'actions. */
.m3d-catcheck{margin:0 1px 0 2px}
.m3d-catcheck:disabled{opacity:.35;cursor:default}
/* Partiellement coché : une BARRE, pas une coche — un agrégat dont une partie des
   enfants seulement est sur la carte. Le pseudo-élément est le même que la coche, on
   n'en redresse que la forme (pas de rotation, pas de branche verticale). */
.m3d-catcheck:indeterminate{background:var(--m3d-accent);border-color:var(--m3d-accent)}
.m3d-catcheck:indeterminate::after{opacity:1;width:8px;height:0;margin-top:0;
  border-left:none;border-bottom:2px solid #fff;transform:none}
/* Ligne inerte : visible mais inconsommable. Grisée en entier — n'éteindre que le
   bouton laisserait croire que le nom, lui, mène quelque part. */
.m3d-catrow.m3d-off{opacity:.45}
.m3d-catrow.m3d-off:hover{background:transparent}
.m3d-catrow.m3d-off .m3d-catmain{cursor:default}
/* --m3d-error (thème, colors.ui.error) et NON un --m3d-danger qui n'a jamais été émis :
   avec son repli en dur, la pastille et le bandeau étaient les deux seuls éléments
   d'UI de la lib qu'aucun thème ne pouvait atteindre. */
.m3d-caterrdot{color:var(--m3d-error)}
.m3d-catempty,.m3d-catloading{padding:14px 8px;font-size:var(--m3d-size-sm);color:var(--m3d-muted);text-align:center}
.m3d-caterror{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:9px;font-size:var(--m3d-size-sm);
  background:color-mix(in srgb,var(--m3d-error) 14%,transparent);color:var(--m3d-text)}
.m3d-caterror button{margin-left:auto;border:1px solid var(--m3d-border);border-radius:7px;padding:3px 8px;
  background:transparent;cursor:pointer;font-family:inherit;font-size:var(--m3d-size-xs);color:var(--m3d-text)}
.m3d-catmorespace{height:1px}
`
