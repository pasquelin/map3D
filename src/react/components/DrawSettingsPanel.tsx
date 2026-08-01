import {
  mdiChartBoxOutline,
  mdiChevronRight,
  mdiCog,
  mdiKeyboardOutline,
  mdiMapSearchOutline,
  mdiPuzzleOutline,
  mdiRestore,
  mdiTune,
} from '@mdi/js'
import { StatsPanel } from './StatsPanel'
import { UiIcon } from './UiIcon'
import { useContext, useMemo, useRef, useState } from 'react'
import type { EditShortcut } from '../../config/types'
import { DEFAULT_STROKE_OPACITY } from '../../core/geometryMaterials'
import type { DrawTool } from '../../layers/DrawLayer'
import type { ToolSettings } from '../../layers/draw/DrawSettings'
import { useConfig, useDrawPresets, useLabels, useTheme } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { useDrawSettings } from '../hooks/useDrawSettings'
import { useCatalogSources } from '../hooks/useCatalogSources'
import { usePlugins } from '../hooks/usePlugins'
import { StyleEditor, TOOL_ICONS, type SwatchTarget } from './drawControls'
import { maxRadiusOf } from './drawPresets'
import { Dropdown, DropdownSurface } from './Dropdown'
import { CatalogSettingsPanel } from './CatalogSettings'
import { PluginHubPanel } from './PluginHubPanel'
import { PreferencesPanel } from './PreferencesPanel'
import { EditableKbd } from './preferenceControls'
import { PreferencesContext } from '../preferences/context'
import type { BindableAction, MoveDirection } from '../../config/preferences'
import { formatEdit } from './shortcuts'
import { formatKey } from './tooltip'

/**
 * Outils SANS réglage de style : `select` ne dessine rien, `erase` supprime, et les
 * symboles portent leur propre graphisme. Tout le reste de la barre est réglable —
 * la liste des outils vient donc de `useDrawing().tools`, jamais d'une table figée
 * qui divergerait de `<DrawLayer tools>`.
 */
const UNSTYLED_TOOLS: ReadonlySet<DrawTool> = new Set<DrawTool>(['select', 'erase', 'symbol'])

/** Entrées du panneau ouvrant un sous-panneau latéral : un outil, les raccourcis, le hub plugins, le catalogue, les préférences. */
type SubKey = DrawTool | 'shortcuts' | 'plugins' | 'catalog' | 'stats' | 'preferences'

/** Sous-panneaux qui ne sont pas un outil de dessin (le reste ouvre un `StyleEditor`). */
const NON_TOOL_SUBS: ReadonlySet<SubKey> = new Set<SubKey>(['shortcuts', 'plugins', 'catalog', 'stats', 'preferences'])

/** Un sous-panneau d'outil ouvre un `StyleEditor` : garde de type qui resserre vers `DrawTool`. */
const isToolSub = (k: SubKey): k is DrawTool => !NON_TOOL_SUBS.has(k)

/** Classe de largeur d'un sous-panneau : les autres restent étroits. */
const SUB_WIDTH: Partial<Record<SubKey, string>> = {
  shortcuts: ' m3d-settings-sub-wide', // récap raccourcis sur trois colonnes
  preferences: ' m3d-settings-sub-pref',
}

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
  const submenuCloseMs = useConfig().interaction.menu.submenuCloseMs
  const { tools } = useDrawing()
  const styleableTools = useMemo(() => tools.filter((t) => !UNSTYLED_TOOLS.has(t)), [tools])
  // Ligne « Plugins » masquée s'il n'y a AUCUN plugin enregistré — même condition
  // que le bouton dédié de la barre qu'elle remplace.
  const hasPlugins = usePlugins().plugins.length > 0
  // Réglages du catalogue : seulement si une source est déclarée. Sans elles, l'entrée
  // ouvrirait deux interrupteurs qui ne gouvernent rien de visible.
  const hasCatalog = useCatalogSources().length > 0
  // Préférences : seulement s'il y a un store (donc un `<MapProvider>` au-dessus, le nôtre
  // ou celui de l'hôte). Sans lui, l'entrée ouvrirait un panneau vide. `useContext` plutôt
  // que `usePreferences` — on ne veut PAS re-rendre la barre à chaque changement de réglage.
  const hasPreferences = useContext(PreferencesContext) !== null
  const [openSub, setOpenSub] = useState<SubKey | null>(null)
  /** Ligne survolée : c'est elle qui ANCRE le sous-menu, comme un bouton ancre le sien. */
  const [subRow, setSubRow] = useState<HTMLElement | null>(null)
  const [target, setTarget] = useState<SwatchTarget>('fill')
  // Ouverture, fermeture au clic extérieur, ancrage et `aria-expanded` appartiennent à
  // `<Dropdown>` ; le sous-menu passe par la même surface, ancré sur la ligne survolée.
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
    closeTimer.current = setTimeout(() => setOpenSub(null), submenuCloseMs)
  }
  const openFor = (key: SubKey, row: HTMLElement | null) => {
    cancelClose()
    // Tolère l'absence de ligne plutôt que de l'affirmer par un cast : le sous-panneau
    // s'ouvre alors sans calage vertical, ce qui reste utilisable — là où un `as` aurait
    // fait planter le handler sur un `getBoundingClientRect` de `null`.
    if (!row) {
      setOpenSub(key)
      return
    }
    setSubRow(row)
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
        onClick={(e) => openFor(key, e.currentTarget.parentElement)}
      >
        <UiIcon path={icon} />
        <span className="m3d-settings-toolname">{name}</span>
        {extra}
        <UiIcon path={mdiChevronRight} rotate={position === 'right' ? 180 : 0} />
      </button>
    </div>
  )

  const openedTool = openSub && isToolSub(openSub) ? openSub : null
  const openedSettings = openedTool ? settings.get(openedTool) : null

  return (
    <Dropdown
      icon={mdiCog}
      label={labels.settings.title}
      tip={tip}
      position={position}
      edge="bottom"
      maxHeight={theme.sizing.panelMaxHeight.settings}
      panelClassName="m3d-settings"
      className="m3d-settingswrap"
      grouped
    >
      {() => (
        <>
          <div className="m3d-settings-head">
            <span>{labels.settings.title}</span>
            <button
              type="button"
              className="m3d-settings-reset"
              aria-label={labels.settings.resetAll}
              title={labels.settings.resetAll}
              onClick={() => settings.reset()}
            >
              <UiIcon path={mdiRestore} />
            </button>
          </div>
          <div className="m3d-settings-list">
            {styleableTools.map((t) =>
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
            {hasPlugins && row('plugins', mdiPuzzleOutline, labels.plugins.title)}
            {/* Préférences utilisateur (qualité 3D, contrôles) : présente dès qu'un
                `<MapProvider>` fournit le store (le nôtre ou celui de l'hôte). */}
            {hasPreferences && row('preferences', mdiTune, labels.settings.preferences.title)}
            {hasCatalog && row('catalog', mdiMapSearchOutline, labels.catalog.settings.title)}
            {row('stats', mdiChartBoxOutline, labels.stats.title)}
          </div>
          {openSub && (
            <DropdownSurface
              anchor={subRow}
              position={position}
              maxHeight={theme.sizing.panelMaxHeight.settingsSub}
              panelClassName={`m3d-settings-sub${(openSub && SUB_WIDTH[openSub]) || ''}`}
              onPointerEnter={cancelClose}
              onPointerLeave={scheduleClose}
            >
              {openedTool && openedSettings ? (
                <>
                  <StyleEditor
                    style={{
                      ...openedSettings,
                      strokeOpacity: openedSettings.strokeOpacity ?? DEFAULT_STROKE_OPACITY,
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
              ) : openSub === 'plugins' ? (
                <PluginHubPanel />
              ) : openSub === 'preferences' ? (
                <PreferencesPanel />
              ) : openSub === 'catalog' ? (
                <CatalogSettingsPanel />
              ) : openSub === 'stats' ? (
                <StatsPanel />
              ) : (
                <ShortcutsList />
              )}
            </DropdownSurface>
          )}
        </>
      )}
    </Dropdown>
  )
}

/** Aperçu live d'un outil avec ses réglages courants (couleurs, épaisseur, trait). */
function ToolPreview({ tool, s }: { tool: DrawTool; s: ToolSettings }) {
  // Échelle dérivée des presets et non d'un `50` littéral : régler `presets.radii`
  // faussait sinon cet aperçu, qui montrait un arrondi sans rapport avec le tracé.
  const maxRadius = maxRadiusOf(useDrawPresets())
  const sw = Math.max(s.width > 0 ? 1 : 0, Math.min(s.width * 0.45, 5))
  const dash = s.stroke === 'dashed' ? '5 3' : s.stroke === 'dotted' ? '1.5 2.5' : undefined
  const line = {
    stroke: s.color,
    strokeWidth: sw,
    strokeOpacity: s.strokeOpacity ?? DEFAULT_STROKE_OPACITY,
    strokeDasharray: dash,
    fill: 'none' as string,
  }
  const filled = { ...line, fill: s.fillColor ?? s.color, fillOpacity: s.fillOpacity }
  return (
    <svg className="m3d-settings-preview" viewBox="0 0 34 18" aria-hidden>
      {tool === 'line' && <line x1="2" y1="14" x2="32" y2="4" {...line} />}
      {tool === 'polygon' && <polygon points="4,15 17,2 30,15" {...filled} />}
      {tool === 'rect' && (
        <rect x="3" y="3" width="28" height="12" rx={((s.radius ?? 0) / maxRadius) * 6} {...filled} />
      )}
      {tool === 'circle' && <ellipse cx="17" cy="9" rx="13" ry="7" {...filled} />}
      {tool === 'freehand' && <path d="M2 12 C8 2 14 16 20 8 S30 4 32 10" {...line} />}
      {tool === 'arrow' && (
        <>
          <line x1="3" y1="14" x2="25" y2="6" {...line} />
          <polygon points="32,3 23,5 27,10" fill={s.color} fillOpacity={s.strokeOpacity ?? DEFAULT_STROKE_OPACITY} />
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
 * Récapitulatif EXHAUSTIF des raccourcis, **une ligne par entrée**, réparti en
 * **trois colonnes** (`column-count`, cf. `.m3d-shortcut-cols`) : la liste couvre
 * navigation, vue, panneaux, outils, sélection et édition — elle devenait trop haute
 * pour une seule colonne.
 *
 * Chaque touche est LUE dans `config.interaction.shortcuts` et non écrite en dur : une
 * aide en ligne qui annonce les touches d'origine après remappage ment (cf. `formatEdit`).
 * Une entrée désactivée (`false`) ne s'affiche pas — elle n'a plus de touche à montrer.
 */
function ShortcutsList() {
  const { shortcuts } = useDrawing()
  const labels = useLabels()
  const sc = useConfig().interaction.shortcuts
  const edit = sc.edit
  // La touche « Catalogue » est morte sans source déclarée (cf. `useToggleShortcut` de
  // `<CatalogControl>`) : ne pas l'annoncer alors.
  const hasCatalog = useCatalogSources().length > 0
  const fmt = (s: EditShortcut) => formatEdit(s, labels.modKey, labels.keys.shift)
  const one = (k: string | false) => (k ? formatKey(k) : undefined)
  // Deux touches séparées par « / » sur une seule ligne (annuler/rétablir).
  const pair = (a?: string, b?: string) => (a || b ? `${a ?? ''} / ${b ?? ''}` : undefined)
  // Lettre de déplacement (hors flèche) d'une direction — les flèches restent liées en plus.
  const moveKey = (d: MoveDirection) => {
    const letter = sc.navigate[d].find((k) => !k.startsWith('arrow'))
    return letter ? formatKey(letter) : undefined
  }
  const boost0 = sc.navigate.boost[0]
  const boostDisp = boost0 ? (boost0 === 'shift' ? labels.keys.shiftKey : formatKey(boost0)) : undefined

  // MÊME récap qu'avant, MÊME grille, MÊME style : la 3ᵉ valeur (optionnelle) marque une
  // ligne dont le `<kbd>` est ÉDITABLE en place (déplacement + vue). Le déplacement et le
  // zoom, jadis regroupés sur une ligne, sont éclatés par touche pour être réassignables
  // un par un — c'est le seul écart, la mise en page est inchangée.
  const pa = labels.settings.preferences.actions
  const rows: Array<[string, string | undefined, BindableAction?]> = [
    // Navigation caméra
    [labels.actions.panMap, labels.keys.space],
    [pa.forward, moveKey('forward'), 'forward'],
    [pa.backward, moveKey('backward'), 'backward'],
    [pa.left, moveKey('left'), 'left'],
    [pa.right, moveKey('right'), 'right'],
    [pa.boost, boostDisp, 'boost'],
    [labels.actions.rotateCamera, labels.keys.spaceShift],
    [pa.north, one(sc.controls.north), 'north'],
    [pa.tilt, one(sc.controls.tilt), 'tilt'],
    [pa.globe, one(sc.controls.globe), 'globe'],
    [pa.zoomIn, one(sc.controls.zoomIn), 'zoomIn'],
    [pa.zoomOut, one(sc.controls.zoomOut), 'zoomOut'],
    // Vue / panneaux
    [labels.actions.basemap, one(sc.controls.basemap)],
    [labels.controls.graticule, one(sc.controls.graticule)],
    [labels.actions.layers, one(sc.controls.layers)],
    [labels.catalog.button, hasCatalog ? one(sc.controls.catalog) : undefined],
    [pa.fullscreen, one(sc.controls.fullscreen), 'fullscreen'],
    [labels.controls.pedestrian, one(sc.controls.pedestrian)],
    [labels.lens.tool, one(sc.lens.toggle)],
    // Outils de dessin : dérivés des raccourcis effectifs, filtrés aux vrais outils.
    ...(Object.entries(shortcuts) as Array<[string, string | false]>)
      .filter(([k, v]) => v && k in TOOL_ICONS)
      .map(([k, v]): [string, string] => [labels.tools[k as DrawTool], formatKey(String(v))]),
    // Sélection : modes + gestes
    [labels.selectModes.rect.label, one(shortcuts.selectRect)],
    [labels.selectModes.poly.label, one(shortcuts.selectPoly)],
    [labels.selectModes.lasso.label, one(shortcuts.selectLasso)],
    [labels.buildingPick.label, one(shortcuts.selectBuilding)],
    [labels.actions.addToSelection, labels.keys.shiftClick],
    [labels.actions.markersOnly, labels.keys.altOrCmd],
    [labels.actions.rotateShape, labels.keys.shiftDrag],
    // Édition
    [labels.actions.undoRedo, pair(fmt(edit.undo), fmt(edit.redo))],
    [labels.actions.selectAll, fmt(edit.selectAll)],
    [labels.actions.duplicate, fmt(edit.duplicate)],
    [labels.actions.delete, labels.keys.backspace],
    [labels.actions.moveSelection, labels.keys.arrows],
    [labels.actions.closePolygon, labels.keys.enter],
    [labels.actions.cancel, labels.keys.escape],
  ]
  // Clé par INDEX (et non par libellé) : deux lignes peuvent porter le même intitulé —
  // « Polygone » est à la fois un outil de dessin et un mode de sélection.
  const shortcutRow = ([label, key, action]: [string, string, BindableAction?], i: number) => (
    <div key={i} className="m3d-shortcut-row">
      <span>{label}</span>
      {action ? <EditableKbd action={action} display={key} /> : <kbd className="m3d-kbd">{key}</kbd>}
    </div>
  )
  return (
    <div className="m3d-shortcuts">
      <div className="m3d-settings-subtitle">{labels.settings.shortcutsTitle}</div>
      <div className="m3d-shortcut-cols">
        {rows.filter((r): r is [string, string, BindableAction?] => !!r[1]).map(shortcutRow)}
      </div>
    </div>
  )
}
