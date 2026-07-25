import {
  mdiArrowTopRight,
  mdiCircleOutline,
  mdiCursorDefaultOutline,
  mdiEraser,
  mdiGesture,
  mdiLasso,
  mdiRuler,
  mdiSelect,
  mdiSwapHorizontal,
  mdiVectorLine,
  mdiVectorPolygon,
  mdiVectorRectangle,
  mdiVectorSquare,
} from '@mdi/js'
import Icon from '@mdi/react'
import { formatLabel } from '../../labels/mergeLabels'
import type { DrawStyle, DrawTool, SelectMode, StrokeStyle } from '../../layers/DrawLayer'
import { useLabels } from '../context'

/** Icône de chaque outil (toolbar, panneau Réglages) — libellés dans `labels.tools`. */
export const TOOL_ICONS: Record<DrawTool, string> = {
  select: mdiCursorDefaultOutline,
  line: mdiVectorLine,
  polygon: mdiVectorPolygon,
  rect: mdiVectorRectangle,
  circle: mdiCircleOutline,
  freehand: mdiGesture,
  arrow: mdiArrowTopRight,
  measure: mdiRuler,
  erase: mdiEraser,
}

/**
 * Contrôles de style partagés entre le panneau de style (sélection/outil actif)
 * et le panneau Réglages (défauts par outil) — jamais dupliqués.
 */

export type SwatchTarget = 'stroke' | 'fill'

/**
 * Modes de l'outil sélection : correspondance mode ↔ action clavier ↔ icône —
 * table unique consommée par le flyout ET le dispatch clavier (ajouter un mode =
 * une seule ligne ici + son raccourci par défaut + son libellé `labels.selectModes`).
 */
export const SELECT_MODE_META: Array<{
  mode: SelectMode
  action: 'selectRect' | 'selectPoly' | 'selectLasso'
  icon: string
}> = [
  { mode: 'rect', action: 'selectRect', icon: mdiSelect },
  { mode: 'poly', action: 'selectPoly', icon: mdiVectorSquare },
  { mode: 'lasso', action: 'selectLasso', icon: mdiLasso },
]

const WIDTHS = [0, 2, 4, 8, 14]
const STROKE_OPACITIES = [0.25, 0.5, 0.75, 0.95]
const OPACITIES = [0, 0.3, 0.6, 1]
const RADII = [0, 10, 25, 50]
const STROKES: Array<{ value: StrokeStyle; style: 'solid' | 'dashed' | 'dotted' }> = [
  { value: 'solid', style: 'solid' },
  { value: 'dashed', style: 'dashed' },
  { value: 'dotted', style: 'dotted' },
]

/**
 * Swatches superposés façon Photoshop/Illustrator : carré plein = fond (dessus à
 * gauche), carré-cadre = bordure (dessous à droite), flèche d'échange en coin.
 * Cliquer un swatch en fait la cible de la palette (liseré accent).
 */
export function ColorSwatches({
  stroke,
  fill,
  target,
  onTarget,
  onSwap,
}: {
  stroke: string
  fill: string
  target: SwatchTarget
  onTarget: (t: SwatchTarget) => void
  onSwap: () => void
}) {
  const labels = useLabels()
  return (
    <div className="m3d-swatches">
      <button
        type="button"
        aria-label={labels.style.fill}
        className={`m3d-swatch m3d-swatch-fill${target === 'fill' ? ' m3d-active' : ''}`}
        style={{ background: fill }}
        onClick={() => onTarget('fill')}
      />
      <button
        type="button"
        aria-label={labels.style.stroke}
        className={`m3d-swatch m3d-swatch-stroke${target === 'stroke' ? ' m3d-active' : ''}`}
        onClick={() => onTarget('stroke')}
      >
        <span style={{ borderColor: stroke }} />
      </button>
      <button type="button" aria-label={labels.style.swap} className="m3d-swap" onClick={onSwap}>
        <Icon path={mdiSwapHorizontal} size={0.55} />
      </button>
    </div>
  )
}

/** Palette du thème + pastille arc-en-ciel ouvrant le sélecteur de couleur natif. */
export function PalettePicker({ palette, onPick }: { palette: readonly string[]; onPick: (color: string) => void }) {
  const labels = useLabels()
  return (
    <div className="m3d-palette">
      {palette.map((c) => (
        <button
          type="button"
          key={c}
          aria-label={formatLabel(labels.style.color, { color: c })}
          className="m3d-palette-dot"
          style={{ background: c }}
          onClick={() => onPick(c)}
        />
      ))}
      <label className="m3d-palette-dot m3d-palette-custom" aria-label={labels.style.customColor}>
        <input type="color" onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  )
}

/** Épaisseur de bordure : presets visuels, ∅ = pas de bordure. */
export function WidthPicker({ value, onChange }: { value?: number; onChange: (w: number) => void }) {
  const labels = useLabels()
  return (
    <div className="m3d-presets">
      {WIDTHS.map((w) => (
        <button
          type="button"
          key={w}
          aria-label={w === 0 ? labels.style.noBorder : formatLabel(labels.style.borderWidth, { width: w })}
          className={`m3d-preset${value === w ? ' m3d-on' : ''}`}
          onClick={() => onChange(w)}
        >
          {w === 0 ? <span className="m3d-preset-none">∅</span> : <span className="m3d-preset-bar" style={{ height: Math.min(w, 10) }} />}
        </button>
      ))}
    </div>
  )
}

/** Style de trait : plein, tirets, pointillés. */
export function StrokeStylePicker({ value, onChange }: { value?: StrokeStyle; onChange: (s: StrokeStyle) => void }) {
  const labels = useLabels()
  return (
    <div className="m3d-presets">
      {STROKES.map((s) => (
        <button
          type="button"
          key={s.value}
          aria-label={labels.style[s.value]}
          className={`m3d-preset m3d-preset-wide${value === s.value ? ' m3d-on' : ''}`}
          onClick={() => onChange(s.value)}
        >
          <span className="m3d-preset-line" style={{ borderTopStyle: s.style }} />
        </button>
      ))}
    </div>
  )
}

/** Opacité (fond ou bordure) : presets sur damier. */
export function OpacityPicker({
  value,
  onChange,
  values = OPACITIES,
}: {
  value?: number
  onChange: (o: number) => void
  values?: readonly number[]
}) {
  const labels = useLabels()
  return (
    <div className="m3d-presets">
      {values.map((o) => (
        <button
          type="button"
          key={o}
          aria-label={formatLabel(labels.style.opacityPreset, { percent: Math.round(o * 100) })}
          className={`m3d-preset${value === o ? ' m3d-on' : ''}`}
          onClick={() => onChange(o)}
        >
          <span className="m3d-preset-checker">
            <span style={{ opacity: o }} />
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * Éditeur de style complet (swatches + palette + rangées bordure/trait/opacités/
 * angles) — partagé par le panneau de style (sélection) et le panneau Réglages
 * (défauts par outil) : seuls la source des valeurs et le callback diffèrent.
 */
export function StyleEditor({
  style,
  onPatch,
  palette,
  fallbackColor,
  target,
  onTarget,
  title,
  showRadius = false,
}: {
  style: DrawStyle
  onPatch: (patch: DrawStyle) => void
  palette: readonly string[]
  fallbackColor: string
  target: SwatchTarget
  onTarget: (t: SwatchTarget) => void
  /** Texte à droite des swatches — défaut : la cible de la palette. */
  title?: string
  showRadius?: boolean
}) {
  const labels = useLabels()
  const stroke = style.color ?? fallbackColor
  const fill = style.fillColor ?? style.color ?? fallbackColor
  return (
    <>
      <div className="m3d-style-head">
        <ColorSwatches
          stroke={stroke}
          fill={fill}
          target={target}
          onTarget={onTarget}
          onSwap={() => onPatch({ color: fill, fillColor: stroke })}
        />
        <span className="m3d-style-title">
          {title ?? (target === 'fill' ? labels.style.fill : labels.style.stroke)}
        </span>
      </div>
      <PalettePicker palette={palette} onPick={(c) => onPatch(target === 'fill' ? { fillColor: c } : { color: c })} />
      <div className="m3d-style-row">
        <span className="m3d-style-label">{labels.style.border}</span>
        <WidthPicker value={style.width} onChange={(width) => onPatch({ width })} />
      </div>
      <div className="m3d-style-row">
        <span className="m3d-style-label">{labels.style.strokeStyle}</span>
        <StrokeStylePicker value={style.stroke} onChange={(stroke) => onPatch({ stroke })} />
      </div>
      <div className="m3d-style-row">
        <span className="m3d-style-label">{labels.style.strokeOpacity}</span>
        <OpacityPicker
          value={style.strokeOpacity}
          values={STROKE_OPACITIES}
          onChange={(strokeOpacity) => onPatch({ strokeOpacity })}
        />
      </div>
      <div className="m3d-style-row">
        <span className="m3d-style-label">{labels.style.fillOpacity}</span>
        <OpacityPicker value={style.fillOpacity} onChange={(fillOpacity) => onPatch({ fillOpacity })} />
      </div>
      {showRadius && (
        <div className="m3d-style-row">
          <span className="m3d-style-label">{labels.style.corners}</span>
          <RadiusPicker value={style.radius} onChange={(radius) => onPatch({ radius })} />
        </div>
      )}
    </>
  )
}

/** Rayon d'angle des rectangles : % du petit côté. */
export function RadiusPicker({ value, onChange }: { value?: number; onChange: (r: number) => void }) {
  const labels = useLabels()
  return (
    <div className="m3d-presets">
      {RADII.map((r) => (
        <button
          type="button"
          key={r}
          aria-label={formatLabel(labels.style.cornerRadius, { radius: r })}
          className={`m3d-preset${value === r ? ' m3d-on' : ''}`}
          onClick={() => onChange(r)}
        >
          <span className="m3d-preset-corner" style={{ borderTopLeftRadius: `${r}%` }} />
        </button>
      ))}
    </div>
  )
}
