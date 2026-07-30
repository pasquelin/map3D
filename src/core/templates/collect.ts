// Collecte et découpe du dessin en template — fonctions pures (testées à part).
// Tout se joue en espace GeoJSON : c'est le format que `DrawLayer` sait déjà
// produire (`toGeoJSON`) et réingérer (`fromGeoJSON`, qui dé-doublonne les ids),
// donc rien à convertir vers le modèle interne.

import { boundsOfLatLngs } from '../bounds'
import type { DrawTool, GeoJSONFeatureCollection } from '../../layers/DrawLayer'
import type { TemplateCategory, TemplateStats } from './types'

// Réutilisé d'un appel à l'autre : `statsOf` est sur le chemin sauvegarde/import,
// jamais dans une boucle de frame, mais rien ne justifie d'en allouer un par appel.
const encoder = new TextEncoder()

/** Catégorie d'une forme d'après son `kind` (null pour les modes, jamais sérialisés). */
export function categoryOf(kind: DrawTool): TemplateCategory | null {
  if (kind === 'symbol') return 'symbols'
  if (kind === 'freehand') return 'freehand'
  if (kind === 'select' || kind === 'erase') return null
  return 'shapes'
}

const EMPTY: GeoJSONFeatureCollection = { type: 'FeatureCollection', features: [] }

/** Sous-collection ne gardant que les features des catégories demandées. */
export function filterByCategories(
  fc: GeoJSONFeatureCollection,
  cats: readonly TemplateCategory[],
): GeoJSONFeatureCollection {
  if (!cats.length) return EMPTY
  const set = new Set(cats)
  const features = fc.features.filter((f) => {
    const c = categoryOf(f.properties.kind)
    return c !== null && set.has(c)
  })
  return { type: 'FeatureCollection', features }
}

/** Positions `[lng, lat]` d'une feature, quelle que soit sa géométrie. */
function positionsOf(coords: number[] | number[][] | number[][][]): number[][] {
  if (coords.length === 0) return []
  // Point = number[] ; LineString = number[][] ; Polygon = number[][][].
  if (typeof coords[0] === 'number') return [coords as number[]]
  if (typeof (coords[0] as number[])[0] === 'number') return coords as number[][]
  return (coords as number[][][]).flat()
}

/** Compteurs par catégorie, emprise et poids JSON du contenu. */
export function statsOf(fc: GeoJSONFeatureCollection): TemplateStats {
  let shapes = 0
  let freehand = 0
  let symbols = 0
  const points: { lat: number; lng: number }[] = []
  for (const f of fc.features) {
    const c = categoryOf(f.properties.kind)
    if (c === 'shapes') shapes++
    else if (c === 'freehand') freehand++
    else if (c === 'symbols') symbols++
    for (const p of positionsOf(f.geometry.coordinates)) {
      const lng = p[0]
      const lat = p[1]
      if (lng === undefined || lat === undefined) continue
      points.push({ lat, lng })
    }
  }
  // `boundsOfLatLngs` et non un min/max maison : il déroule les longitudes (deux
  // formes de part et d'autre de ±180° donneraient sinon une emprise du tour du globe)
  // et rejette les coordonnées non finies.
  const bounds = boundsOfLatLngs(points)
  const bytes = encoder.encode(JSON.stringify(fc)).length
  return { shapes, freehand, symbols, bounds, bytes }
}

/**
 * Union de deux collections (mode « fusion »), **idempotente par id** : une feature
 * de `add` dont l'id est déjà présent dans `base` n'est pas rajoutée. Sans quoi
 * ré-appliquer le même template empilerait ses formes en double à chaque clic.
 */
export function mergeCollections(
  base: GeoJSONFeatureCollection,
  add: GeoJSONFeatureCollection,
): GeoJSONFeatureCollection {
  const have = new Set(base.features.map((f) => f.id).filter((v): v is string => v !== undefined))
  const additions = add.features.filter((f) => f.id === undefined || !have.has(f.id))
  return { type: 'FeatureCollection', features: [...base.features, ...additions] }
}

/**
 * Fusionne le contenu d'un template DANS le dessin courant — idempotent PAR TEMPLATE.
 *
 * ⚠️ Les `Feature.id` d'un template sont les ids LOCAUX du `DrawLayer` (`draw-N`,
 * compteur remis à zéro à chaque session) : deux templates sauvegardés indépendamment
 * en partagent presque toujours. Une fusion dédupliquée par id BRUT (`mergeCollections`)
 * perdait alors toutes les formes du second (ids « déjà présents »). On préfixe donc
 * chaque id par celui du template : collisions impossibles entre templates différents,
 * tout en gardant l'idempotence (re-cliquer le même template ne réempile pas ses formes).
 */
export function mergeTemplateInto(
  current: GeoJSONFeatureCollection,
  template: GeoJSONFeatureCollection,
  templateId: string,
): GeoJSONFeatureCollection {
  return mergeCollections(current, namespaceTemplate(template, templateId))
}

/**
 * Id namespacé (IDEMPOTENT) d'une feature de template — la clé qui identifie la
 * provenance d'une forme, partagée par fusion, remplacement et retrait. Idempotent :
 * ré-appliqué sur un id déjà préfixé, il ne double pas le préfixe — sans quoi « mettre à
 * jour » (qui re-sauve les ids déjà namespacés du dessin) casserait le retrait suivant.
 */
const templateIdFor = (templateId: string, featureId: string | undefined, index: number): string => {
  const base = featureId ?? String(index)
  return base.startsWith(`${templateId}:`) ? base : `${templateId}:${base}`
}

/**
 * Copie de la collection d'un template avec ses ids namespacés par l'id du template.
 * C'est cette clé, posée à l'application (fusion OU remplacement), que `removeTemplateFrom`
 * retrouve — d'où un retrait fiable quel que soit le mode de chargement, et sans
 * correspondance géométrique approximative.
 */
export function namespaceTemplate(template: GeoJSONFeatureCollection, templateId: string): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: template.features.map((f, i) => ({ ...f, id: templateIdFor(templateId, f.id, i) })),
  }
}

/**
 * Inverse de `mergeTemplateInto` : retire du dessin courant les formes venues de CE
 * template (mode « retirer »), reconnues à leur id namespacé.
 */
export function removeTemplateFrom(
  current: GeoJSONFeatureCollection,
  template: GeoJSONFeatureCollection,
  templateId: string,
): GeoJSONFeatureCollection {
  const owned = new Set(namespaceTemplate(template, templateId).features.map((f) => f.id))
  return { type: 'FeatureCollection', features: current.features.filter((f) => f.id === undefined || !owned.has(f.id)) }
}
