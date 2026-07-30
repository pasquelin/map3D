import type { CSSProperties } from 'react'
import type { MarkerData } from '../../data/types'
import type { MapTheme } from '../../theme/types'
import { markerColorOf } from '../../theme/colors'

export type DefaultMarkerProps = {
  marker: MarkerData
  theme: MapTheme
  label?: string
}

/** Rendu de marker par défaut : pastille dégradée + anneau + halo radar optionnel. */
export function DefaultMarker({ marker, theme, label }: DefaultMarkerProps) {
  const color = markerColorOf(theme, marker.type)
  const size = theme.markers.size
  const halo = theme.animations.enabled && theme.animations.halo !== false
  const r = size / 2
  const gid = `m3d-g-${marker.type}`

  return (
    <div
      className="m3d-marker"
      // Boîte, centrage et curseur sont en CSS (`.m3d-marker`) : seule la taille varie.
      style={{ '--m3d-sprite': `${size}px` } as CSSProperties}
      // PRÉSENTATIONNEL, comme la branche `<img alt="">` qui lui fait face dans
      // `MarkerLayer` : ce composant est le CONTENU d'un nœud de marker qui porte déjà
      // `role="button"`, `tabIndex` et son `aria-label`. Les reprendre ici imbriquait un
      // bouton dans un bouton, doublait l'arrêt de tabulation et faisait annoncer le
      // libellé deux fois. L'interactivité appartient au nœud qui tient le clic.
    >
      <svg viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color.accent} />
            <stop offset="1" stopColor={color.base} />
          </linearGradient>
        </defs>
        {halo && (
          <circle
            cx={r}
            cy={r}
            r={r * 0.72}
            fill={color.base}
            opacity={0.22}
            style={{
              transformOrigin: `${r}px ${r}px`,
              animation: `m3d-halo ${theme.animations.halo !== false ? theme.animations.halo.duration : 2600}ms cubic-bezier(.2,.6,.35,1) infinite`,
            }}
          />
        )}
        <circle cx={r} cy={r} r={r * 0.68} fill="#fff" />
        <circle cx={r} cy={r} r={r * 0.56} fill={theme.markers.gradient ? `url(#${gid})` : color.base} />
        {theme.markers.gloss && <ellipse cx={r} cy={r * 0.8} rx={r * 0.42} ry={r * 0.28} fill="#fff" opacity={0.25} />}
        {label && (
          <text x={r} y={r + 4} textAnchor="middle" fontSize={size * 0.32} fontWeight={700} fill={color.contrast}>
            {label}
          </text>
        )}
      </svg>
    </div>
  )
}
