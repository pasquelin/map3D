import {
  mdiBugOutline,
  mdiCityVariantOutline,
  mdiCropFree,
  mdiCubeOutline,
  mdiHandBackRightOffOutline,
  mdiMagnifyExpand,
  mdiMagnifyMinusOutline,
  mdiMapMarkerRadiusOutline,
} from '@mdi/js'
import Icon from '@mdi/react'
import { ContextMenu, type InteractiveMode, type MapHandle, type MenuItem, ToolButton, altitudeForZoom, boundsOfMarkers, boundsOfShapes } from 'map3d'
import { type RefObject, useState } from 'react'

import { ALERTS } from '../data/alerts'
import { CITY_LIST, TEST_POINT } from '../data/cities'
import { DEMO_SHAPES } from '../data/shapes'

const VOLUME_HEIGHTS = [0, 100, 200, 400]

type DemoToolsMenuProps = {
  /** Poignée de la carte : chaque entrée passe par elle, aucune n'a besoin d'un hook. */
  map: RefObject<MapHandle | null>
  interactive: InteractiveMode
  onCycleInteractive: () => void
  volumeHeight: number
  onVolumeHeight: (height: number) => void
}

/**
 * Banc de test de la démo : un seul bouton dans la barre, le reste en sous-menu —
 * plutôt que six icônes que rien ne relie. L'état courant se lit dans les `hint`.
 *
 * Ces outils prennent le langage visuel des outils natifs (`ToolButton`,
 * `ContextMenu`) au lieu de flotter dans un coin de la carte.
 */
export function DemoToolsMenu({ map, interactive, onCycleInteractive, volumeHeight, onVolumeHeight }: DemoToolsMenuProps) {
  const [open, setOpen] = useState(false)

  // Construites À L'OUVERTURE : le composant est re-rendu au rythme du flux temps
  // réel, et ces entrées (8 objets, autant d'icônes React) n'existent que le temps
  // que le menu est là.
  const buildItems = (): MenuItem[] => [
    {
      icon: <Icon path={mdiCityVariantOutline} size={0.7} />,
      label: 'Villes',
      hint: `${CITY_LIST.length}`,
      // Les données couvrent trois terrains distants : sans ce saut, il faudrait
      // traverser la France à la main pour voir ceux de Nice ou de Vernon.
      children: CITY_LIST.map((c) => ({
        label: c.label,
        onSelect: () => map.current?.camera.flyTo(c.center, { altitude: altitudeForZoom(c.zoom) }),
      })),
    },
    {
      icon: <Icon path={mdiMagnifyExpand} size={0.7} />,
      label: 'Cadrer alertes',
      // `minAltitude` sous le défaut « recherche de lieu » (350 m) : un groupe de
      // markers resserré resterait sinon cadré trop haut.
      onSelect: () => {
        const b = boundsOfMarkers(ALERTS)
        if (b) map.current?.camera.fitBounds(b, { padding: 60, minAltitude: 120 })
      },
    },
    {
      icon: <Icon path={mdiCropFree} size={0.7} />,
      label: 'Cadrer zone',
      hint: 'G',
      // Padding asymétrique : le contenu se centre dans la zone RESTÉE visible.
      onSelect: () => {
        const b = boundsOfShapes(DEMO_SHAPES)
        if (b) map.current?.camera.fitBounds(b, { padding: { left: 320, top: 40, right: 40, bottom: 40 } })
      },
    },
    {
      icon: <Icon path={mdiMapMarkerRadiusOutline} size={0.7} />,
      label: 'Recentrer',
      onSelect: () => map.current?.camera.panTo(TEST_POINT),
    },
    {
      icon: <Icon path={mdiMagnifyMinusOutline} size={0.7} />,
      label: 'Zoom 12',
      onSelect: () => map.current?.camera.setZoom(12),
    },
    { separator: true },
    {
      icon: <Icon path={mdiHandBackRightOffOutline} size={0.7} />,
      label: 'Interactivité',
      hint: String(interactive),
      // Cycle true → 'view' → false. `interactive` fige la CARTE, pas cette barre :
      // le menu reste utilisable pour revenir en arrière.
      onSelect: onCycleInteractive,
    },
    {
      icon: <Icon path={mdiCubeOutline} size={0.7} />,
      label: 'Volumes',
      hint: `${volumeHeight} m`,
      // `extrudeHeight` est une propriété de LA ZONE : le cercle vert reste à la
      // moitié de cette valeur — deux zones, deux hauteurs.
      children: VOLUME_HEIGHTS.map((h) => ({ label: `${h} m`, onSelect: () => onVolumeHeight(h) })),
    },
  ]

  return (
    <div style={{ position: 'relative' }}>
      <ToolButton icon={mdiBugOutline} label="Banc de test (cadrage, interactivité, volumes)" active={open} onClick={() => setOpen((v) => !v)} />
      {open && (
        <ContextMenu
          items={buildItems()}
          onClose={() => setOpen(false)}
          // Ancré au bouton plutôt qu'au curseur (le défaut du menu contextuel).
          style={{ position: 'absolute', left: '100%', top: 0, marginLeft: 6 }}
        />
      )}
    </div>
  )
}
