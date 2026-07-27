import {
  mdiCursorDefaultOutline,
  mdiHandBackRightOutline,
  mdiRedo,
  mdiTrashCanOutline,
  mdiUndo,
} from '@mdi/js'
import Icon from '@mdi/react'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip } from 'react-tooltip'
import { zoomForAltitude } from '../../core/MapEngine'
import type { DrawTool, SelectMode } from '../../layers/DrawLayer'
import { LensContext, useLabels, useMapContext } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { SELECT_MODE_META, TOOL_ICONS } from './drawControls'
import { DrawSettingsButton } from './DrawSettingsPanel'
import { DrawStylePanel } from './DrawStylePanel'
import { LensToolButton } from './LensToolButton'
import { useAnchoredPanel, useFitColumns } from './panelFit'
import { useCloseWhenHidden } from './useDismiss'
import { modKey } from './shortcuts'
import { resolveSlots, type SlotConfig } from './slots'
import { SymbolPaletteButton } from './SymbolPaletteButton'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'

/** Sections optionnelles de la barre : `false` pour masquer, ReactNode pour remplacer. */
export type DrawToolbarSection =
  | 'navigate'
  | 'select'
  | 'symbol'
  | 'lens'
  | 'stylePanel'
  | 'settings'
  | 'undo'
  | 'redo'
  | 'clear'

export type DrawToolbarProps = {
  position?: 'left' | 'right'
  /** Zoom minimal d'affichage — dessiner n'a de sens qu'en vue rapprochée ; en deçà la barre glisse hors écran. */
  minZoom?: number
  /** Outils affichés, dans l'ordre (`'select'` inclus — défaut : tous). */
  tools?: DrawTool[]
  /** Modes proposés par le flyout de sélection (défaut : les 3) ; un seul = pas de flyout. */
  selectModes?: SelectMode[]
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
}

const ToolbarContext = createContext<ToolbarApi>({
  retracted: false,
  nativeActive: false,
  claim: () => {},
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

const DEFAULT_TOOLS: DrawTool[] = [
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
 * Barre d'outils de dessin (navigation, formes, gomme, annuler, tout effacer).
 * Nécessite un `<DrawLayer>` monté (elle pilote `useDrawing()`). Masquée sous
 * `minZoom` (glisse hors écran) : dessiner n'a de sens qu'en vue rapprochée.
 */
export function Toolbar({
  position = 'left',
  minZoom = 11,
  tools = DEFAULT_TOOLS,
  selectModes,
  components = {},
  extraTools,
}: DrawToolbarProps) {
  const { tool, setTool, undo, redo, canUndo, canRedo, clear, shortcuts, symbols } = useDrawing()
  const { engine } = useMapContext()
  // Un outil externe actif (ex. loupe) doit "éteindre" la main : sinon `tool === null`
  // surligne Naviguer alors qu'un autre outil est actif (deux items actifs à la fois).
  const lens = useContext(LensContext)
  const labels = useLabels()
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    const below = (altitude: number) =>
      zoomForAltitude(Math.max(1, altitude - engine.terrainHeight)) < minZoom
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
  useEffect(() => {
    const justRetracted = hidden && !wasHidden.current
    wasHidden.current = hidden
    if (!justRetracted) return
    setTool(null)
    lens?.deactivate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden])

  // Ce que la barre offre à ses outils. `nativeActive` est la MÊME condition que le
  // bouton Naviguer plus bas (inversée) : un outil applicatif s'éteint exactement
  // quand la main se rallumerait, donc il ne peut plus rester allumé à côté d'elle.
  const nativeActive = tool !== null || !!lens?.active || symbols.paletteOpen
  const bar = useMemo<ToolbarApi>(
    () => ({
      retracted: hidden,
      nativeActive,
      claim: () => {
        setTool(null)
        lens?.deactivate()
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hidden, nativeActive, setTool, lens],
  )

  // Barre compactée puis étalée en colonnes plutôt que débordant d'une carte courte,
  // sans jamais passer sous la boîte de recherche (même coin haut).
  // La largeur publiée sert au panneau de style, posé juste à côté de la barre : en
  // deux colonnes elle double, il doit se décaler d'autant.
  const setBar = useFitColumns({ recenter: true, avoid: '.m3d-search', widthVar: '--m3d-drawbar-w' })
  const tip = useTip(TIP_ID)
  const toggle = (t: DrawTool) => setTool(tool === t ? null : t)
  const undoKey = `${modKey}Z`
  // Sections configurables : convention partagée avec `MapControls` (cf. `slots.ts`).
  const { slot } = resolveSlots<DrawToolbarSection>(components)

  return (
    <ToolbarContext.Provider value={bar}>
      <div ref={setBar} className={`m3d-drawbar m3d-${position}${hidden ? ' m3d-hidden' : ''}`}>
        {slot(
          'navigate',
          <ToolButton
            icon={mdiHandBackRightOutline}
            label={labels.toolbar.navigate}
            tip={tip}
            shortcut={labels.keys.escape}
            // La main n'est active que si RIEN d'autre ne l'est — outils de tracé,
            // loupe, palette de symboles. Une surface qui s'allume sans éteindre la
            // main laisserait deux boutons allumés, et la barre ne dirait plus où on
            // en est. (La palette, elle, se referme d'elle-même au clic hors d'elle.)
            active={tool === null && !lens?.active && !symbols.paletteOpen}
            className="m3d-btn-move"
            onClick={() => {
              setTool(null)
              lens?.deactivate() // quitter tout outil externe → la main devient l'outil actif
            }}
          />,
        )}
        {tools.map((t) =>
          t === 'select' ? (
            slot('select', <SelectToolButton key={t} position={position} modes={selectModes} />)
          ) : t === 'symbol' ? (
            // Pas un outil de tracé : le bouton ouvre la palette, et le dépôt d'une
            // vignette crée la forme. Rendu ici pour qu'il prenne sa place dans
            // l'ordre de `tools`, comme n'importe quel autre outil.
            slot('symbol', <SymbolPaletteButton key={t} position={position} />)
          ) : (
            <ToolButton key={t} icon={TOOL_ICONS[t]} label={labels.tools[t]} tip={tip} shortcut={shortcuts[t]} active={tool === t} onClick={() => toggle(t)} />
          ),
        )}
        {/* Loupe : outil natif de la barre au même titre que les symboles. Le bouton
            s'efface tout seul si la carte est montée sans loupe (`toolbar={{ lens: false }}`). */}
        {slot('lens', <LensToolButton />)}
        {extraTools}
        {slot(
          'undo',
          <ToolButton icon={mdiUndo} label={labels.toolbar.undo} tip={tip} shortcut={undoKey} onClick={undo} disabled={!canUndo} />,
        )}
        {slot(
          'redo',
          <ToolButton icon={mdiRedo} label={labels.toolbar.redo} tip={tip} shortcut={`⇧${undoKey}`} onClick={redo} disabled={!canRedo} />,
        )}
        {slot('settings', <DrawSettingsButton position={position} tip={tip} />)}
        {slot(
          'clear',
          <ToolButton icon={mdiTrashCanOutline} label={labels.toolbar.clearAll} tip={tip} className="m3d-btn-delete" onClick={clear} />,
        )}
      </div>
      {!hidden && slot('stylePanel', <DrawStylePanel position={position} />)}
      {/* `disableStyleInjection` coupe le style « base » du paquet (couleurs/radius)
          — l'apparence vient de `.m3d-tip` (thème), son « core » reste injecté. */}
      <Tooltip
        id={TIP_ID}
        place={position === 'left' ? 'right' : 'left'}
        className="m3d-tip"
        classNameArrow="m3d-tip-arrow"
        disableStyleInjection
      />
    </ToolbarContext.Provider>
  )
}

/**
 * Bouton Sélectionner + flyout des modes (rectangle, polygone, lasso), ouvert au
 * SURVOL du côté opposé à la barre. Les sous-boutons affichent icône + libellé ;
 * le raccourci est dans leur tooltip (même convention que les autres boutons).
 */
function SelectToolButton({ position, modes }: { position: 'left' | 'right'; modes?: SelectMode[] }) {
  const { tool, setTool, selectMode, setSelectMode, shortcuts } = useDrawing()
  const labels = useLabels()
  const tip = useTip(TIP_ID)
  const [open, setOpen] = useState(false)
  const [side, setFlyout] = useAnchoredPanel(position, { clampHeight: false })
  useCloseWhenHidden(useToolbar().retracted, setOpen)

  const active = tool === 'select'
  const available = modes ? SELECT_MODE_META.filter((m) => modes.includes(m.mode)) : SELECT_MODE_META
  const hasFlyout = available.length > 1

  return (
    <div
      className="m3d-selectwrap"
      onPointerEnter={hasFlyout ? () => setOpen(true) : undefined}
      onPointerLeave={hasFlyout ? () => setOpen(false) : undefined}
    >
      <ToolButton
        icon={mdiCursorDefaultOutline}
        label={labels.tools.select}
        shortcut={shortcuts.select}
        active={active}
        className={hasFlyout ? 'm3d-btn-flyout' : undefined}
        onClick={() => {
          // Mode courant hors liste (config restreinte) : bascule sur le 1er autorisé.
          if (!active && available.length > 0 && !available.some((m) => m.mode === selectMode)) {
            setSelectMode(available[0]!.mode)
          }
          setTool(active ? null : 'select')
        }}
      />
      {open && hasFlyout && (
        <div ref={setFlyout} className={`m3d-panel m3d-flyout m3d-${side}`}>
          {available.map((m) => (
            <button
              key={m.mode}
              {...tip(labels.selectModes[m.mode].description, shortcuts[m.action])}
              className={`m3d-flyout-item${active && selectMode === m.mode ? ' m3d-on' : ''}`}
              onClick={() => {
                setSelectMode(m.mode)
                setTool('select')
                setOpen(false)
              }}
            >
              <Icon path={m.icon} size={0.7} />
              <span className="m3d-flyout-label">{labels.selectModes[m.mode].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
