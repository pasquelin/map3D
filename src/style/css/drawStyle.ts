export const CSS_DRAW_STYLE = `
/* Panneau de style, ouvert par le BLOC DE COULEURS de la drawbar (son dernier bouton,
   dont l'aperçu est le style courant). Il règle les défauts des prochaines formes, ou
   restyle la sélection : swatches fond/bordure superposés façon Photoshop + palette +
   presets visuels (épaisseur, style de trait, opacité, angles). */
/* Positionnement, empilement et animation viennent de .m3d-dropdown, comme pour toute
   autre surface : ce panneau avait les siens — centrage vertical, offset calculé sur la
   largeur de la barre, paire de keyframes propre — et c'est ce qui en faisait le seul à
   ne pas se poser au niveau de la barre. Ne restent ici que sa largeur et son gabarit. */
.m3d-stylepanel{width:212px;padding:11px;display:flex;flex-direction:column;gap:9px;overflow-y:auto}
/* Bouton porteur de l'aperçu : il n'a pas d'icône à centrer mais une paire de carrés,
   qu'on veut voir aussi grande que le bouton le permet — d'où la marge interne nulle. */
.m3d-stylebtn{padding:0}
.m3d-style-head{display:flex;align-items:center;gap:12px}
.m3d-style-title{font-size:11.5px;color:var(--m3d-muted)}
/* Rayon et épaisseur du cadre DÉRIVENT du côté du carré : en dur, l'aperçu réduit de la
   barre héritait d'un cadre de 5 px sur un carré de 16 — presque plein, la couleur de
   bordure ne s'y lisait plus. */
.m3d-swatches{--m3d-swatch:28px;--m3d-swatch-box:46px;
  position:relative;display:block;width:var(--m3d-swatch-box);height:var(--m3d-swatch-box);flex:none}
.m3d-swatch{position:absolute;width:var(--m3d-swatch);height:var(--m3d-swatch);padding:0;cursor:pointer;
  border-radius:calc(var(--m3d-swatch) * .25);
  border:2px solid var(--m3d-panel);box-shadow:0 0 0 1px var(--m3d-border)}
.m3d-swatch-fill{left:0;top:0;z-index:2}
.m3d-swatch-stroke{right:0;bottom:0;z-index:1;background:transparent}
.m3d-swatch-stroke span{position:absolute;inset:1px;display:block;
  border:calc(var(--m3d-swatch) * .18) solid;border-radius:calc(var(--m3d-swatch) * .18)}
.m3d-swatch.m3d-active{outline:2px solid var(--m3d-accent);outline-offset:1px;z-index:3}
/* Aperçu de la barre : MÊME dessin, en fractions de la taille du bouton qui le porte
   (--m3d-btn-size, cf. CSS_CHASSIS). Il suit donc le compactage de la barre sans réécrire
   ni le gabarit ni le facteur — sans quoi il la ferait déborder dès qu'elle se resserre. */
.m3d-swatches-mini{--m3d-swatch:calc(var(--m3d-btn-size, 25px) * .4);
  --m3d-swatch-box:calc(var(--m3d-btn-size, 25px) * .63)}
.m3d-swatches-mini .m3d-swatch{cursor:inherit}
.m3d-swap{position:absolute;right:-3px;top:-5px;z-index:4;width:18px;height:18px;padding:0;
  display:flex;align-items:center;justify-content:center;border:none;border-radius:50%;
  background:var(--m3d-panel);color:var(--m3d-muted);cursor:pointer;box-shadow:0 0 0 1px var(--m3d-border)}
.m3d-swap:hover{color:var(--m3d-text)}
.m3d-palette{display:flex;gap:6px;flex-wrap:wrap}
.m3d-palette-dot{width:22px;height:22px;border-radius:50%;padding:0;cursor:pointer;
  border:2px solid color-mix(in srgb,#fff 30%,transparent);transition:transform .12s}
.m3d-palette-dot:hover{transform:scale(1.15)}
.m3d-palette-custom{background:conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);
  position:relative;overflow:hidden;display:block}
.m3d-palette-custom input{position:absolute;inset:0;opacity:0;cursor:pointer}
.m3d-style-row{display:flex;align-items:center;gap:8px}
.m3d-style-label{font-size:11px;color:var(--m3d-muted);width:42px;flex:none}
.m3d-presets{display:flex;gap:3px;flex:1;min-width:0}
.m3d-preset{flex:1;height:26px;min-width:0;display:flex;align-items:center;justify-content:center;
  border:1px solid var(--m3d-border);background:transparent;border-radius:var(--m3d-radius-sm);cursor:pointer;
  color:var(--m3d-text);padding:0;transition:background .14s,border-color .14s}
.m3d-preset:hover{background:color-mix(in srgb,var(--m3d-text) 8%,transparent)}
.m3d-preset.m3d-on{border-color:var(--m3d-accent);
  background:color-mix(in srgb,var(--m3d-accent) 20%,transparent)}
.m3d-preset-bar{display:block;width:64%;border-radius:99px;background:currentColor;min-height:1.5px}
.m3d-preset-none{font-size:13px;opacity:.7;line-height:1}
.m3d-preset-line{display:block;width:64%;border-top:2px solid currentColor}
.m3d-preset-checker{width:16px;height:16px;border-radius:4px;overflow:hidden;position:relative;
  background:repeating-conic-gradient(color-mix(in srgb,var(--m3d-text) 30%,transparent) 0% 25%,transparent 0% 50%) 0 0/8px 8px;
  box-shadow:inset 0 0 0 1px var(--m3d-border)}
.m3d-preset-checker span{position:absolute;inset:0;background:currentColor;display:block}
.m3d-preset-corner{width:13px;height:13px;border-top:2px solid currentColor;
  border-left:2px solid currentColor;display:block}
`
