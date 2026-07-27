import type { LatLng, MarkerData } from 'map3d'

import { typeColor } from '../config/colors'

/* ══════════════════ SQUELETTE COMMUN D'UN MARKER DE DÉMO ══════════════════
   Alertes, défibrillateurs et points générés remplissaient les mêmes sept champs, dans
   trois fichiers : `id` pris à la donnée, `type` qui commande la couleur, `title` qui
   rend le point survolable ET cherchable, `tags` pour le filtre « Couches ». Seul le
   DELTA changeait — `urgent`/`new` pour une alerte, `static` pour du décor.

   Une seule fabrique, donc : un champ ajouté à `MarkerData` s'écrit ici, pas trois
   fois avec le risque qu'un des trois soit oublié sans que rien ne le signale. */

/** Ce qu'une donnée métier de la démo doit porter pour se rendre en marker. */
type Identified = { id: string | number; title: string }

/**
 * Marker de démo à partir de sa donnée.
 *
 * `extra` porte ce qui est PROPRE à une famille (`urgent`, `new`, `static`,
 * `repositionable`) : il est appliqué avant `data`, qui reste donc toujours celle
 * passée en argument.
 */
export function seedToMarker<D extends Identified>(
  type: string,
  position: LatLng,
  data: D,
  tags: string[],
  extra?: Partial<MarkerData<D>>,
): MarkerData<D> {
  return {
    id: data.id,
    type,
    position,
    title: data.title,
    tags,
    selectedColor: typeColor(type),
    ...extra,
    data,
  }
}
