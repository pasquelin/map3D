import type { LatLng, MarkerData } from 'map3d'
import { useState } from 'react'

import { typeColor } from '../config/colors'
import type { AnyData } from '../data/types'

/** Position de départ du point posé — un coin tranquille du 8ᵉ arrondissement. */
const PIN_START: LatLng = { lat: 48.8656, lng: 2.3212 }

const PIN_TYPE = 'alert-medium'

/**
 * Point éditable « pose ta position » : SEUL marker repositionnable du jeu — le
 * drapeau vit sur la donnée, pas sur la couche (cf. `MarkerData.repositionable`).
 */
export function useEditablePin(): { pinMarker: MarkerData<AnyData>; onReposition: (position: LatLng) => void } {
  const [position, setPosition] = useState<LatLng>(PIN_START)

  return {
    pinMarker: {
      id: 'pin-editable',
      type: PIN_TYPE,
      tags: ['pin'],
      selectedColor: typeColor(PIN_TYPE),
      position,
      repositionable: true,
      // Priorité d'affichage : le point qu'on est en train de poser ne doit pas
      // passer sous un marker voisin. La sélection et le menu ouvert restent
      // au-dessus.
      zIndex: 10,
      data: { id: -1, severity: 'medium', title: 'Position à définir (déplaçable)', address: 'Point posé par l’opérateur', city: 'paris' },
    },
    onReposition: setPosition,
  }
}
