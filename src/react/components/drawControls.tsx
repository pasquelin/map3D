import {
  mdiShapePlusOutline,
  mdiArrowTopRight,
  mdiCircleOutline,
  mdiCursorDefaultOutline,
  mdiEraser,
  mdiGesture,
  mdiGrid,
  mdiLasso,
  mdiRuler,
  mdiSelect,
  mdiSwapHorizontal,
  mdiVectorLine,
  mdiVectorPolygon,
  mdiVectorRectangle,
  mdiVectorSquare,
} from '@mdi/js'
import { UiIcon } from './UiIcon'
import type { ReactNode } from 'react'
import { formatLabel } from '../../labels/mergeLabels'
import type { DrawStyle, DrawTool, MeasureTool, SelectMode, StrokeStyle } from '../../layers/DrawLayer'
import { useDrawPresets, useLabels } from '../context'

/** Icône de chaque outil (toolbar, panneau Réglages) — libellés dans `labels.tools`. */
export const TOOL_ICONS: Record<DrawTool, string> = {
  symbol: mdiShapePlusOutline,
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
 * Outils proposés par défaut — source unique de `<Toolbar>` (ce qu'elle affiche) et
 * de `<DrawLayer>` (ce qu'elle autorise à activer).
 *
 * Les deux en tenaient une copie, et elles avaient divergé : celle de `DrawLayer`
 * omettait `'symbol'`. Comme elle sert de filtre d'activation, le bouton symbole
 * s'affichait mais `setTool('symbol')` était refusé. Retirer l'outil se fait par
 * `<DrawLayer symbols={{ enabled: false }}>`, qui existe pour ça — pas en
 * l'absentant de cette liste.
 *
 * Constante de module : un littéral recréé à chaque rendu casserait la mémoïsation
 * de tout ce qui en dépend en aval.
 */
export const DEFAULT_DRAW_TOOLS: DrawTool[] = [
  'select',
  'line',
  'polygon',
  'rect',
  'circle',
  'freehand',
  'arrow',
  'symbol',
  'measure',
  'erase',
]

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

/**
 * Membres du sous-menu « Mesures » : correspondance outil ↔ icône — table unique consommée
 * par le flyout ET le dispatch clavier, comme `SELECT_MODE_META` (ajouter une rangée = une
 * seule ligne ici + son raccourci par défaut + son libellé `labels.measureTools`).
 *
 * Pas de champ `action` distinct ici, contrairement au sélecteur : là-bas le mode (`rect`) et
 * l'action clavier (`selectRect`) portent des noms différents, ici `tool` sert des deux côtés.
 */
export const MEASURE_TOOL_META: Array<{ tool: MeasureTool; icon: string }> = [
  { tool: 'measure', icon: mdiRuler },
  { tool: 'graticule', icon: mdiGrid },
]

/** Les valeurs de `StrokeStyle` sont exactement les mots-clés CSS `border-style`
 *  correspondants : l'aperçu les utilise telles quelles, sans table de conversion. */
const STROKE_VALUES: readonly StrokeStyle[] = ['solid', 'dashed', 'dotted']

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
        <UiIcon path={mdiSwapHorizontal} />
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

/**
 * Rangée de presets : N boutons exclusifs dont un seul est actif. Source unique du
 * squelette (`.m3d-presets` > `.m3d-preset` + `m3d-on`, `aria-label`, `onClick`) —
 * les quatre pickers ci-dessous n'en diffèrent que par leur jeu de valeurs, leur
 * aperçu et leur libellé. En ajouter un cinquième ne coûte plus que ces trois-là.
 *
 * `T extends string | number` : la valeur sert aussi de clé React, donc elle doit
 * être primitive — le compilateur le garantit plutôt qu'un commentaire.
 */
function PresetRow<T extends string | number>({
  values,
  value,
  onChange,
  ariaLabel,
  preview,
  wide,
}: {
  values: readonly T[]
  value?: T
  onChange: (v: T) => void
  ariaLabel: (v: T) => string
  preview: (v: T) => ReactNode
  /** Bouton élargi (aperçu de trait, qui a besoin de longueur). */
  wide?: boolean
}) {
  return (
    <div className="m3d-presets">
      {values.map((v) => (
        <button
          type="button"
          key={v}
          aria-label={ariaLabel(v)}
          className={`m3d-preset${wide ? ' m3d-preset-wide' : ''}${value === v ? ' m3d-on' : ''}`}
          onClick={() => onChange(v)}
        >
          {preview(v)}
        </button>
      ))}
    </div>
  )
}

/** Épaisseur de bordure : presets visuels, ∅ = pas de bordure. */
export function WidthPicker({ value, onChange }: { value?: number; onChange: (w: number) => void }) {
  const labels = useLabels()
  const presets = useDrawPresets()
  return (
    <PresetRow
      values={presets.widths}
      value={value}
      onChange={onChange}
      ariaLabel={(w) => (w === 0 ? labels.style.noBorder : formatLabel(labels.style.borderWidth, { width: w }))}
      preview={(w) =>
        w === 0 ? (
          <span className="m3d-preset-none">{labels.glyphs.none}</span>
        ) : (
          <span className="m3d-preset-bar" style={{ height: Math.min(w, 10) }} />
        )
      }
    />
  )
}

/** Style de trait : plein, tirets, pointillés. */
export function StrokeStylePicker({ value, onChange }: { value?: StrokeStyle; onChange: (s: StrokeStyle) => void }) {
  const labels = useLabels()
  return (
    <PresetRow
      wide
      values={STROKE_VALUES}
      value={value}
      onChange={onChange}
      ariaLabel={(s) => labels.style[s]}
      preview={(s) => <span className="m3d-preset-line" style={{ borderTopStyle: s }} />}
    />
  )
}

/** Opacité (fond ou bordure) : presets sur damier. */
export function OpacityPicker({
  value,
  onChange,
  values,
}: {
  value?: number
  onChange: (o: number) => void
  /** Paliers proposés — défaut : les opacités de remplissage des presets. */
  values?: readonly number[]
}) {
  const labels = useLabels()
  const presets = useDrawPresets()
  return (
    <PresetRow
      values={values ?? presets.fillOpacities}
      value={value}
      onChange={onChange}
      ariaLabel={(o) => formatLabel(labels.style.opacityPreset, { percent: Math.round(o * 100) })}
      preview={(o) => (
        <span className="m3d-preset-checker">
          <span style={{ opacity: o }} />
        </span>
      )}
    />
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
  const presets = useDrawPresets()
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
          values={presets.strokeOpacities}
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
  const presets = useDrawPresets()
  return (
    <PresetRow
      values={presets.radii}
      value={value}
      onChange={onChange}
      ariaLabel={(r) => formatLabel(labels.style.cornerRadius, { radius: r })}
      preview={(r) => <span className="m3d-preset-corner" style={{ borderTopLeftRadius: `${r}%` }} />}
    />
  )
}
