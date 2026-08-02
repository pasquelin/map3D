export const CSS_MARKER_LIST = `
/* ── Liste de markers partagée (sélection + loupe) : 1 ligne par marker ──────── */
.m3d-mllist{display:flex;flex-direction:column;gap:1px;max-height:44vh;overflow-y:auto;margin:0 -2px;padding:0 2px}
.m3d-mlrow{display:flex;align-items:center;gap:8px;padding:6px 3px 6px 8px;border-radius:8px}
.m3d-mlrow:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
/* Le geste principal de la ligne est un vrai bouton, frère des actions (imbriquer un
   contrôle focusable dans un autre est invalide). Il reprend les propriétés que la
   ligne portait pour lui — reset de bouton, curseur, alignement — et l'anneau de focus
   reste dessiné sur la LIGNE, pour que le repère visuel ne change pas. */
.m3d-mlmain{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:0;border:none;
  background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer}
.m3d-mlrow:has(.m3d-mlmain:focus-visible){outline:2px solid var(--m3d-accent);outline-offset:-2px}
.m3d-mlmain:focus-visible{outline:none}
.m3d-mldot{width:10px;height:10px;border-radius:50%;flex:none; margin-right:4px}
.m3d-mlavatar{width:20px;height:20px;border-radius:50%;object-fit:cover;flex:none;border:1.5px solid var(--m3d-border)}
/* Icône de ligne : même gabarit que l'avatar pour que les lignes restent alignées,
   mais le pictogramme est CONTENU (jamais recadré) et posé sur un fond neutre —
   un symbole MIL-STD porte ses propres couleurs, un fond teinté les brouillerait. */
.m3d-mlicon{width:20px;height:20px;border-radius:50%;flex:none;display:grid;place-items:center;
  border:1.5px solid var(--m3d-border);background:color-mix(in srgb,var(--m3d-text) 8%,transparent);overflow:hidden}
.m3d-mlicon > img{width:15px;height:15px;object-fit:contain;display:block}
.m3d-mltext{flex:1;min-width:0;display:flex;flex-direction:column}
.m3d-mltitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--m3d-size-sm);line-height:1.3}
.m3d-mlsub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--m3d-size-xs);line-height:1.25;color:var(--m3d-muted)}
/* Ligne « masquée au zoom » (loupe) : le texte s'atténue légèrement — il dit « pas sur
   la carte » d'un coup d'œil, sans disparaître. L'icône et l'infobulle restent lisibles
   pour porter l'explication. */
.m3d-mlrow-hidden .m3d-mltext{opacity:.55}
/* Repère « masqué au zoom » : œil barré, aligné sur le gabarit des actions. Reçoit les
   événements pointeur (l'ancre de l'infobulle react-tooltip), mais cursor:default —
   c'est un indicateur, pas un bouton. */
.m3d-mlhidden{display:flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;
  color:var(--m3d-muted);cursor:default}
.m3d-mlhidden > svg{width:16px;height:16px}
.m3d-mlact,.m3d-mlremove{display:flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;padding:0;
  border:none;background:transparent;color:var(--m3d-muted);cursor:pointer}
.m3d-mlact{border-radius:var(--m3d-radius-sm)}
.m3d-mlremove{border-radius:50%}
.m3d-mlact:hover,.m3d-mlremove:hover{background:color-mix(in srgb,var(--m3d-text) 12%,transparent);color:var(--m3d-text)}
/* Menu déroulant d'actions (portail) : réutilise .m3d-menu-panel/-item/-label.
   Le menu est PORTÉ dans .m3d-root (cf. MarkerList) — frère du HUD flottant
   (.m3d-floathud, z-index floatingHud), PAS enfant du plan carte. Il doit donc
   passer au z-index des MENUS (--m3d-z-menu), au-dessus du HUD : --m3d-z-list-menu
   (96) vit dans le plan carte, sous mapOverlay, et le peindrait derrière le panneau. */
/* Menu d'une ligne : borné en hauteur et scrollable — sinon un menu à beaucoup d'items
   (Cibler + menu hôte) déborde SOUS le bas de l'écran et devient inatteignable. */
.m3d-mlmenu{position:absolute;z-index:var(--m3d-z-menu,9999);min-width:160px;
  max-height:min(60vh,420px);overflow-y:auto}
`
