import type { MarkerData } from '@pasquelin/map3d'

import { typeColor } from '../config/colors'
import { type Glyph, markerTypeSpec } from '../config/markerTypes'
import type { AnyData } from '../data/types'

/* ══════════════════ Icônes SVG des markers ══════════════════
   Rasterisées sur les sprites WebGL, donc 100 % collées à la carte. Le pictogramme
   vient du registre (`config/markerTypes.ts`) : ce fichier ne décide de rien, il
   dessine — c'est le pendant SVG de `icons/clusterIcons.tsx`. */

/** Pastille circulaire centrée (ancrage = centre) : ombre + anneau blanc + disque + symbole. */
const badge = (color: string, inner: string): string =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
  '<circle cx="40" cy="41.5" r="29" fill="rgba(0,0,0,0.30)"/>' +
  '<circle cx="40" cy="40" r="29" fill="#ffffff"/>' +
  `<circle cx="40" cy="40" r="24" fill="${color}"/>` +
  inner +
  '</svg>'

const text = (s: string): string =>
  `<text x="40" y="41" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,sans-serif" font-weight="800" font-size="30" fill="#ffffff">${s}</text>`

const GLYPHS: Record<Glyph, string> = {
  shield: '<path d="M40 26l12 4.2v7.6c0 7.4-5.2 12.6-12 14.6-6.8-2-12-7.2-12-14.6v-7.6z" fill="#ffffff"/>',
  dot: '<circle cx="40" cy="40" r="7.5" fill="#ffffff"/>',
  warning: text('!'),
  info: text('i'),
  // Cœur barré d'un éclair : le pictogramme d'un défibrillateur, pas un « j'aime ».
  heart:
    '<path d="M40 54c-8-5.4-13-10.8-13-16.8 0-4.4 3.2-7.6 7.2-7.6 2.8 0 5 1.5 5.8 3.6.8-2.1 3-3.6 5.8-3.6 4 0 7.2 3.2 7.2 7.6 0 6-5 11.4-13 16.8z" fill="#ffffff"/>' +
    '<path d="M41.4 34.5l-5.2 6.6h3.6l-1.4 5.4 5.4-6.9h-3.6z" fill="#0d9488"/>',
}

/**
 * SVG du marker, mémoïsé par TYPE — le sprite ne dépend que de lui, alors que le
 * flux temps réel fabrique des objets markers neufs à chaque tick (le cache de la
 * lib, clé sur l'objet, y manque donc systématiquement).
 */
const svgCache = new Map<string, string>()

const svgForType = (type: string): string => {
  let svg = svgCache.get(type)
  if (svg === undefined) {
    svg = badge(typeColor(type), GLYPHS[markerTypeSpec(type)?.glyph ?? 'warning'])
    svgCache.set(type, svg)
  }
  return svg
}

/** SVG (source) du marker — ce que consomme `markersLayer({ icon })`. */
export const iconFor = (m: MarkerData<AnyData>): string => svgForType(m.type)

/** Encode un SVG en data-URI, pour les surfaces HTML (dock, listes) qui veulent une image. */
export const svgToDataUri = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Data-URI du marker — même dessin que sur la carte, dans un `<img>`. */
export const iconDataUri = (type: string): string => svgToDataUri(svgForType(type))
