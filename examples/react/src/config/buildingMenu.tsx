import { mdiContentCopy, mdiCropFree, mdiMapMarkerOutline } from '@mdi/js'
import Icon from '@mdi/react'
import type { BuildingInfo, MapHandle, MenuItem } from '@pasquelin/map3d'
import type { RefObject } from 'react'

/**
 * Menu d'un bâtiment : ce que la lib remonte, puis les actions de démonstration.
 *
 * Tout le texte vient d'ICI — la lib n'en écrit aucun, pas même un titre : elle ne sait pas
 * ce qu'un bâtiment représente pour l'application qui l'affiche.
 *
 * La poignée de carte arrive par REF et non par valeur : le menu est fabriqué une fois, et
 * `map.current` est lu au moment du clic. En dépendre referait la prop `buildingMenu` à
 * chaque rendu de `<App>`.
 */
export function createBuildingMenu(map: RefObject<MapHandle | null>): (info: BuildingInfo) => MenuItem[] {
  return (info) => {
    const coord = `${info.lat.toFixed(5)}, ${info.lng.toFixed(5)}`
    return [
      { label: 'Identifiant', hint: info.featureId ?? '—', disabled: true },
      { label: 'Coordonnée', hint: coord, disabled: true },
      { label: 'Hauteur', hint: `${Math.round(info.height)} m`, disabled: true },
      // Une base non nulle est l'exception (porche, pilotis) : ne pas encombrer sinon.
      ...(info.minHeight > 0 ? [{ label: 'Base', hint: `${Math.round(info.minHeight)} m`, disabled: true }] : []),
      { separator: true },
      {
        icon: <Icon path={mdiCropFree} size={0.7} />,
        label: 'Cadrer ce bâtiment',
        // `info.bounds` est l'emprise du volume, pas le point cliqué : la caméra cadre donc
        // le bâtiment entier. `padding` laisse voir ce qui l'entoure — cadré au plus juste,
        // on ne sait plus où l'on est.
        onSelect: () => map.current?.camera.fitBounds(info.bounds, { padding: 80 }),
      },
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
}
