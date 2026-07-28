import { mdiContentCopy, mdiMapMarkerOutline } from '@mdi/js'
import Icon from '@mdi/react'
import type { BuildingInfo, MenuItem } from 'map3d'

/**
 * Menu d'un bâtiment : ce que la lib remonte, puis deux actions de démonstration.
 *
 * Tout le texte vient d'ICI — la lib n'en écrit aucun, pas même un titre : elle ne sait
 * pas ce qu'un bâtiment représente pour l'application qui l'affiche.
 *
 * Ce n'est pas un hook et rien n'y est capturé : la prop `buildingMenu` de `<Map>` peut
 * donc être ce module tel quel, sans mémoïsation à tenir.
 */
export function buildingMenu(info: BuildingInfo): MenuItem[] {
  const coord = `${info.lat.toFixed(5)}, ${info.lng.toFixed(5)}`
  return [
    { label: 'Identifiant', hint: info.featureId ?? '—', disabled: true },
    { label: 'Coordonnée', hint: coord, disabled: true },
    { label: 'Hauteur', hint: `${Math.round(info.height)} m`, disabled: true },
    // Une base non nulle est l'exception (porche, pilotis) : ne pas encombrer sinon.
    ...(info.minHeight > 0 ? [{ label: 'Base', hint: `${Math.round(info.minHeight)} m`, disabled: true }] : []),
    { separator: true },
    {
      icon: <Icon path={mdiContentCopy} size={0.7} />,
      label: 'Copier la coordonnée',
      onSelect: () => void navigator.clipboard?.writeText(coord),
    },
    {
      icon: <Icon path={mdiMapMarkerOutline} size={0.7} />,
      label: 'Voir sur OpenStreetMap',
      // Sans identifiant, il n'y a pas d'objet OSM à ouvrir : l'entrée reste visible mais
      // inerte, plutôt que d'apparaître et disparaître d'un bâtiment à l'autre.
      disabled: info.featureId === null,
      onSelect: () => window.open(`https://www.openstreetmap.org/way/${info.featureId}`, '_blank', 'noopener'),
    },
  ]
}
