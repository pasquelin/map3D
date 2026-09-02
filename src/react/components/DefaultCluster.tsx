import { type CSSProperties, type ReactNode, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clamp, RAD2DEG } from '../../core/math'
import type { ClusterInfo } from '../../layers/ClusterLayer'
import type { MapTheme } from '../../theme/types'
import { markerColorOf } from '../../theme/colors'
import { useConfig, useLabels } from '../context'

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

type Tip = { label: string; count: number; color: string }

/** Rayon extérieur (px) du donut — l'ancrage de l'infobulle de cluster le lit pour
 *  ne jamais recouvrir le camembert.
 *
 *  Prend le thème en argument depuis que la géométrie y vit : les trois constantes
 *  de module qui la portaient (`RING_W`, `STROKE_W`, et la formule de rayon)
 *  doublaient `theme.clusters`, qui n'avait alors aucun consommateur. */
export const defaultClusterRadius = (total: number, theme: MapTheme): number =>
  theme.clusters.coreRadius(total) + theme.clusters.ringWidth

/**
 * Cluster par défaut, en **donut** : un cœur portant le **nombre total** (couleur
 * propre au cluster, sans icône) entouré d'un **anneau segmenté par type** (parts
 * égales ≤ 4 types, proportionnelles au-delà). Chaque part porte, le long de l'arc,
 * l'icône du type + son compte, et une **infobulle stylée** au survol (clampée aux
 * bords de la fenêtre).
 */
export function DefaultCluster({
  cluster,
  theme,
  typeIcon,
  typeLabel,
  satelliteTip = true,
  onSegmentHover,
}: DefaultClusterProps) {
  const { total, counts, types } = cluster
  const labels = useLabels()
  const [tip, setTip] = useState<Tip | null>(null)
  const config = useConfig()
  const tipCfg = config.interaction.tooltip
  const zIndex = config.style.zIndex
  // Parts TOUJOURS égales (360° / nombre de types) — le compte est le chiffre, pas la taille.

  const colorOf = (type: string) => markerColorOf(theme, type)
  const core = theme.colors.cluster // couleur PROPRE du cluster (indépendante des types)

  const { ringWidth: RING_W, strokeWidth: STROKE_W, segmentGap, startAngle, text, tip: tipTheme } = theme.clusters
  const ro = defaultClusterRadius(total, theme)
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
  const gap = types.length > 1 ? segmentGap : 0

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

  let acc = startAngle // cf. `theme.clusters.startAngle` (défaut 9h → 2 parts haut/bas)
  const segs = types.map((type) => {
    const count = counts[type] ?? 0
    const sweep = (Math.PI * 2) / types.length
    const a0 = acc + gap / 2
    const a1 = acc + sweep - gap / 2
    acc += sweep
    const am = types.length === 1 ? Math.PI / 2 : (a0 + a1) / 2
    return { type, count, a0, a1, am, col: colorOf(type) }
  })

  /**
   * Position de la vignette écrite DIRECTEMENT sur son nœud à chaque `pointermove`, le
   * state ne portant que le contenu (posé à l'entrée dans la part). Un `setState` par
   * mouvement re-rendait tout le donut — SVG, parts, textes — à la cadence du pointeur,
   * pour déplacer une boîte de trois spans.
   */
  const tipElRef = useRef<HTMLDivElement | null>(null)
  const tipPosRef = useRef({ x: 0, y: 0 })
  const placeTip = (el: HTMLDivElement) => {
    const { x, y } = tipPosRef.current
    const below = y < tipCfg.flipBelowPx
    el.style.left = `${clamp(x, tipCfg.clampMarginPx, window.innerWidth - tipCfg.clampMarginPx)}px`
    el.style.top = `${below ? y + tipCfg.offsetBelowPx : y - tipCfg.offsetAbovePx}px`
    el.style.transform = below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
  }
  // Callback ref : la vignette naît APRÈS le premier mouvement (le state la monte), donc
  // elle doit se placer d'elle-même à son apparition.
  const attachTip = (el: HTMLDivElement | null) => {
    tipElRef.current = el
    if (el) placeTip(el)
  }
  const moveTip = (e: { clientX: number; clientY: number }) => {
    tipPosRef.current = { x: e.clientX, y: e.clientY }
    if (tipElRef.current) placeTip(tipElRef.current)
  }
  const showTip = (e: { clientX: number; clientY: number }, type: string, count: number, color: string) => {
    if (!satelliteTip) return
    moveTip(e)
    setTip({ label: typeLabel?.(type) ?? type, count, color })
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
              onPointerEnter={(e) => {
                showTip(e, s.type, s.count, s.col.base)
                onSegmentHover?.(s.type)
              }}
              onPointerMove={satelliteTip ? moveTip : undefined}
              onPointerLeave={() => {
                setTip(null)
                onSegmentHover?.(null)
              }}
            >
              {segs.length === 1 ? (
                <circle cx={C} cy={C} r={ro} fill={s.col.base} stroke={core.stroke} strokeWidth={STROKE_W} />
              ) : (
                <path
                  d={sector(s.a0, s.a1)}
                  fill={s.col.base}
                  stroke={core.stroke}
                  strokeWidth={STROKE_W}
                  strokeLinejoin="round"
                />
              )}
              <g
                transform={`translate(${x(rm, s.am)}, ${y(rm, s.am)}) rotate(${rot})`}
                style={{ pointerEvents: 'none' }}
              >
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
                  fontSize={s.count >= text.wideFrom ? text.segmentSizeWide : text.segmentSize}
                  fontWeight={text.weight}
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
            fontSize={total >= text.wideFrom ? text.coreSizeWide : text.coreSize}
            fontWeight={text.weight}
            fill={core.text}
          >
            {total}
          </text>
        </g>
      </svg>

      {tip &&
        createPortal(
          <div
            ref={attachTip}
            // `left`/`top`/`transform` sont écrits par `placeTip` (clampés aux bords de la
            // fenêtre, retournés sous le pointeur près du haut), jamais par ce style.
            // Valeurs lues dans `theme.clusters.tip` et non via `--m3d-*` : ce portail vit
            // hors de `.m3d-root`, là où `themeToVars` pose ses variables.
            style={{
              position: 'fixed',
              display: 'flex',
              alignItems: 'center',
              gap: tipTheme.gap,
              padding: `${tipTheme.paddingY}px ${tipTheme.paddingX}px`,
              borderRadius: tipTheme.radius,
              background: tipTheme.background,
              color: tipTheme.color,
              font: `${tipTheme.weight} ${tipTheme.fontSize}px/1 ${theme.typography.fontFamily}`,
              whiteSpace: 'nowrap',
              boxShadow: tipTheme.shadow,
              pointerEvents: 'none',
              // Palier `style.zIndex.menu`, comme `.m3d-menu`. Lu ici en JS et non
              // via `--m3d-z-menu` : cette vignette est le seul portail de la lib
              // vers `document.body`, hors de `.m3d-root` où `configToVars` pose
              // ses variables. Le z-index maximal (2147483647) qu'elle portait la
              // faisait passer devant les modales de l'application hôte —
              // au-dessus de la carte, pas au-dessus de l'app.
              zIndex: zIndex.menu,
            }}
          >
            <span
              style={{
                width: tipTheme.dotSize,
                height: tipTheme.dotSize,
                borderRadius: '50%',
                background: tip.color,
                flex: '0 0 auto',
              }}
            />
            <span>{tip.label}</span>
            <span style={{ opacity: tipTheme.separatorOpacity }}>{labels.glyphs.separator}</span>
            <span style={{ fontWeight: text.weight }}>{tip.count}</span>
          </div>,
          document.body,
        )}
    </div>
  )
}
