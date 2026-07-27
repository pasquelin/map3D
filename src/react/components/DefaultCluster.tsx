import { type CSSProperties, type ReactNode, useState } from 'react'
import { createPortal } from 'react-dom'
import { clamp, RAD2DEG } from '../../core/math'
import type { ClusterInfo } from '../../layers/ClusterLayer'
import type { MapTheme } from '../../theme/types'
import { markerColorOf } from '../../theme/colors'

export type DefaultClusterProps = {
  cluster: ClusterInfo
  theme: MapTheme
  /** Icône d'un type, en fragment SVG (viewBox `0 0 24 24`, `currentColor`) — affichée dans le segment. */
  typeIcon?: (type: string) => ReactNode
  /** Libellé lisible d'un type, pour l'infobulle au survol. */
  typeLabel?: (type: string) => string
  /** Infobulle interne par satellite — coupée quand l'hôte fournit `clusterTooltip`
   *  (sinon deux infobulles se superposeraient au survol). */
  satelliteTip?: boolean
  /** Notifie le type de la part survolée (`null` : cœur ou sortie) — permet à
   *  l'hôte une infobulle par segment distincte de l'infobulle globale. */
  onSegmentHover?: (type: string | null) => void
}

type Tip = { x: number; y: number; below: boolean; label: string; count: number; color: string }

const RING_W = 30

/** Contour blanc des parts — il déborde du rayon extérieur de sa moitié. */
const STROKE_W = 2.5

/** Rayon extérieur (px) du donut par défaut — l'ancrage de l'infobulle de
 *  cluster le lit pour ne jamais recouvrir le camembert. */
export const defaultClusterRadius = (total: number): number => Math.min(28, 19 + Math.sqrt(total)) + RING_W

/**
 * Cluster par défaut, en **donut** : un cœur portant le **nombre total** (couleur
 * propre au cluster, sans icône) entouré d'un **anneau segmenté par type** (parts
 * égales ≤ 4 types, proportionnelles au-delà). Chaque part porte, le long de l'arc,
 * l'icône du type + son compte, et une **infobulle stylée** au survol (clampée aux
 * bords de la fenêtre).
 */
export function DefaultCluster({ cluster, theme, typeIcon, typeLabel, satelliteTip = true, onSegmentHover }: DefaultClusterProps) {
  const { total, counts, types } = cluster
  const [tip, setTip] = useState<Tip | null>(null)
  // Parts TOUJOURS égales (360° / nombre de types) — le compte est le chiffre, pas la taille.

  const colorOf = (type: string) => markerColorOf(theme, type)
  const core = theme.colors.cluster // couleur PROPRE du cluster (indépendante des types)

  const ro = defaultClusterRadius(total)
  /**
   * Boîte du sprite : le donut, et RIEN d'autre (demi-trait de contour compris).
   *
   * Elle était figée à 150 px — la taille du plus gros donut possible — alors que le
   * rayon, lui, dépend du nombre de points : il restait jusqu'à 25 px de vide tout
   * autour. Ce vide n'est pas neutre, c'est la boîte qui porte le survol : l'infobulle
   * s'ouvrait avant que le pointeur n'ait atteint le camembert, et le curseur
   * `pointer` s'allumait dans le vide. Dimensionner la boîte au dessin fait
   * disparaître le problème à sa source, plutôt que de rattraper le test de survol
   * après coup (découpe CSS, retrait du conteneur du test…).
   */
  const box = Math.ceil(2 * (ro + STROKE_W / 2))
  const C = box / 2
  const cr = ro - RING_W // cœur compact
  const rm = (cr + ro) / 2
  const gap = types.length > 1 ? 0.045 : 0

  const x = (r: number, a: number) => C + r * Math.cos(a)
  const y = (r: number, a: number) => C + r * Math.sin(a)
  const sector = (a0: number, a1: number): string => {
    const large = a1 - a0 > Math.PI ? 1 : 0
    return (
      `M ${x(cr, a0)} ${y(cr, a0)} L ${x(ro, a0)} ${y(ro, a0)} ` +
      `A ${ro} ${ro} 0 ${large} 1 ${x(ro, a1)} ${y(ro, a1)} ` +
      `L ${x(cr, a1)} ${y(cr, a1)} A ${cr} ${cr} 0 ${large} 0 ${x(cr, a0)} ${y(cr, a0)} Z`
    )
  }

  let acc = Math.PI // départ à 9h → 2 parts haut/bas, dominante en haut
  const segs = types.map((type) => {
    const count = counts[type] ?? 0
    const sweep = (Math.PI * 2) / types.length
    const a0 = acc + gap / 2
    const a1 = acc + sweep - gap / 2
    acc += sweep
    const am = types.length === 1 ? Math.PI / 2 : (a0 + a1) / 2
    return { type, count, a0, a1, am, col: colorOf(type) }
  })

  const showTip = (e: { clientX: number; clientY: number }, type: string, count: number, color: string) => {
    if (!satelliteTip) return
    setTip({ x: e.clientX, y: e.clientY, below: e.clientY < 76, label: typeLabel?.(type) ?? type, count, color })
  }

  return (
    <div
      className="m3d-cluster"
      // Boîte, centrage et curseur sont en CSS (`.m3d-cluster`) : seule la taille varie.
      style={{ '--m3d-sprite': `${box}px` } as CSSProperties}
    >
      <svg viewBox={`0 0 ${box} ${box}`}>
        {segs.map((s) => {
          // Icône + nombre alignés le long de l'ARC (redressés) → suivent la courbe.
          const a = Math.atan2(Math.sin(s.am), Math.cos(s.am))
          const rot = a * RAD2DEG + 90 + (a > 0 ? 180 : 0)
          return (
            <g
              key={s.type}
              className="m3d-cluster-sat"
              onPointerMove={(e) => {
                showTip(e, s.type, s.count, s.col.base)
                onSegmentHover?.(s.type)
              }}
              onPointerLeave={() => {
                setTip(null)
                onSegmentHover?.(null)
              }}
            >
              {segs.length === 1 ? (
                <circle cx={C} cy={C} r={ro} fill={s.col.base} stroke="#fff" strokeWidth={STROKE_W} />
              ) : (
                <path d={sector(s.a0, s.a1)} fill={s.col.base} stroke="#fff" strokeWidth={STROKE_W} strokeLinejoin="round" />
              )}
              <g transform={`translate(${x(rm, s.am)}, ${y(rm, s.am)}) rotate(${rot})`} style={{ pointerEvents: 'none' }}>
                {typeIcon ? (
                  <g transform="translate(-9, 0) scale(0.82) translate(-12, -12)" style={{ color: s.col.contrast }}>
                    {typeIcon(s.type)}
                  </g>
                ) : null}
                <text
                  x={typeIcon ? 9 : 0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={s.count > 99 ? 11 : 13}
                  fontWeight={800}
                  fill={s.col.contrast}
                >
                  {s.count}
                </text>
              </g>
            </g>
          )
        })}
        <g className="m3d-cluster-core" style={{ pointerEvents: 'none' }}>
          <circle cx={C} cy={C} r={cr + STROKE_W} fill={core.ring} />
          <circle cx={C} cy={C} r={cr} fill={core.core} />
          <text
            x={C}
            y={C + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={total > 99 ? 16 : 19}
            fontWeight={800}
            fill={core.text}
          >
            {total}
          </text>
        </g>
      </svg>

      {tip && createPortal(
            <div
              style={{
                position: 'fixed',
                // Clampe horizontalement pour ne jamais sortir de la fenêtre (bords du canvas).
                left: clamp(tip.x, 78, window.innerWidth - 78),
                top: tip.below ? tip.y + 18 : tip.y - 14,
                transform: tip.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 10px',
                borderRadius: 8,
                background: 'rgba(17,24,39,0.96)',
                color: '#fff',
                font: '600 12px/1 system-ui, -apple-system, sans-serif',
                whiteSpace: 'nowrap',
                boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
                pointerEvents: 'none',
                zIndex: 2147483647,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: tip.color, flex: '0 0 auto' }} />
              <span>{tip.label}</span>
              <span style={{ opacity: 0.6 }}>·</span>
              <span style={{ fontWeight: 800 }}>{tip.count}</span>
            </div>,
            document.body,
          )}
    </div>
  )
}
