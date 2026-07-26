import { mdiChevronRight, mdiCog, mdiKeyboardOutline, mdiRestore } from '@mdi/js'
import Icon from '@mdi/react'
import { useRef, useState } from 'react'
import type { DrawTool } from '../../layers/DrawLayer'
import type { ToolSettings } from '../../layers/draw/DrawSettings'
import { useLabels, useTheme } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { useDrawSettings } from '../hooks/useDrawSettings'
import { StyleEditor, TOOL_ICONS, type SwatchTarget } from './drawControls'
import { useAnchoredPanel } from './panelFit'
import { modKey } from './shortcuts'
import { ToolButton } from './ToolButton'
import { formatKey } from './tooltip'
import { useDismiss } from './useDismiss'

const SHAPE_TOOLS: DrawTool[] = ['line', 'polygon', 'rect', 'circle', 'freehand', 'arrow', 'measure']

/** Hauteurs maximales souhaitées quand le conteneur le permet (px). */
const PANEL_MAX_HEIGHT = 560
const SUB_MAX_HEIGHT = 520

/** Entrées du panneau ouvrant un sous-panneau latéral : un outil ou le récap raccourcis. */
type SubKey = DrawTool | 'shortcuts'

/**
 * Bouton engrenage + panneau « Réglages des outils » : chaque outil garde ses
 * propres couleurs/épaisseur/style de trait/opacités (+ rayon d'angle du
 * rectangle), persistés en localStorage. L'éditeur d'un outil et le récap des
 * raccourcis s'ouvrent dans un **sous-panneau latéral** (côté opposé à la barre,
 * aligné sur sa ligne — même pattern que le flyout de sélection : jamais coupé
 * par le scroll de la liste), réinitialisation par outil ou globale.
 */
export function DrawSettingsButton({
  position,
  tip,
}: {
  position: 'left' | 'right'
  tip: (label: string, shortcut?: string | false) => Record<string, string>
}) {
  const settings = useDrawSettings()
  const theme = useTheme()
  const labels = useLabels()
  const [open, setOpen] = useState(false)
  const [openSub, setOpenSub] = useState<SubKey | null>(null)
  /** Offset vertical du sous-panneau = ligne survolée (repère : panneau). */
  const [subTop, setSubTop] = useState(0)
  const [target, setTarget] = useState<SwatchTarget>('fill')
  const rootRef = useRef<HTMLDivElement>(null)
  useDismiss(rootRef, open, () => setOpen(false))

  // Placement : le panneau est calé sur le BAS du bouton (il grandit vers le haut),
  // le sous-panneau sur la ligne survolée — les deux clampés au conteneur.
  const [panelSide, setPanel] = useAnchoredPanel(position, { edge: 'bottom', maxHeight: PANEL_MAX_HEIGHT })
  const [subSide, setSubEl] = useAnchoredPanel(position, { desiredTop: subTop, maxHeight: SUB_MAX_HEIGHT })

  // Fermeture différée : le pointeur doit pouvoir traverser l'écart ligne →
  // sous-panneau sans que celui-ci se referme (même rôle que le pont ::before
  // du flyout, mais robuste aux trajectoires diagonales).
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpenSub(null), 140)
  }
  const openFor = (key: SubKey, row: HTMLElement) => {
    cancelClose()
    // Le panneau est un ancêtre de la ligne : `closest` évite d'en garder une ref.
    const panel = row.closest('.m3d-settings')
    if (panel) setSubTop(Math.round(row.getBoundingClientRect().top - panel.getBoundingClientRect().top))
    setOpenSub(key)
  }

  /** Ligne du panneau ouvrant un sous-panneau (outil ou raccourcis). */
  const row = (key: SubKey, icon: string, name: string, extra?: React.ReactNode) => (
    <div
      key={key}
      className="m3d-settings-tool"
      onPointerEnter={(e) => openFor(key, e.currentTarget)}
      onPointerLeave={scheduleClose}
    >
      <button
        type="button"
        className={`m3d-settings-toolhead${openSub === key ? ' m3d-on' : ''}`}
        aria-expanded={openSub === key}
        onClick={(e) => openFor(key, e.currentTarget.parentElement as HTMLElement)}
      >
        <Icon path={icon} size={0.62} />
        <span className="m3d-settings-toolname">{name}</span>
        {extra}
        <Icon path={mdiChevronRight} size={0.55} rotate={position === 'right' ? 180 : 0} />
      </button>
    </div>
  )

  const openedTool = openSub && openSub !== 'shortcuts' ? openSub : null
  const openedSettings = openedTool ? settings.get(openedTool) : null

  return (
    <div ref={rootRef} className="m3d-settingswrap">
      <ToolButton
        icon={mdiCog}
        label={labels.settings.title}
        tip={tip}
        active={open}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div ref={setPanel} className={`m3d-panel m3d-settings m3d-${panelSide}`}>
          <div className="m3d-settings-head">
            <span>{labels.settings.title}</span>
            <button
              type="button"
              className="m3d-settings-reset"
              aria-label={labels.settings.resetAll}
              title={labels.settings.resetAll}
              onClick={() => settings.reset()}
            >
              <Icon path={mdiRestore} size={0.6} />
            </button>
          </div>
          <div className="m3d-settings-list">
            {SHAPE_TOOLS.map((t) =>
              row(
                t,
                TOOL_ICONS[t],
                labels.tools[t],
                <>
                  {settings.isCustomized(t) && <span className="m3d-settings-dot" />}
                  <ToolPreview tool={t} s={settings.get(t)} />
                </>,
              ),
            )}
          </div>
          <div className="m3d-settings-footer">
            {row('shortcuts', mdiKeyboardOutline, labels.settings.shortcutsTitle)}
          </div>
          {openSub && (
            <div
              ref={setSubEl}
              className={`m3d-panel m3d-settings-sub m3d-${subSide}`}
              onPointerEnter={cancelClose}
              onPointerLeave={scheduleClose}
            >
              {openedTool && openedSettings ? (
                <>
                  <StyleEditor
                    style={{
                      ...openedSettings,
                      strokeOpacity: openedSettings.strokeOpacity ?? 0.95,
                      radius: openedSettings.radius ?? 0,
                    }}
                    onPatch={(patch) => settings.set(openedTool, patch)}
                    palette={theme.colors.draw.palette}
                    fallbackColor={theme.colors.draw.default}
                    target={target}
                    onTarget={setTarget}
                    showRadius={openedTool === 'rect'}
                  />
                  <button
                    type="button"
                    className="m3d-tagclear"
                    disabled={!settings.isCustomized(openedTool)}
                    onClick={() => settings.reset(openedTool)}
                  >
                    {labels.settings.resetTool}
                  </button>
                </>
              ) : (
                <ShortcutsList />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Aperçu live d'un outil avec ses réglages courants (couleurs, épaisseur, trait). */
function ToolPreview({ tool, s }: { tool: DrawTool; s: ToolSettings }) {
  const sw = Math.max(s.width > 0 ? 1 : 0, Math.min(s.width * 0.45, 5))
  const dash = s.stroke === 'dashed' ? '5 3' : s.stroke === 'dotted' ? '1.5 2.5' : undefined
  const line = {
    stroke: s.color,
    strokeWidth: sw,
    strokeOpacity: s.strokeOpacity ?? 0.95,
    strokeDasharray: dash,
    fill: 'none' as string,
  }
  const filled = { ...line, fill: s.fillColor ?? s.color, fillOpacity: s.fillOpacity }
  return (
    <svg className="m3d-settings-preview" viewBox="0 0 34 18" aria-hidden>
      {tool === 'line' && <line x1="2" y1="14" x2="32" y2="4" {...line} />}
      {tool === 'polygon' && <polygon points="4,15 17,2 30,15" {...filled} />}
      {tool === 'rect' && <rect x="3" y="3" width="28" height="12" rx={((s.radius ?? 0) / 50) * 6} {...filled} />}
      {tool === 'circle' && <ellipse cx="17" cy="9" rx="13" ry="7" {...filled} />}
      {tool === 'freehand' && <path d="M2 12 C8 2 14 16 20 8 S30 4 32 10" {...line} />}
      {tool === 'arrow' && (
        <>
          <line x1="3" y1="14" x2="25" y2="6" {...line} />
          <polygon points="32,3 23,5 27,10" fill={s.color} fillOpacity={s.strokeOpacity ?? 0.95} />
        </>
      )}
      {tool === 'measure' && (
        <>
          <line x1="4" y1="9" x2="30" y2="9" {...line} strokeDasharray="4 3" />
          <line x1="4" y1="4" x2="4" y2="14" {...line} strokeDasharray={undefined} />
          <line x1="30" y1="4" x2="30" y2="14" {...line} strokeDasharray={undefined} />
        </>
      )}
    </svg>
  )
}

/**
 * Liste complète des raccourcis, **une ligne par entrée** (actions d'édition puis
 * une ligne par outil) — contenu du sous-panneau « Raccourcis clavier ».
 */
function ShortcutsList() {
  const { shortcuts } = useDrawing()
  const labels = useLabels()
  const rows: Array<[string, string]> = [
    [labels.actions.panMap, labels.keys.space],
    [labels.actions.rotateCamera, labels.keys.spaceShift],
    [labels.actions.rotateShape, labels.keys.shiftDrag],
    [labels.actions.undoRedo, `${modKey}Z / ${modKey}⇧Z`],
    [labels.actions.selectAll, `${modKey}A`],
    [labels.actions.addToSelection, labels.keys.shiftClick],
    [labels.actions.markersOnly, labels.keys.altOrCmd],
    [labels.actions.duplicate, `${modKey}D`],
    [labels.actions.delete, labels.keys.backspace],
    [labels.actions.moveSelection, labels.keys.arrows],
    [labels.actions.closePolygon, labels.keys.enter],
    [labels.actions.cancel, labels.keys.escape],
  ]
  const toolRows: Array<[string, string]> = (Object.entries(shortcuts) as Array<[string, string | false]>)
    .filter(([k, v]) => v && k in TOOL_ICONS)
    .map(([k, v]) => [labels.tools[k as DrawTool], formatKey(String(v))])
  const shortcutRow = ([label, key]: [string, string]) => (
    <div key={label} className="m3d-shortcut-row">
      <span>{label}</span>
      <kbd className="m3d-kbd">{key}</kbd>
    </div>
  )
  return (
    <div className="m3d-shortcuts">
      <div className="m3d-settings-subtitle">{labels.settings.shortcutsTitle}</div>
      {rows.map(shortcutRow)}
      <div className="m3d-shortcut-sep" />
      {toolRows.map(shortcutRow)}
    </div>
  )
}
