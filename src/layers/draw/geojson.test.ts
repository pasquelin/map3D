import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Projection } from '../../core/Projection'
import type { LatLng } from '../../shared'
import { DrawLayer, type DrawDefaults, type GeoJSONFeatureCollection, type NewShape } from '../DrawLayer'

// Filet anti-régression (Tâche 0) : fige le round-trip GeoJSON réel de `DrawLayer`
// (`toGeoJSON`/`fromGeoJSON`) avant tout déplacement de fichier. `Projection` non
// contextualisée (`setContext` jamais appelé) a `isReady() === false` : `rebuildOne`
// ressort tôt (lu dans `DrawLayer.rebuildOne`), donc aucun rendu WebGL réel n'est
// nécessaire pour exercer la sérialisation — seule la géométrie lat/lng compte ici.

const DEFAULTS: DrawDefaults = { color: '#3388ff', width: 2, fillOpacity: 0.3 }

function makeLayer(): DrawLayer {
  return new DrawLayer(new THREE.Group(), new Projection(), document.createElement('div'), DEFAULTS)
}

const RECT_POINTS: LatLng[] = [
  { lat: 48.85, lng: 2.35 },
  { lat: 48.85, lng: 2.36 },
  { lat: 48.86, lng: 2.36 },
  { lat: 48.86, lng: 2.35 },
]

const LINE_POINTS: LatLng[] = [
  { lat: 48.87, lng: 2.37 },
  { lat: 48.88, lng: 2.38 },
]

const SYMBOL_POINT: LatLng[] = [{ lat: 48.89, lng: 2.39 }]

describe('DrawLayer.toGeoJSON', () => {
  it('polygone fermé : anneau GeoJSON reboucle sur le premier point, coordonnées en [lng, lat]', () => {
    const layer = makeLayer()
    const id = layer.addShape({
      kind: 'polygon',
      points: RECT_POINTS,
      closed: true,
      style: { color: '#f00', width: 3, fillOpacity: 0.5 },
      title: 'Zone',
      tags: ['draw', 'polygon'],
    } satisfies NewShape)

    const fc = layer.toGeoJSON()
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(1)
    const feature = fc.features[0]!
    expect(feature.id).toBe(id)
    expect(feature.geometry.type).toBe('Polygon')
    if (feature.geometry.type !== 'Polygon') throw new Error('unreachable')
    const ring = feature.geometry.coordinates[0]!
    // 4 sommets + fermeture = 5, premier et dernier identiques.
    expect(ring).toHaveLength(RECT_POINTS.length + 1)
    expect(ring[0]).toEqual([RECT_POINTS[0]!.lng, RECT_POINTS[0]!.lat])
    expect(ring[ring.length - 1]).toEqual(ring[0])
    expect(feature.properties.kind).toBe('polygon')
    expect(feature.properties.title).toBe('Zone')
    expect(feature.properties.tags).toEqual(['draw', 'polygon'])
  })

  it('ligne ouverte : LineString sans point de fermeture', () => {
    const layer = makeLayer()
    layer.addShape({
      kind: 'line',
      points: LINE_POINTS,
      closed: false,
      style: {},
    } satisfies NewShape)

    const fc = layer.toGeoJSON()
    const feature = fc.features[0]!
    expect(feature.geometry.type).toBe('LineString')
    if (feature.geometry.type !== 'LineString') throw new Error('unreachable')
    expect(feature.geometry.coordinates).toHaveLength(LINE_POINTS.length)
    expect(feature.geometry.coordinates).toEqual(LINE_POINTS.map((p) => [p.lng, p.lat]))
  })

  it('symbole : géométrie Point (un seul point, jamais LineString)', () => {
    const layer = makeLayer()
    layer.addShape({
      kind: 'symbol',
      points: SYMBOL_POINT,
      closed: false,
      symbol: { key: 'hospital', variant: 'friend' },
      style: {},
    } satisfies NewShape)

    const fc = layer.toGeoJSON()
    const feature = fc.features[0]!
    expect(feature.geometry.type).toBe('Point')
    if (feature.geometry.type !== 'Point') throw new Error('unreachable')
    expect(feature.geometry.coordinates).toEqual([SYMBOL_POINT[0]!.lng, SYMBOL_POINT[0]!.lat])
    expect(feature.properties.symbol).toEqual({ key: 'hospital', variant: 'friend' })
  })
})

describe('DrawLayer round-trip toGeoJSON → fromGeoJSON', () => {
  it('préserve id, points, closed, kind, style essentiel, tags, title, meta, locked', () => {
    const source = makeLayer()
    const polyId = source.addShape({
      kind: 'rect',
      points: RECT_POINTS,
      closed: true,
      style: { color: '#0f0', width: 4, fillOpacity: 0.6 },
      title: 'Emprise',
      tags: ['draw', 'rect', 'zone-a'],
      meta: { uuid: 'abc-123', group: 7 },
      locked: true,
    } satisfies NewShape)
    const lineId = source.addShape({
      kind: 'line',
      points: LINE_POINTS,
      closed: false,
      style: { color: '#00f', width: 1, fillOpacity: 0 },
      tags: ['draw', 'line'],
    } satisfies NewShape)

    const fc: GeoJSONFeatureCollection = source.toGeoJSON()

    const target = makeLayer()
    target.fromGeoJSON(fc)
    const shapes = target.getShapes()
    expect(shapes).toHaveLength(2)

    const poly = target.getShape(polyId)
    expect(poly).not.toBeNull()
    expect(poly!.kind).toBe('rect')
    expect(poly!.closed).toBe(true)
    expect(poly!.points).toEqual(RECT_POINTS)
    expect(poly!.title).toBe('Emprise')
    expect(poly!.style.color).toBe('#0f0')
    expect(poly!.style.width).toBe(4)
    expect(poly!.style.fillOpacity).toBe(0.6)
    expect(poly!.tags).toEqual(['draw', 'rect', 'zone-a'])
    expect(poly!.meta).toEqual({ uuid: 'abc-123', group: 7 })
    expect(poly!.locked).toBe(true)

    const line = target.getShape(lineId)
    expect(line).not.toBeNull()
    expect(line!.kind).toBe('line')
    expect(line!.closed).toBe(false)
    expect(line!.points).toEqual(LINE_POINTS)
    expect(line!.tags).toEqual(['draw', 'line'])
    // `locked` absent en entrée : `insertShape`/`fromGeoJSON` ne posent jamais `false`
    // explicite, seul `undefined` (lu dans `Drawing.locked?`).
    expect(line!.locked).toBeUndefined()
  })

  it('anneau fermé [a,b,c,a] : le point de fermeture est retiré au re-import (pas de sommet dégénéré)', () => {
    const source = makeLayer()
    source.addShape({
      kind: 'polygon',
      points: RECT_POINTS,
      closed: true,
      style: {},
    } satisfies NewShape)

    const fc = source.toGeoJSON()
    const ring = (fc.features[0]!.geometry as { type: 'Polygon'; coordinates: number[][][] }).coordinates[0]!
    expect(ring).toHaveLength(RECT_POINTS.length + 1)

    const target = makeLayer()
    target.fromGeoJSON(fc)
    const shape = target.getShapes()[0]!
    // Le round-trip ne réintroduit PAS le point de fermeture dans le modèle interne.
    expect(shape.points).toHaveLength(RECT_POINTS.length)
    expect(shape.points).toEqual(RECT_POINTS)
  })
})
