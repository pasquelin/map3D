import { memo, useMemo } from 'react'
import type { DrawTool, GeoJSONFeatureCollection } from '../../layers/DrawLayer'

export type TemplateThumbProps = {
  draw: GeoJSONFeatureCollection
  /** Côté du carré de rendu (px). */
  size?: number
}

type Poly = { kind: DrawTool; ring: number[][]; closed: boolean; color: string; fill: string; point?: number[] }

// Constantes de rendu de la vignette (px du viewBox / opacité). Volontairement locales et
// NON dans `theme` : une vignette 40px n'a pas de charte propre, et `segments: 24` reste
// bien en deçà de `config.performance.circleSegments` (le contour d'un cercle de 32px ne
// gagne rien au-delà). Nommées et hissées ici pour qu'aucune ne soit un nombre nu dans le JSX.
const THUMB = { segments: 24, pad: 4, pointR: 2.6, fillOpacity: 0.35, strokeShape: 1.2, strokeLine: 1.4 } as const

/** Points bruts `[lng,lat]` d'une géométrie (anneau fermé dédupliqué inclus). */
function pointsOf(geom: GeoJSONFeatureCollection['features'][number]['geometry']): number[][] {
  if (geom.type === 'Point') return [geom.coordinates]
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0] ?? []
    // Anneau GeoJSON : dernier = premier. Retiré pour la reconstruction.
    return ring.length > 1 ? ring.slice(0, -1) : ring
  }
  return geom.coordinates
}

/**
 * Reconstruit la géométrie DESSINÉE depuis les points stockés.
 *
 * `rect`/`circle` FRAÎCHEMENT tracés ne gardent que **2 points** (coins opposés /
 * centre + rayon), le contour étant recalculé au rendu — la vignette doit faire pareil.
 * MAIS dès qu'ils sont ÉDITÉS, `EditController` les normalise en anneau complet (4
 * coins pour un rect). D'où le test sur `=== 2` : au-delà, les points SONT déjà le
 * contour, et les prendre pour « 2 coins opposés » dessinait un trait dégénéré.
 */
function reconstruct(kind: DrawTool, pts: number[][]): { ring: number[][]; closed: boolean } {
  const closed = kind === 'polygon' || kind === 'rect' || kind === 'circle'
  if (kind === 'rect' && pts.length === 2) {
    const a = pts[0]!
    const b = pts[1]!
    return { ring: [a, [b[0]!, a[1]!], b, [a[0]!, b[1]!]], closed: true }
  }
  if (kind === 'circle' && pts.length === 2) {
    const c = pts[0]!
    const e = pts[1]!
    const r = Math.hypot(e[0]! - c[0]!, e[1]! - c[1]!)
    const ring: number[][] = []
    for (let i = 0; i < THUMB.segments; i++) {
      const t = (i / THUMB.segments) * Math.PI * 2
      ring.push([c[0]! + r * Math.cos(t), c[1]! + r * Math.sin(t)])
    }
    return { ring, closed: true }
  }
  return { ring: pts, closed }
}

/**
 * Vignette d'aperçu d'un template : géométries du dessin projetées et auto-cadrées
 * dans un `<svg>` léger — aucun three.js, aucun GPU. Couleurs prises sur chaque forme.
 *
 * `memo` : `tpl.content.draw` est une ref stable tant que le template n'est pas réécrit,
 * or la liste se re-rend à chaque `reg.version` (et à chaque frame de tracé, panneau
 * ouvert). Sans mémo, toutes les vignettes reprojetaient tous leurs points à chaque fois.
 */
export const TemplateThumb = memo(function TemplateThumb({ draw, size = 40 }: TemplateThumbProps) {
  const polys = useMemo<Poly[]>(
    () =>
      draw.features.map((f) => {
        const kind = f.properties.kind
        const pts = pointsOf(f.geometry)
        if (f.geometry.type === 'Point') {
          return { kind, ring: [], closed: false, color: f.properties.color, fill: f.properties.color, point: pts[0] }
        }
        const { ring, closed } = reconstruct(kind, pts)
        return { kind, ring, closed, color: f.properties.color, fill: f.properties.fillColor ?? f.properties.color }
      }),
    [draw],
  )

  const project = useMemo(() => {
    const pad = THUMB.pad
    const inner = size - 2 * pad
    let north = -Infinity
    let south = Infinity
    let east = -Infinity
    let west = Infinity
    for (const p of polys) {
      const all = p.point ? [p.point, ...p.ring] : p.ring
      for (const c of all) {
        const lng = c[0]!
        const lat = c[1]!
        if (lat > north) north = lat
        if (lat < south) south = lat
        if (lng > east) east = lng
        if (lng < west) west = lng
      }
    }
    if (north === -Infinity) return null
    const spanLng = east - west || 1
    const spanLat = north - south || 1
    const span = Math.max(spanLng, spanLat) // ratio 1:1, pas de déformation
    return (c: number[]): [number, number] => {
      const x = pad + (inner * (c[0]! - west)) / span + (inner * (span - spanLng)) / (2 * span)
      const y = pad + (inner * (north - c[1]!)) / span + (inner * (span - spanLat)) / (2 * span)
      return [x, y]
    }
  }, [polys, size])

  return (
    <svg
      className="m3d-tpl-thumb"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      focusable="false"
    >
      {project &&
        polys.map((p, i) => {
          if (p.point) {
            const [x, y] = project(p.point)
            return <circle key={i} cx={x} cy={y} r={THUMB.pointR} fill={p.color} />
          }
          if (!p.ring.length) return null
          const pts = p.ring.map((c) => project(c).join(',')).join(' ')
          if (p.closed) {
            return (
              <polygon
                key={i}
                points={pts}
                fill={p.fill}
                fillOpacity={THUMB.fillOpacity}
                stroke={p.color}
                strokeWidth={THUMB.strokeShape}
              />
            )
          }
          return (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke={p.color}
              strokeWidth={THUMB.strokeLine}
              strokeLinejoin="round"
            />
          )
        })}
    </svg>
  )
})
