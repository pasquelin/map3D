import {
  mdiCursorDefaultOutline,
  mdiHandBackRightOutline,
  mdiOfficeBuildingOutline,
  mdiRedo,
  mdiTrashCanOutline,
  mdiUndo,
} from '@mdi/js'
import { UiIcon } from './UiIcon'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { type MapEngine, zoomForAltitude } from '../../core/MapEngine'
import type { DrawTool, EraseMode, MeasureTool, SelectMode } from '../../layers/DrawLayer'
import { LensContext, useConfig, useLabels, useMapContext } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { DEFAULT_DRAW_TOOLS, SELECT_MODE_META, TOOL_ICONS } from './drawControls'
import { DropdownSurface, useYieldsToDropdown } from './Dropdown'
import { DrawSettingsButton } from './DrawSettingsPanel'
import { DrawStylePanel } from './DrawStylePanel'
import { LensToolButton } from './LensToolButton'
import { MeasureToolButton } from './MeasureToolButton'
import { EraseToolButton } from './EraseToolButton'
import { useFitColumns } from './panelFit'
import { useCloseWhenHidden } from './useDismiss'
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
  /** Zoom minimal d'affichage — dessiner n'a de sens qu'en vue rapprochée ; en deçà la barre glisse hors écran. */
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

/** Id du `<Tooltip>` partagé de la barre — réutilisable par les outils externes. */
export const TIP_ID = 'm3d-draw-tip'

/**
 * Ce qu'un outil doit savoir de la barre qui le porte. Consommé par les outils natifs
 * ET par ceux que l'application pose dans `extraTools` / `components` : sans ça, un
 * outil applicatif ne peut ni se refermer quand la barre se replie, ni participer à
 * l'exclusivité — d'où deux boutons allumés à la fois, et une barre qui ne dit plus
 * où on en est.
 */
export type ToolbarApi = {
  /** La barre est repliée (hors zoom, cf. `minZoom`) : plus rien n'y est atteignable. */
  retracted: boolean
  /** Une surface NATIVE tient la main : outil de tracé, loupe ou palette de symboles. */
  nativeActive: boolean
  /** Prendre la main — éteint l'outil de tracé et la loupe. À appeler à l'ouverture. */
  claim: () => void
  /**
   * L'élément de la barre — l'ANCRE des surfaces qu'elle ouvre.
   *
   * Le panneau de style n'a pas de bouton déclencheur (il suit l'outil actif) : sans
   * ancre il se centrait verticalement, donc il ne se posait jamais au niveau de la
   * barre comme les autres surfaces. Il lui faut la même référence qu'à elles.
   */
  el: HTMLElement | null
  /**
   * Le bouton de l'outil ACTIF — l'ancre du panneau de style, qui règle précisément
   * cet outil-là. S'ancrer sur la barre le collait en haut quel que soit l'outil : la
   * surface doit s'ouvrir à la hauteur de l'item auquel elle se rapporte.
   * `null` quand aucun outil n'est actif (le panneau ouvert par une sélection retombe
   * alors sur la barre).
   */
  activeToolEl: HTMLElement | null
  /**
   * Publier son bouton comme ancre de l'outil actif — à passer en `ref` d'un `ToolButton`
   * quand il porte l'outil courant, `null` sinon.
   *
   * Indispensable aux items qui vivent HORS de la boucle `tools.map` (les sous-menus) :
   * celle-ci publie l'ancre pour ses boutons simples, mais un outil déplacé dans un flyout
   * en sortait, et son panneau de style se recollait en haut de la barre au lieu de longer
   * l'item qu'il règle.
   */
  publishActiveTool: (el: HTMLElement | null) => void
}

const ToolbarContext = createContext<ToolbarApi>({
  retracted: false,
  nativeActive: false,
  claim: () => {},
  el: null,
  activeToolEl: null,
  publishActiveTool: () => {},
})

/**
 * État de la barre d'outils, pour un outil qui y vit.
 *
 * Le contrat d'un outil applicatif est celui des outils natifs, en deux lignes :
 *
 * ```tsx
 * const bar = useToolbar()
 * const [open, setOpen] = useState(false)
 * // se refermer quand la barre se replie OU qu'un outil natif prend la main
 * useCloseWhenHidden(bar.retracted || bar.nativeActive, setOpen)
 * // …et éteindre les autres en s'ouvrant
 * <ToolButton active={open} onClick={() => { if (!open) bar.claim(); setOpen(!open) }} />
 * ```
 *
 * Hors d'une `<Toolbar>`, tout est inerte : un bouton monté seul n'a personne à qui
 * céder la main.
 */
export const useToolbar = (): ToolbarApi => useContext(ToolbarContext)

/**
 * Châssis d'un SOUS-MENU DE SURVOL de la barre (sélecteur, mesures).
 *
 * Réunit les trois règles non évidentes que chaque sous-menu doit tenir, et qui étaient
 * réécrites à l'identique dans chacun :
 * — il ne s'ouvre que s'il a plus d'une rangée (une seule = le bouton agit directement) ;
 * — il s'efface devant une vraie surface déroulante, qu'il ne doit pas recouvrir au survol ;
 * — il se referme quand la barre se replie, sinon il rouvrirait tel quel au retour.
 *
 * Ne rend rien et ne connaît AUCUNE sémantique de rangée : c'est délibéré. Les deux sous-menus
 * mêlent des natures différentes (outil exclusif, mode du moteur, calque), et un composant
 * générique aurait fini avec un `if (kind === …)` — le même cas particulier remonté d'un cran.
 */
export function useHoverFlyout(rowCount: number): {
  wrapProps: { className: string; onPointerEnter?: () => void; onPointerLeave?: () => void }
  hasFlyout: boolean
  showing: boolean
  close: () => void
} {
  const [open, setOpen] = useState(false)
  useCloseWhenHidden(useToolbar().retracted, setOpen)
  // Hook appelé INCONDITIONNELLEMENT : `rowCount > 1 && !useYieldsToDropdown()` le
  // court-circuiterait dès qu'il n'y a qu'une rangée — même piège que `ToolButton` et
  // `Toolbar` avec `useConfig`.
  const dropdownOuvert = useYieldsToDropdown()
  const hasFlyout = rowCount > 1 && !dropdownOuvert
  return {
    wrapProps: {
      className: 'm3d-selectwrap',
      onPointerEnter: hasFlyout ? () => setOpen(true) : undefined,
      onPointerLeave: hasFlyout ? () => setOpen(false) : undefined,
    },
    hasFlyout,
    showing: open && hasFlyout,
    close: () => setOpen(false),
  }
}

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
  // retour. C'est la règle déjà appliquée au panneau de style plus bas, étendue à
  // tout ce que la barre possède.
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
    }),
    [hidden, nativeActive, setTool, lens, barEl, activeToolEl],
  )

  // Barre compactée puis étalée en colonnes plutôt que débordant d'une carte courte,
  // sans jamais passer sous la boîte de recherche (même coin haut).
  // `widthVar` retiré avec le CSS du panneau de style : il publiait la largeur de la
  // barre pour que le panneau s'en décale par un `calc()`. Le panneau s'ancre désormais
  // sur le RECT de la barre, qui tient déjà compte des deux colonnes — la variable
  // n'avait plus aucun lecteur.
  const setBar = useFitColumns({ recenter: true, avoid: '.m3d-search' })
  const dropdownOuvert = useYieldsToDropdown()
  const tip = useTip(TIP_ID)
  const toggle = (t: DrawTool) => setTool(tool === t ? null : t)
  // Étiquettes composées depuis les raccourcis effectifs (cf. `formatEdit`).
  const edit = useConfig().interaction.shortcuts.edit
  const undoKey = formatEdit(edit.undo, labels.modKey, labels.keys.shift)
  const redoKey = formatEdit(edit.redo, labels.modKey, labels.keys.shift)
  // Sections configurables : convention partagée avec `MapControls` (cf. `slots.ts`).
  const { slot } = resolveSlots<DrawToolbarSection>(components)

  return (
    <ToolbarContext.Provider value={bar}>
      <div
        ref={(el) => {
          setBar(el)
          setBarEl(el)
        }}
        className={`m3d-drawbar m3d-${position}${hidden ? ' m3d-hidden' : ''}`}
      >
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
          <ToolButton
            icon={mdiUndo}
            label={labels.toolbar.undo}
            tip={tip}
            shortcut={undoKey}
            onClick={undo}
            disabled={!canUndo}
          />,
        )}
        {slot(
          'redo',
          <ToolButton
            icon={mdiRedo}
            label={labels.toolbar.redo}
            tip={tip}
            shortcut={redoKey}
            onClick={redo}
            disabled={!canRedo}
          />,
        )}
        {slot('settings', <DrawSettingsButton position={position} tip={tip} />)}
      </div>
      {!hidden && slot('stylePanel', <DrawStylePanel position={position} />)}
      {/* `disableStyleInjection` coupe le style « base » du paquet (couleurs/radius)
          — l'apparence vient de `.m3d-tip` (thème), son « core » reste injecté. */}
      {/* Masquée tant qu'une surface est ouverte : l'infobulle d'un bouton survolé
          venait se poser SUR le panneau qu'on est en train de lire. */}
      <MapTooltip id={TIP_ID} place={position === 'left' ? 'right' : 'left'} hidden={dropdownOuvert} />
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
  const tip = useTip(TIP_ID)
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
  const tip = useTip(TIP_ID)
  const wrapRef = useRef<HTMLDivElement>(null)

  const active = tool === 'select'
  const available = modes ? SELECT_MODE_META.filter((m) => modes.includes(m.mode)) : SELECT_MODE_META
  // Sous-menu de SURVOL, pas une surface déroulante : son bouton active l'outil au lieu
  // de déplier, d'où l'absence assumée d'`aria-expanded` et de fermeture au clic
  // extérieur (le pointeur qui sort suffit). Il partage seulement le châssis du panneau.
  const flyout = useHoverFlyout(available.length + (canPickBuildings ? 1 : 0))

  return (
    <div ref={wrapRef} {...flyout.wrapProps}>
      <ToolButton
        icon={mdiCursorDefaultOutline}
        label={labels.tools.select}
        shortcut={shortcuts.select}
        active={active || pickingBuilding}
        className={flyout.hasFlyout ? 'm3d-btn-flyout' : undefined}
        onClick={() => {
          // Mode courant hors liste (config restreinte) : bascule sur le 1er autorisé.
          if (!active && available.length > 0 && !available.some((m) => m.mode === selectMode)) {
            setSelectMode(available[0]!.mode)
          }
          setTool(active ? null : 'select')
        }}
      />
      {/* MÊME surface que les autres sous-menus — portée à la racine de la carte, même
          châssis, même placement. Elle était rendue DANS la barre : la barre porte
          backdrop-filter, donc son flou ne pouvait pas jouer comme ailleurs, et c'est
          ce qui la faisait paraître d'un autre composant. Seule la façon de l'OUVRIR
          reste propre à ce bouton (survol, pas clic). */}
      {flyout.showing && (
        <DropdownSurface anchor={wrapRef.current} position={position} clampHeight={false} panelClassName="m3d-flyout">
          {available.map((m) => (
            <button
              key={m.mode}
              {...tip(labels.selectModes[m.mode].description, shortcuts[m.action])}
              className={`m3d-flyout-item${active && selectMode === m.mode ? ' m3d-on' : ''}`}
              onClick={() => {
                setSelectMode(m.mode)
                setTool('select')
                flyout.close()
              }}
            >
              <UiIcon path={m.icon} />
              <span className="m3d-flyout-label">{labels.selectModes[m.mode].label}</span>
            </button>
          ))}
          {/* Désigner un bâtiment du volume 3D interne. Dans CE menu parce que c'est une
              manière de sélectionner de plus — mais l'outil vit dans le moteur, et il est
              exclusif du dessin : l'armer quitte l'outil de tracé, et inversement. */}
          {canPickBuildings && (
            <button
              {...tip(labels.buildingPick.description, shortcuts.selectBuilding)}
              className={`m3d-flyout-item${pickingBuilding ? ' m3d-on' : ''}`}
              onClick={() => {
                const next = !pickingBuilding
                // L'outil de tracé se retire seul (`useYieldsTool`, comme pour la loupe) ;
                // la loupe, elle, ne se cède pas — on la relâche, comme la main le fait.
                if (next) lens?.deactivate()
                engine.setBuildingPickMode(next)
                flyout.close()
              }}
            >
              <UiIcon path={mdiOfficeBuildingOutline} />
              <span className="m3d-flyout-label">{labels.buildingPick.label}</span>
            </button>
          )}
        </DropdownSurface>
      )}
    </div>
  )
}
