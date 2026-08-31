export const CSS_TOOLTIPS = `
/* Infobulle de marker (survol) : title + content ReactNode fournis par l'hôte.
   Ancrée au-dessus du marker (--m3d-tiplift = rayon + marge), non interactive. */
.m3d-markertip{position:absolute;left:0;top:0;pointer-events:none;z-index:var(--m3d-z-tooltip,90);
  transform:translate(-50%,calc(-100% - var(--m3d-tiplift,32px)));
  padding:8px 11px;min-width:120px;max-width:240px;
  animation:m3d-tip-in .16s ease-out}
.m3d-markertip-title{font-size:var(--m3d-size-sm);font-weight:var(--m3d-weight-semibold);color:var(--m3d-text);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Étiquette du graticule : même châssis que l'infobulle de marker, mais POSÉE sur sa ligne
   (pas d'ancre, pas de décalage vertical, pas d'animation d'entrée — elles sont permanentes
   et il y en a jusqu'à quarante). La transformée est écrite par la couche à chaque frame :
   la règle ne doit surtout pas en poser une, elle serait écrasée. */
.m3d-graticule-label{z-index:var(--m3d-z-graticule-label,1);
  padding:2px 6px;min-width:0;max-width:none;animation:none;
  color:var(--m3d-graticule-label);background:var(--m3d-graticule-label-bg);
  will-change:transform}
.m3d-graticule-label .m3d-markertip-title{font-size:var(--m3d-size-xs,11px);
  font-weight:var(--m3d-weight-medium);color:var(--m3d-graticule-label)}
/* Le contenu est une LISTE : une information par ligne (m3d-markertip-row),
   jamais de concaténation wrappée sur une ligne. */
.m3d-markertip-content{display:flex;flex-direction:column;gap:3px;
  font-size:11.5px;color:var(--m3d-muted);margin-top:2px}
.m3d-markertip-title + .m3d-markertip-content{margin-top:5px}
.m3d-markertip-row{display:flex;align-items:center;gap:6px;white-space:nowrap}
.m3d-markertip-row span{overflow:hidden;text-overflow:ellipsis}
/* Marker urgent : infobulle en style URGENCE — bordure, titre et halo rouges
   (couleur thème attention.target), distincte au premier coup d'œil. */
.m3d-markertip.m3d-markertip-urgent{
  border:2.5px solid color-mix(in srgb,var(--m3d-target-color,#ff3b30) 85%,transparent);
  box-shadow:var(--m3d-shadow-lg),0 0 12px color-mix(in srgb,var(--m3d-target-color,#ff3b30) 45%,transparent)}
.m3d-markertip-urgent .m3d-markertip-title{color:var(--m3d-target-color,#ff3b30)}
/* ⚠️ Entrée en OPACITÉ SEULE, et ce n'est pas un choix esthétique : la position de
   l'infobulle est MESURÉE pour la rabattre dans le conteneur (cf. MarkerTip, mesure
   'visual'). Animer sa position ferait mesurer une image de l'animation. */
@keyframes m3d-tip-in{from{opacity:0}}

/* APPARENCE des infobulles de barre (react-tooltip), au langage visuel de
   .m3d-markertip (panneau thémé) plutôt qu'au gris #222 par défaut du paquet.
   Répartition des responsabilités, à ne pas confondre :
   — react-tooltip injecte LUI-MÊME, au runtime, ses styles « core » (position,
     opacité 0 → show, transitions, variables --rt-*). On les garde : c'est le
     COMPORTEMENT, et il n'est pas à nous.
   — les <Tooltip> passent disableStyleInjection pour couper son style « base »
     (couleurs, radius, padding). Sans ça, ses variants entreraient en concurrence
     avec les règles ci-dessous à spécificité égale — l'apparence dépendrait alors
     de l'ORDRE d'insertion des balises <style>, donc de l'ordre de montage.
   L'import de react-tooltip/dist/react-tooltip.css a été retiré : redondant avec
   l'injection runtime, et Vite l'extrayait en dist/map3d.css — un fichier que le
   champ "exports" du package.json ne déclare pas, donc un artefact mort.
   On ne cible QUE les classes d'état STABLES (react-tooltip__show, __closing,
   __place-*), jamais les classes CSS-modules hashées
   (core-styles-module_tooltip__xxxxx), dont le hash change à chaque version. */
/* ⚠️ PAS --m3d-z-tooltip : cette variable-là décrit le plan LOCAL d'une infobulle
   enfermée dans l'ancre d'un marker (.m3d-markertip). Celle-ci est portée à la racine
   par <MapTooltip>, donc SŒUR des panneaux : elle a son propre plan racine, réglable
   comme les six autres. Le portail est indispensable — rendue dans sa barre, qui est
   une racine d'empilement, aucune valeur ne l'en aurait sortie. */
.m3d-tip{z-index:var(--m3d-z-bar-tooltip,992);width:max-content;max-width:260px;padding:6px 9px;
  font-size:11.5px;font-weight:var(--m3d-weight-medium);line-height:1.35}
/* Deux classes = spécificité supérieure au « show » du core (opacité .9) : opaque
   franc, comme les autres surfaces de la lib. */
.m3d-tip.react-tooltip__show{opacity:1}
/* Flèche : carré hérité du fond, tourné de 45° vers le bord ancré (le core lui
   donne déjà position, background:inherit et le z-index qui la glisse SOUS le
   corps — seuls ses deux côtés extérieurs restent visibles). */
.m3d-tip-arrow{width:8px;height:8px;border:1px solid var(--m3d-border)}
[class*='react-tooltip__place-top']>.m3d-tip-arrow{transform:rotate(45deg)}
[class*='react-tooltip__place-right']>.m3d-tip-arrow{transform:rotate(135deg)}
[class*='react-tooltip__place-bottom']>.m3d-tip-arrow{transform:rotate(225deg)}
[class*='react-tooltip__place-left']>.m3d-tip-arrow{transform:rotate(315deg)}
`
