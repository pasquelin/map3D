import { type LatLng, MapMath, type ShapeData } from '@pasquelin/map3d'

import { BUILDING_COLOR, VOLUME_COLORS, ZONE_STROKE } from '../config/colors'
import { CITY_LIST } from './cities'
import { offsetMeters } from './geo'

/* ══════════════════ ZONES ET BÂTIMENTS ══════════════════ */

/**
 * Zones de couverture opérationnelle, une par ville (cf. `cities.ts`).
 *
 * La même liste alimente l'affichage, les CONTRAINTES du dessin
 * (`draw.constraints.limits` — une forme est acceptée dès qu'elle tient dans l'une
 * d'elles, donc on peut dessiner dans les trois villes) et la démo de cadrage
 * (`boundsOfShapes`).
 */
export const DEMO_SHAPES: ShapeData[] = CITY_LIST.map((c) => ({
  id: `zone-${c.id}`,
  // Nommée, donc trouvable : la recherche cadre la zone entière (son emprise), là
  // où un marker ne ferait que survoler un point. Une forme sans `title` reste
  // affichée mais n'est indexée nulle part.
  title: `Zone ${c.label}`,
  kind: 'circle',
  center: c.center,
  radiusMeters: c.radiusMeters,
  color: ZONE_STROKE,
  fillOpacity: 0.1,
}))

/* ── Emprises de bâtiments ─────────────────────────────────────────────────────
   Un bâtiment se décrit par son centre, ses dimensions au sol et son ORIENTATION
   (azimut du grand côté, 0 = nord). Écrire les quatre coins à la main pour chacun
   serait illisible et faux dès qu'un bâtiment n'est pas aligné sur les méridiens —
   ce qui est le cas général (les quais, les pistes, les nefs suivent le terrain). */

/** Rectangle géodésique orienté : 4 coins autour d'un centre. */
const footprint = (center: LatLng, lengthM: number, widthM: number, headingDeg: number): LatLng[] => {
  const th = headingDeg * MapMath.DEG2RAD
  // Axe du grand côté et sa perpendiculaire, en composantes (est, nord).
  const axis = { e: Math.sin(th), n: Math.cos(th) }
  const side = { e: Math.cos(th), n: -Math.sin(th) }
  const halfL = lengthM / 2
  const halfW = widthM / 2
  return (
    [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ] as const
  ).map(([a, b]) =>
    offsetMeters(center, a * halfL * axis.e + b * halfW * side.e, a * halfL * axis.n + b * halfW * side.n),
  )
}

type BuildingSeed = {
  id: string
  center: LatLng
  /** Grand côté (m), petit côté (m) et azimut du grand côté (deg, 0 = nord). */
  length: number
  width: number
  heading: number
  /** Hauteur réelle du bâti, en mètres — c'est elle qui donne le relief à la scène. */
  height: number
}

const BUILDING_SEEDS: BuildingSeed[] = [
  // ── Paris
  { id: 'bld-louvre', center: { lat: 48.86025, lng: 2.33905 }, length: 160, width: 160, heading: 0, height: 25 },
  { id: 'bld-tour-eiffel', center: { lat: 48.8584, lng: 2.2945 }, length: 125, width: 125, heading: 0, height: 300 },
  { id: 'bld-gare-du-nord', center: { lat: 48.8809, lng: 2.3553 }, length: 210, width: 140, heading: 20, height: 38 },
  { id: 'bld-opera-garnier', center: { lat: 48.8719, lng: 2.3316 }, length: 173, width: 125, heading: 0, height: 55 },
  { id: 'bld-gare-de-lyon', center: { lat: 48.8443, lng: 2.3735 }, length: 220, width: 120, heading: 100, height: 35 },
  { id: 'bld-grande-arche', center: { lat: 48.8926, lng: 2.2361 }, length: 110, width: 110, heading: 60, height: 110 },
  // ── Nice
  { id: 'bld-negresco', center: { lat: 43.6949, lng: 7.2596 }, length: 75, width: 45, heading: 70, height: 30 },
  { id: 'bld-aeroport-t2', center: { lat: 43.6647, lng: 7.2185 }, length: 330, width: 90, heading: 75, height: 22 },
  { id: 'bld-gare-nice-ville', center: { lat: 43.7045, lng: 7.262 }, length: 160, width: 70, heading: 90, height: 24 },
  { id: 'bld-acropolis', center: { lat: 43.7031, lng: 7.276 }, length: 180, width: 85, heading: 30, height: 28 },
  // ── Vernon
  {
    id: 'bld-collegiale-vernon',
    center: { lat: 49.0937, lng: 1.4855 },
    length: 60,
    width: 24,
    heading: 85,
    height: 30,
  },
  { id: 'bld-mairie-vernon', center: { lat: 49.0941, lng: 1.4826 }, length: 48, width: 28, heading: 0, height: 18 },
  { id: 'bld-gare-vernon', center: { lat: 49.0908, lng: 1.4747 }, length: 90, width: 22, heading: 105, height: 12 },
  { id: 'bld-hopital-vernon', center: { lat: 49.0885, lng: 1.4885 }, length: 110, width: 55, heading: 20, height: 24 },
]

/** Bâtiments ronds : arènes et tours, où un rectangle mentirait sur la forme. */
const ROUND_BUILDINGS: ShapeData[] = [
  {
    id: 'bld-stade-de-france',
    kind: 'circle',
    center: { lat: 48.9245, lng: 2.3601 },
    radiusMeters: 115,
    extrudeHeight: 45,
  },
  {
    id: 'bld-allianz-riviera',
    kind: 'circle',
    center: { lat: 43.7052, lng: 7.1925 },
    radiusMeters: 105,
    extrudeHeight: 40,
  },
  {
    id: 'bld-tourelles-vernon',
    kind: 'circle',
    center: { lat: 49.0916, lng: 1.479 },
    radiusMeters: 15,
    extrudeHeight: 22,
  },
]

/**
 * Volumes bâtis des trois villes — de quoi juger l'extrusion sur du vrai relief
 * urbain : la Tour Eiffel à 300 m, la nef d'une collégiale à 30 m, un terminal
 * d'aéroport long de 330 m. À survoler en vue inclinée.
 *
 * Le style est appliqué une fois, à la fin : les emprises ne décrivent que la
 * géométrie, quelle que soit leur forme.
 */
export const BUILDINGS: ShapeData[] = [
  ...BUILDING_SEEDS.map((b): ShapeData => ({
    id: b.id,
    kind: 'polygon',
    points: footprint(b.center, b.length, b.width, b.heading),
    extrudeHeight: b.height,
  })),
  ...ROUND_BUILDINGS,
].map((s) => ({ ...s, color: BUILDING_COLOR, fillOpacity: 0.22 }))

/**
 * Zones VOLUMÉTRIQUES réglables à chaud (`extrudeHeight`) : le pendant de l'ancien
 * `Map3D` de l'Operator, qui extrudait ses zones à 200 m au-dessus du sol. À
 * comparer avec le cercle drapé de Paris en inclinant la vue — et à surveiller au
 * pan : la base du volume doit rester rigoureusement collée au sol, sans glisser.
 *
 * La hauteur est portée PAR ZONE : deux volumes voisins peuvent avoir des hauteurs
 * différentes, et elle se règle depuis le banc de test.
 */
export const demoVolumes = (height: number): ShapeData[] => [
  {
    title: 'Volume haut — Cité',
    kind: 'polygon',
    points: [
      { lat: 48.8625, lng: 2.3345 },
      { lat: 48.8625, lng: 2.3425 },
      { lat: 48.8575, lng: 2.3425 },
      { lat: 48.8575, lng: 2.3345 },
    ],
    color: VOLUME_COLORS.tall,
    fillOpacity: 0.18,
    extrudeHeight: height,
  },
  // Second volume, hauteur DIFFÉRENTE (moitié) : la hauteur est bien un réglage
  // de la zone, pas de la couche.
  {
    title: 'Volume bas — Saint-Augustin',
    kind: 'circle',
    center: { lat: 48.8655, lng: 2.3255 },
    radiusMeters: 220,
    color: VOLUME_COLORS.short,
    fillOpacity: 0.18,
    extrudeHeight: Math.round(height / 2),
  },
]

/** Surface maximale autorisée pour une forme dessinée (contrainte métier de démo). */
export const MAX_DRAW_AREA_M2 = 10_000_000
