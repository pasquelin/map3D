import type { LatLng, MarkerData } from '@pasquelin/map3d'

import type { CityId } from './cities'
import { seedToMarker } from './toMarkers'
import type { Defib } from './types'

/* ══════════════════ DÉFIBRILLATEURS — le DÉCOR de la carte ══════════════════
   Points fixes, relevés sur le terrain. Ils démontrent `MarkerData.static` :

   ① masqués sous `config.markers.staticMinZoom` (13 par défaut) — dézoomé sur la
     région, on veut voir les alertes, pas trente pastilles de mobilier urbain ;
   ② sauf ceux qui déclarent leur PROPRE seuil (`static: { minZoom }`) : `dae-04`
     apparaît dès 11, `dae-09` seulement à 16 ;
   ③ au-dessus du seuil, un type comme un autre : ils clusterisent avec les alertes
     et les agents, et prennent leur part dans le camembert.

   Ils restent cherchables à TOUT zoom (« défibrillateur » dans la loupe) : un seuil
   de zoom dit ce qui est lisible, pas ce qu'on a le droit de trouver. */

type DefibSeed = {
  id: string
  title: string
  address: string
  access: Defib['access']
  position: LatLng
  /**
   * Seuil PROPRE à ce point, à la place de `config.markers.staticMinZoom`. Un DAE de
   * gare se voit de loin (il dessert un quartier) ; un DAE au fond d'un hall n'a de
   * sens qu'une fois sur place.
   */
  minZoom?: number
}

const PARIS_DEFIBS: DefibSeed[] = [
  {
    id: 'dae-01',
    title: 'DAE — Mairie du 1er',
    address: '4 place du Louvre, 75001 Paris',
    access: 'intérieur',
    position: { lat: 48.8601, lng: 2.3416 },
  },
  {
    id: 'dae-02',
    title: 'DAE — Parvis Notre-Dame',
    address: 'Parvis Notre-Dame, 75004 Paris',
    access: 'public',
    position: { lat: 48.8534, lng: 2.3494 },
  },
  {
    id: 'dae-03',
    title: 'DAE — Champ-de-Mars',
    address: 'Allée Adrienne-Lecouvreur, 75007 Paris',
    access: 'public',
    position: { lat: 48.8579, lng: 2.2952 },
  },
  // Point de repère d'un quartier entier : visible bien avant les autres (11 au lieu
  // de 13) — c'est la DONNÉE qui le sait, pas un réglage global.
  {
    id: 'dae-04',
    title: 'DAE — Gare du Nord, hall',
    address: '18 rue de Dunkerque, 75010 Paris',
    access: 'intérieur',
    position: { lat: 48.8804, lng: 2.3548 },
    minZoom: 11,
  },
  {
    id: 'dae-05',
    title: 'DAE — Place de la Bastille',
    address: 'Place de la Bastille, 75011 Paris',
    access: 'public',
    position: { lat: 48.8529, lng: 2.3695 },
  },
  {
    id: 'dae-06',
    title: 'DAE — Sacré-Cœur',
    address: '35 rue du Chevalier-de-la-Barre, 75018 Paris',
    access: 'public',
    position: { lat: 48.8871, lng: 2.3428 },
  },
  // Trois DAE à ~40 m les uns des autres : au zoom moyen ils forment un cluster
  // d'un SEUL type — le camembert tombe alors sur son disque plein d'une seule part.
  {
    id: 'dae-07',
    title: 'DAE — Châtelet, sortie Rivoli',
    address: '1 place du Châtelet, 75001 Paris',
    access: 'public',
    position: { lat: 48.8583, lng: 2.347 },
  },
  {
    id: 'dae-08',
    title: 'DAE — Châtelet, quai RER A',
    address: '1 place du Châtelet, 75001 Paris',
    access: 'intérieur',
    position: { lat: 48.8586, lng: 2.3474 },
  },
  // À l'inverse : au fond d'un hall, il n'a de sens qu'une fois sur place (16).
  {
    id: 'dae-09',
    title: 'DAE — Théâtre du Châtelet',
    address: '2 rue Édouard-Colonne, 75001 Paris',
    access: 'intérieur',
    position: { lat: 48.858, lng: 2.3467 },
    minZoom: 16,
  },
]

const NICE_DEFIBS: DefibSeed[] = [
  {
    id: 'dae-30',
    title: 'DAE — Promenade des Anglais',
    address: '37 promenade des Anglais, 06000 Nice',
    access: 'public',
    position: { lat: 43.6945, lng: 7.2601 },
  },
  {
    id: 'dae-31',
    title: 'DAE — Place Masséna',
    address: 'Place Masséna, 06000 Nice',
    access: 'public',
    position: { lat: 43.6971, lng: 7.2711 },
  },
  {
    id: 'dae-32',
    title: 'DAE — Gare de Nice-Ville',
    address: 'Avenue Thiers, 06000 Nice',
    access: 'intérieur',
    position: { lat: 43.7041, lng: 7.2624 },
  },
]

const VERNON_DEFIBS: DefibSeed[] = [
  {
    id: 'dae-60',
    title: 'DAE — Hôtel de ville',
    address: 'Place Barette, 27200 Vernon',
    access: 'intérieur',
    position: { lat: 49.0938, lng: 1.4829 },
  },
  {
    id: 'dae-61',
    title: 'DAE — Gare de Vernon-Giverny',
    address: 'Place Georges-Pompidou, 27200 Vernon',
    access: 'public',
    position: { lat: 49.0905, lng: 1.4751 },
  },
]

// `static` est LE drapeau de la démonstration : le masquage au dézoom en découle dans
// la lib — l'application n'a rien d'autre à câbler. `true` prend le seuil de la
// config ; un point qui a le sien le déclare, et lui seul en change. C'est le seul
// écart au squelette commun (cf. `seedToMarker`).
const toMarkers = (seeds: DefibSeed[], city: CityId): MarkerData<Defib>[] =>
  seeds.map(({ position, minZoom, ...defib }) =>
    seedToMarker('defib', position, { ...defib, city }, ['defib', city], {
      static: minZoom === undefined ? true : { minZoom },
    }),
  )

export const DEFIBS: MarkerData<Defib>[] = [
  ...toMarkers(PARIS_DEFIBS, 'paris'),
  ...toMarkers(NICE_DEFIBS, 'nice'),
  ...toMarkers(VERNON_DEFIBS, 'vernon'),
]
