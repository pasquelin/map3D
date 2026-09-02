import {
  mdiCursorDefaultOutline,
  mdiHandBackRightOutline,
  mdiOfficeBuildingOutline,
  mdiRedo,
  mdiTrashCanOutline,
  mdiUndo,
} from '@mdi/js'
import { UiIcon } from './UiIcon'
import { type ReactNode, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { type MapEngine, zoomForAltitude } from '../../core/MapEngine'
import type { DrawTool, EraseMode, MeasureTool, SelectMode } from '../../layers/DrawLayer'
import { LensContext, ToolbarContext, useConfig, useLabels, useMapContext, useToolbar } from '../context'
import type { ToolbarApi } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { DEFAULT_DRAW_TOOLS, SELECT_MODE_META, TOOL_ICONS } from './drawControls'
import { useYieldsToDropdown } from './Dropdown'
import { DrawSettingsButton } from './DrawSettingsPanel'
import { DrawStylePanel } from './DrawStylePanel'
import { LensToolButton } from './LensToolButton'
import { MeasureToolButton } from './MeasureToolButton'
import { EraseToolButton } from './EraseToolButton'
import { type FlyoutRow, FlyoutToolButton } from './FlyoutToolButton'
import { useFitColumns, useMergedRefs } from './panelFit'
import { formatEdit } from './shortcuts'
import { resolveSlots, type SlotConfig } from './slots'
import { SymbolPaletteButton } from './SymbolPaletteButton'
import { MapTooltip } from './MapTooltip'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'

/** Sections optionnelles de la barre : `false` pour masquer, ReactNode pour remplacer. */
export type DrawToolbarSection =
  | 'navigate'
  | 'select'
  | 'symbol'
  | 'measure'
  | 'erase'
  | 'lens'
  | 'plugins'
  | 'stylePanel'
  | 'settings'
  | 'undo'
  | 'redo'
  | 'clear'

export type DrawToolbarProps = {
  /** Côté d'ancrage de la barre. */
  position?: 'left' | 'right'
  /** Zoom minimal d'affichage ; en deçà la barre glisse hors écran, en emportant ses menus. */
  minZoom?: number
  /** Outils affichés, dans l'ordre (`'select'` inclus — défaut : tous). */
  tools?: DrawTool[]
  /** Modes proposés par le flyout de sélection (défaut : les 3) ; un seul = pas de flyout. */
  selectModes?: SelectMode[]
  /** Modes proposés par le flyout de la gomme (défaut : ponctuelle + sélection) ; un seul = pas de flyout. */
  eraseModes?: EraseMode[]
  /**
   * Rangées proposées par le sous-menu « Mesures » (défaut : mesurer + grille) ; une seule =
   * pas de sous-menu, le bouton redevient un simple outil. `['measure']` retire donc la
   * grille de la barre — elle reste atteignable par `<MapControls>` et par la config.
   */
  measureTools?: MeasureTool[]
  /** Masque (`false`) ou remplace (ReactNode) chaque section — défaut : tout affiché. */
  components?: SlotConfig<DrawToolbarSection>
  /**
   * Outils **de l'application** rendus en items principaux de la barre, après les
   * outils natifs (dessin, symboles, loupe) : ils prennent le langage visuel de la
   * barre au lieu de flotter dans un coin de la carte. Ils pilotent leur propre
   * état, la barre ne les connaît pas.
   */
  extraTools?: ReactNode
}

// Le contexte vit avec les autres (`react/context`) : `Dropdown` doit le lire pour se
// refermer quand la barre se replie, et la barre importe `Dropdown`. Ré-exporté ici parce
// que c'est `<Toolbar>` que l'API publique déclare.
export { useToolbar, type ToolbarApi }

/**
 * Barre d'outils de dessin (navigation, formes, gomme, annuler, tout effacer).
 * Nécessite un `<DrawLayer>` monté (elle pilote `useDrawing()`). Masquée sous
 * `minZoom` (glisse hors écran) : dessiner n'a de sens qu'en vue rapprochée.
 */
export function Toolbar({
  position = 'left',
  minZoom: minZoomProp,
  tools = DEFAULT_DRAW_TOOLS,
  selectModes,
  eraseModes,
  measureTools,
  components = {},
  extraTools,
}: DrawToolbarProps) {
  const { tool, setTool, undo, redo, canUndo, canRedo, shortcuts, symbols } = useDrawing()
  // Hook appelé INCONDITIONNELLEMENT : `minZoomProp ?? useConfig()` le
  // court-circuiterait dès qu'une prop est fournie — même piège que `ToolButton`.
  const config = useConfig()
  const minZoom = minZoomProp ?? config.toolbar.minZoom
  const hideHistory = config.toolbar.autoHide.history
  // Un outil externe actif (loupe, pick de bâtiment) doit "éteindre" la main : sinon
  // `tool === null` surligne Naviguer alors qu'un autre outil est actif (deux items
  // actifs à la fois — exactement ce que la barre ne doit jamais montrer).
  const { picking: pickingBuilding, engine } = useBuildingPick()
  const lens = useContext(LensContext)
  const labels = useLabels()
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    const below = (altitude: number) => zoomForAltitude(Math.max(1, altitude - engine.terrainHeight)) < minZoom
    setHidden(below(engine.camera.getState().altitude))
    return engine.on('camera', (s) => setHidden(below(s.altitude)))
  }, [engine, minZoom])

  // La barre qui se retire RELÂCHE tout ce qu'elle pilote, et revient à la main.
  //
  // Se replier n'est pas qu'une affaire d'affichage : un outil resté armé continue
  // d'intercepter les gestes (`engine.inputInterceptor`), si bien qu'en dézoomant on
  // se retrouve à tracer des formes sur une carte où plus aucun bouton ne permet d'en
  // sortir. Même chose pour la loupe. Les flyouts, eux, rouvriraient tels quels au
  // retour.
  // Sur la TRANSITION seulement : `hidden` démarre à `true`, donc agir sur la valeur
  // relâcherait l'outil et la loupe au montage de toute carte — y compris une carte
  // montée déjà zoomée, ou un outil pré-armé par l'hôte.
  const wasHidden = useRef(hidden)
  // `setTool`/`lens` par ref : l'effet ne doit se déclencher QUE sur la transition de
  // `hidden`, jamais parce que l'un des deux a changé d'identité.
  const release = useRef({ setTool, lens })
  release.current = { setTool, lens }
  useEffect(() => {
    const justRetracted = hidden && !wasHidden.current
    wasHidden.current = hidden
    if (!justRetracted) return
    release.current.setTool(null)
    release.current.lens?.deactivate()
  }, [hidden])

  // Ce que la barre offre à ses outils. `nativeActive` est la MÊME condition que le
  // bouton Naviguer plus bas (inversée) : un outil applicatif s'éteint exactement
  // quand la main se rallumerait, donc il ne peut plus rester allumé à côté d'elle.
  const nativeActive = tool !== null || !!lens?.active || symbols.paletteOpen
  const [barEl, setBarEl] = useState<HTMLElement | null>(null)
  const [activeToolEl, setActiveToolEl] = useState<HTMLElement | null>(null)
  // Un id par barre montée, jamais en dur : deux cartes sur la page partageaient
  // `m3d-draw-tip` et leurs infobulles s'appariaient à la mauvaise instance.
  const tipId = useId()
  const bar = useMemo<ToolbarApi>(
    () => ({
      retracted: hidden,
      nativeActive,
      claim: () => {
        setTool(null)
        lens?.deactivate()
      },
      el: barEl,
      activeToolEl,
      publishActiveTool: setActiveToolEl,
      tipId,
    }),
    [hidden, nativeActive, setTool, lens, barEl, activeToolEl, tipId],
  )

  // Barre compactée puis étalée en colonnes plutôt que débordant d'une carte courte,
  // sans jamais passer sous la boîte de recherche (même coin haut).
  const setBar = useFitColumns({ recenter: true, avoid: '.m3d-search' })
  // Ref STABLE : une flèche inline était détachée (null) puis rattachée à chaque rendu
  // de la barre, ce qui rejouait le placement et republiait l'élément à chaque fois.
  const barRef = useMergedRefs(setBar, setBarEl)
  const dropdownOuvert = useYieldsToDropdown()
  const tip = useTip(tipId)
  const toggle = (t: DrawTool) => setTool(tool === t ? null : t)
  // Étiquettes composées depuis les raccourcis effectifs (cf. `formatEdit`).
  const edit = useConfig().interaction.shortcuts.edit
  const undoKey = formatEdit(edit.undo, labels.modKey, labels.keys.shift)
  const redoKey = formatEdit(edit.redo, labels.modKey, labels.keys.shift)
  // Sections configurables : convention partagée avec `MapControls` (cf. `slots.ts`).
  const { slot } = resolveSlots<DrawToolbarSection>(components)

  /**
   * Une flèche d'historique — RETIRÉE plutôt que grisée quand elle n'a rien à faire
   * (`config.toolbar.autoHide.history`). Chacune pour son compte : rien à défaire
   * n'empêche pas de refaire.
   */
  const historyBtn = (p: { icon: string; label: string; shortcut?: string; onClick: () => void; can: boolean }) =>
    hideHistory && !p.can ? null : (
      <ToolButton icon={p.icon} label={p.label} tip={tip} shortcut={p.shortcut} onClick={p.onClick} disabled={!p.can} />
    )

  return (
    <ToolbarContext.Provider value={bar}>
      <div ref={barRef} className={`m3d-drawbar m3d-${position}${hidden ? ' m3d-hidden' : ''}`}>
        {slot(
          'navigate',
          <ToolButton
            icon={mdiHandBackRightOutline}
            label={labels.toolbar.navigate}
            tip={tip}
            shortcut={labels.keys.escape}
            // La main n'est active que si RIEN d'autre ne l'est — outils de tracé,
            // loupe, palette de symboles, pick de bâtiment. Une surface qui s'allume sans
            // éteindre la main laisserait deux boutons allumés, et la barre ne dirait plus
            // où on en est. (La palette, elle, se referme d'elle-même au clic hors d'elle.)
            active={tool === null && !lens?.active && !symbols.paletteOpen && !pickingBuilding}
            className="m3d-btn-move"
            onClick={() => {
              setTool(null)
              lens?.deactivate() // quitter tout outil externe → la main devient l'outil actif
              engine.setBuildingPickMode(false)
            }}
          />,
        )}
        {tools.map((t) =>
          t === 'select' ? (
            slot('select', <SelectToolButton key={t} position={position} modes={selectModes} />)
          ) : t === 'measure' ? (
            // Sort de la boucle des outils simples : la règle est désormais le PARENT d'un
            // sous-menu (mesurer + grille), au même titre que `select` et `symbol`.
            slot('measure', <MeasureToolButton key={t} position={position} tools={measureTools} />)
          ) : t === 'symbol' ? (
            // Pas un outil de tracé : le bouton ouvre la palette, et le dépôt d'une
            // vignette crée la forme. Rendu ici pour qu'il prenne sa place dans
            // l'ordre de `tools`, comme n'importe quel autre outil.
            slot('symbol', <SymbolPaletteButton key={t} position={position} />)
          ) : t === 'erase' ? (
            // Parent d'un sous-menu (gomme ponctuelle / sélection / tout effacer), comme
            // `select`. La rangée « Tout effacer » lui est PASSÉE plutôt que rendue par lui :
            // c'est la barre qui possède les sections (`components`), le bouton ne fait que
            // la placer dans son menu.
            slot(
              'erase',
              <EraseToolButton
                key={t}
                position={position}
                modes={eraseModes}
                clearRow={slot('clear', <ClearFlyoutRow />)}
              />,
            )
          ) : (
            <ToolButton
              key={t}
              // Le bouton ACTIF se publie comme ancre : c'est lui que le panneau de
              // style doit longer. React détache l'ancienne ref avant d'attacher la
              // nouvelle, donc la bascule d'outil se règle en un commit.
              ref={tool === t ? setActiveToolEl : null}
              icon={TOOL_ICONS[t]}
              label={labels.tools[t]}
              tip={tip}
              shortcut={shortcuts[t]}
              active={tool === t}
              onClick={() => toggle(t)}
            />
          ),
        )}
        {/* Loupe : outil natif de la barre au même titre que les symboles. Le bouton
            s'efface tout seul si la carte est montée sans loupe (`toolbar={{ lens: false }}`). */}
        {slot('lens', <LensToolButton />)}
        {extraTools}
        {slot(
          'undo',
          historyBtn({ icon: mdiUndo, label: labels.toolbar.undo, shortcut: undoKey, onClick: undo, can: canUndo }),
        )}
        {slot(
          'redo',
          historyBtn({ icon: mdiRedo, label: labels.toolbar.redo, shortcut: redoKey, onClick: redo, can: canRedo }),
        )}
        {slot('settings', <DrawSettingsButton position={position} tip={tip} />)}
        {/* En DERNIER, et dans la barre : c'est un bouton comme les autres depuis qu'il
            porte l'aperçu des couleurs. Il était rendu hors du groupe, en surface
            flottante que personne n'ouvrait — d'où sa manie d'apparaître seule. */}
        {slot('stylePanel', <DrawStylePanel position={position} tip={tip} />)}
      </div>
      {/* `disableStyleInjection` coupe le style « base » du paquet (couleurs/radius)
          — l'apparence vient de `.m3d-tip` (thème), son « core » reste injecté. */}
      {/* Masquée tant qu'une surface est ouverte : l'infobulle d'un bouton survolé
          venait se poser SUR le panneau qu'on est en train de lire. */}
      <MapTooltip id={tipId} place={position === 'left' ? 'right' : 'left'} hidden={dropdownOuvert} />
    </ToolbarContext.Provider>
  )
}

/**
 * Rangée « Tout effacer » du sous-menu de la gomme.
 *
 * Elle y vit — et non plus en bouton de pied de barre — parce qu'elle fait exactement ce
 * que fait la gomme, sans geste : même périmètre, mêmes filtres, même `onErase`. Deux
 * commandes voisines aux portées différentes n'étaient pas lisibles ; rangées ensemble,
 * elles se lisent comme trois façons d'effacer.
 *
 * Une ACTION parmi des modes : le sous-menu du sélecteur mêle déjà de la même façon des
 * modes de marquee et l'outil « bâtiment ». `m3d-danger` la distingue de ses voisines
 * (couleur d'alerte, filet de séparation) : elle n'arme rien, elle efface au clic.
 */
function ClearFlyoutRow() {
  const { clear } = useDrawing()
  const labels = useLabels()
  const tip = useTip(useToolbar().tipId)
  return (
    <button {...tip(labels.toolbar.clearAllDescription)} className="m3d-flyout-item m3d-danger" onClick={clear}>
      <UiIcon path={mdiTrashCanOutline} />
      <span className="m3d-flyout-label">{labels.toolbar.clearAll}</span>
    </button>
  )
}

/**
 * Bouton Sélectionner + flyout des modes (rectangle, polygone, lasso), ouvert au
 * SURVOL du côté opposé à la barre. Les sous-boutons affichent icône + libellé ;
 * le raccourci est dans leur tooltip (même convention que les autres boutons).
 */
/**
 * État de l'outil « bâtiment », lu au MOTEUR — sa seule source de vérité.
 *
 * Partagé par la barre (qui en a besoin pour savoir si la main est au repos) et par le
 * sélecteur (qui porte sa ligne) : deux copies d'état auraient divergé, et c'est exactement
 * la divergence qui laissait la main allumée sous un outil actif.
 */
function useBuildingPick(): { picking: boolean; canPick: boolean; engine: MapEngine } {
  const { engine } = useMapContext()
  const [picking, setPicking] = useState(() => engine.getBuildingPickMode())
  useEffect(() => engine.on('buildingpickmode', setPicking), [engine])
  const [canPick, setCanPick] = useState(() => engine.getBasemap().canPickBuildings)
  useEffect(() => engine.on('basemap', (b) => setCanPick(b.canPickBuildings)), [engine])
  return { picking, canPick, engine }
}

function SelectToolButton({ position, modes }: { position: 'left' | 'right'; modes?: SelectMode[] }) {
  const { tool, setTool, selectMode, setSelectMode, shortcuts } = useDrawing()
  const { picking: pickingBuilding, canPick: canPickBuildings, engine } = useBuildingPick()
  const lens = useContext(LensContext)
  const labels = useLabels()

  const active = tool === 'select'
  const available = modes ? SELECT_MODE_META.filter((m) => modes.includes(m.mode)) : SELECT_MODE_META
  const rows: FlyoutRow[] = available.map((m) => ({
    key: m.mode,
    icon: m.icon,
    label: labels.selectModes[m.mode].label,
    description: labels.selectModes[m.mode].description,
    shortcut: shortcuts[m.action],
    on: active && selectMode === m.mode,
    onSelect: () => {
      setSelectMode(m.mode)
      setTool('select')
    },
  }))
  // Désigner un bâtiment du volume 3D interne. Dans CE menu parce que c'est une
  // manière de sélectionner de plus — mais l'outil vit dans le moteur, et il est
  // exclusif du dessin : l'armer quitte l'outil de tracé, et inversement.
  if (canPickBuildings) {
    rows.push({
      key: 'building',
      icon: mdiOfficeBuildingOutline,
      label: labels.buildingPick.label,
      description: labels.buildingPick.description,
      shortcut: shortcuts.selectBuilding,
      on: pickingBuilding,
      onSelect: () => {
        const next = !pickingBuilding
        // L'outil de tracé se retire seul (`useYieldsTool`, comme pour la loupe) ;
        // la loupe, elle, ne se cède pas — on la relâche, comme la main le fait.
        if (next) lens?.deactivate()
        engine.setBuildingPickMode(next)
      },
    })
  }

  return (
    <FlyoutToolButton
      position={position}
      icon={mdiCursorDefaultOutline}
      label={labels.tools.select}
      shortcut={shortcuts.select}
      active={active || pickingBuilding}
      onClick={() => {
        // Mode courant hors liste (config restreinte) : bascule sur le 1er autorisé.
        if (!active && available.length > 0 && !available.some((m) => m.mode === selectMode)) {
          setSelectMode(available[0]!.mode)
        }
        setTool(active ? null : 'select')
      }}
      rows={rows}
    />
  )
}
