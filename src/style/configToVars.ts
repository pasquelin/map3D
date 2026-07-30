import type { MapConfig } from '../config/types'

/**
 * Convertit les réglages qui pilotent la feuille de styles en custom properties
 * `--m3d-*`, à poser sur l'élément racine à côté de celles du thème.
 *
 * Pourquoi un module distinct de `themeToVars` : l'échelle d'empilement n'est pas une
 * affaire d'apparence mais d'INTÉGRATION — l'application a ses propres modales et
 * tiroirs, et doit pouvoir glisser la carte au-dessus ou au-dessous. Elle vit donc
 * dans `MapConfig`, et cette fonction est son pendant de `themeToVars`.
 *
 * Les valeurs étaient auparavant écrites en dur dans une trentaine de règles CSS,
 * sans qu'aucune ne les rassemble : rien ne disait que « barres » et « panneaux »
 * partageaient le même palier, ni que le dock passait volontairement dessous.
 */
export function configToVars(config: MapConfig): Record<string, string> {
  const z = config.style.zIndex
  return {
    '--m3d-z-map-overlay': String(z.mapOverlay),
    '--m3d-z-relation-bar': String(z.relationBar),
    '--m3d-z-edit-overlay': String(z.editOverlay),
    '--m3d-z-floating-hud': String(z.floatingHud),
    '--m3d-z-marker-selected': String(z.markerSelected),
    '--m3d-z-tooltip': String(z.tooltip),
    '--m3d-z-list-menu': String(z.listMenu),
    '--m3d-z-dock': String(z.dock),
    '--m3d-z-ui': String(z.ui),
    '--m3d-z-menu': String(z.menu),
    '--m3d-z-modal': String(z.modal),
    // Cible cliquable du point au sol : une tolérance de pointeur, donc du même
    // ressort que les autres de `interaction` — elle vivait pourtant dans le CSS.
    '--m3d-reposition-hit': `${config.interaction.repositionHitPx}px`,
    // Fondu de fin d'intro — le pendant CSS de `startup.introDuration`, qui lui
    // était déjà réglable.
    '--m3d-intro-fade': `${config.startup.introFadeMs}ms`,
  }
}
