export const CSS_SYMBOLS = `
/* ── Palette de symboles (SymbolPaletteButton) ────────────────────────────────
   Réutilise le langage du panneau « Couches » (m3d-panel, m3d-tagsearch,
   m3d-tagcount, m3d-tagempty) et n'ajoute que la grille de vignettes. */
/* Même flyout que « Couches » (cf. .m3d-tagpanel, où le bloc est groupé) : seule
   la largeur diffère, la grille de vignettes étant plus large qu'une liste. */
.m3d-sympalette{position:relative}
.m3d-sympanel{width:272px}
/* Choix d'affiliation : segments compacts, un seul actif. */
.m3d-symvariants{display:flex;gap:3px}
.m3d-symvariant{display:flex;align-items:center;justify-content:center;gap:4px;flex:1;min-width:0;
  padding:5px 4px;border:1px solid var(--m3d-border);border-radius:8px;background:transparent;
  cursor:pointer;font-family:inherit;font-size:var(--m3d-size-xs);color:var(--m3d-muted);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:background .14s,color .14s}
.m3d-symvariant:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-symvariant.m3d-on{background:var(--m3d-accent);border-color:var(--m3d-accent);color:#fff}
.m3d-symhint{display:flex;align-items:center;gap:5px;font-size:var(--m3d-size-xs);color:var(--m3d-muted)}
/* Seuls les groupes scrollent : recherche, affiliations et consigne restent visibles. */
.m3d-symgroups{display:flex;flex-direction:column;gap:9px;flex:1 1 auto;min-height:0;overflow-y:auto}
.m3d-symgroup-title{display:flex;align-items:center;gap:6px;margin:0 0 4px;padding:0 2px;
  font-size:var(--m3d-size-xs);font-weight:var(--m3d-weight-semibold);text-transform:uppercase;letter-spacing:.04em;
  color:var(--m3d-muted)}
.m3d-symgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:3px}
.m3d-symitem{display:grid;place-items:center;border:1px solid transparent;border-radius:9px;
  cursor:grab;transition:background .14s,border-color .14s,transform .1s}
.m3d-symitem:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent);
  border-color:var(--m3d-border)}
.m3d-symitem:active{transform:scale(.94)}
.m3d-symitem.m3d-disabled{cursor:default;opacity:.4}
.m3d-symitem.m3d-disabled:hover{background:none;border-color:transparent}
.m3d-symglyph{display:grid;place-items:center}
.m3d-symglyph > svg{width:100%;height:100%;display:block;overflow:visible}
.m3d-symskeleton{display:block;border-radius:var(--m3d-radius-sm);
  background:color-mix(in srgb,var(--m3d-text) 12%,transparent);
  animation:m3d-sympulse 1.1s ease-in-out infinite}
@keyframes m3d-sympulse{0%,100%{opacity:.45}50%{opacity:.9}}
/* Le ghost de palette n'a pas à grossir ×2.2 comme celui d'un marker vers la dock :
   il représente déjà la taille à laquelle le symbole sera posé. */
.m3d-drag-ghost.m3d-symghost,.m3d-drag-ghost.m3d-symghost.m3d-drag-over{
  transform:translate(-50%,-50%) scale(1)}
`
