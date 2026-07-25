import { mdiChevronDown, mdiCog, mdiRestore } from '@mdi/js'
import Icon from '@mdi/react'
import { useRef, useState } from 'react'
import type { DrawTool } from '../../layers/DrawLayer'
import type { ToolSettings } from '../../layers/draw/DrawSettings'
import { useTheme } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { useDrawSettings } from '../hooks/useDrawSettings'
import { StyleEditor, TOOL_META, type SwatchTarget } from './drawControls'
import { modKey } from './shortcuts'
import { ICON_SIZE, formatKey } from './tooltip'
import { useDismiss } from './useDismiss'

const SHAPE_TOOLS: DrawTool[] = ['line', 'polygon', 'rect', 'circle', 'freehand', 'arrow', 'measure']

/**
 * Bouton engrenage + panneau « Réglages des outils » : chaque outil garde ses
 * propres couleurs/épaisseur/style de trait/opacités (+ rayon d'angle du
 * rectangle), persistés en localStorage. Accordéon avec aperçu live par outil,
 * réinitialisation par outil ou globale, récapitulatif des raccourcis clavier.
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
  const [open, setOpen] = useState(false)
  const [openTool, setOpenTool] = useState<DrawTool | null>(null)
  const [target, setTarget] = useState<SwatchTarget>('fill')
  const rootRef = useRef<HTMLDivElement>(null)
  useDismiss(rootRef, open, () => setOpen(false))

  return (
    <div ref={rootRef} className="m3d-settingswrap">
      <button
        {...tip('Réglages des outils')}
        className={`m3d-btn${open ? ' m3d-on' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon path={mdiCog} size={ICON_SIZE} />
      </button>
      {open && (
        <div className={`m3d-panel m3d-settings m3d-${position}`}>
          <div className="m3d-settings-head">
            <span>Réglages des outils</span>
            <button
              type="button"
              className="m3d-settings-reset"
              aria-label="Tout réinitialiser"
              title="Tout réinitialiser"
              onClick={() => settings.reset()}
            >
              <Icon path={mdiRestore} size={0.6} />
            </button>
          </div>
          <div className="m3d-settings-list">
            {SHAPE_TOOLS.map((t) => {
              const s = settings.get(t)
              const opened = openTool === t
              return (
                <div key={t} className="m3d-settings-tool">
                  <button type="button" className="m3d-settings-toolhead" onClick={() => setOpenTool(opened ? null : t)}>
                    <Icon path={TOOL_META[t].icon} size={0.62} />
                    <span className="m3d-settings-toolname">
                      {TOOL_META[t].label}
                      {settings.isCustomized(t) && <span className="m3d-settings-dot" />}
                    </span>
                    <ToolPreview tool={t} s={s} />
                    <Icon path={mdiChevronDown} size={0.55} rotate={opened ? 180 : 0} />
                  </button>
                  {opened && (
                    <div className="m3d-settings-body">
                      <StyleEditor
                        style={{ ...s, strokeOpacity: s.strokeOpacity ?? 0.95, radius: s.radius ?? 0 }}
                        onPatch={(patch) => settings.set(t, patch)}
                        palette={theme.colors.draw.palette}
                        fallbackColor={theme.colors.draw.default}
                        target={target}
                        onTarget={setTarget}
                        showRadius={t === 'rect'}
                      />
                      <button
                        type="button"
                        className="m3d-tagclear"
                        disabled={!settings.isCustomized(t)}
                        onClick={() => settings.reset(t)}
                      >
                        Réinitialiser cet outil
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <ShortcutsRecap />
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

/** Aide-mémoire des raccourcis clavier (reflète la plateforme). */
function ShortcutsRecap() {
  const { shortcuts } = useDrawing()
  const rows: Array<[string, string]> = [
    ['Déplacer la carte', 'Espace'],
    ['Tourner la caméra', 'Espace+Maj'],
    ['Tourner la forme', 'Maj + glisser'],
    ['Annuler / Rétablir', `${modKey}Z / ${modKey}⇧Z`],
    ['Tout sélectionner', `${modKey}A`],
    ['Dupliquer', `${modKey}D`],
    ['Supprimer', '⌫'],
    ['Déplacer la sélection', 'Flèches'],
    ['Fermer le polygone', 'Entrée'],
    ['Annuler / quitter', 'Échap'],
  ]
  const toolKeys = (Object.entries(shortcuts) as Array<[string, string | false]>)
    .filter(([k, v]) => v && k in TOOL_META)
    .map(([k, v]) => `${TOOL_META[k as DrawTool].label} ${formatKey(String(v))}`)
    .join(' · ')
  return (
    <div className="m3d-shortcuts">
      <div className="m3d-settings-subtitle">Raccourcis clavier</div>
      {rows.map(([label, key]) => (
        <div key={label} className="m3d-shortcut-row">
          <span>{label}</span>
          <kbd className="m3d-kbd">{key}</kbd>
        </div>
      ))}
      {toolKeys && <div className="m3d-shortcut-tools">{toolKeys}</div>}
    </div>
  )
}
