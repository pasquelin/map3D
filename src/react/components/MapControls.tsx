import {
  mdiCompassOutline,
  mdiCrosshairsGps,
  mdiCubeOutline,
  mdiCursorMove,
  mdiEarth,
  mdiFullscreen,
  mdiMapOutline,
  mdiMinus,
  mdiPlus,
  mdiRotateOrbit,
  mdiTrafficLight,
  mdiVideo2d,
  mdiVideo3d,
} from '@mdi/js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Tooltip } from 'react-tooltip'
import { altitudeForZoom, type MapMode } from '../../core/MapEngine'
import { boundsContains } from '../../core/MarkerQuery'
import type { LatLng } from '../../shared'
import { useConfig, useLabels, useMapContext } from '../context'
import { useFitColumns } from './panelFit'
import { plainKey } from './shortcuts'
import { resolveSlots, type SlotConfig } from './slots'
import { TagFilterControl } from './TagFilterControl'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'

export type MapControlAction =
  | 'north'
  | 'zoomIn'
  | 'zoomOut'
  | 'tilt'
  | 'topDown'
  | 'globe'
  | 'layers'
  | 'fullscreen'
  /** Bascule 3D ↔ plan 2D. */
  | 'basemap'
  | 'traffic'

/** Boutons individuels de la barre (grain fin de `MapControlsProps.buttons`). */
export type MapControlButton =
  | 'pan'
  | 'rotate'
  | 'compass'
  | 'zoomIn'
  | 'zoomOut'
  | 'tilt'
  | 'topDown'
  | 'globe'
  | 'layers'
  | 'fullscreen'
  | 'mode3d'
  | 'plan'
  | 'traffic'
  /** Retour au point de référence de l'écran (cf. `MapControlsProps.target`). */
  | 'target'

/** Groupes de la barre — l'unité du grain GROUPE (masquage, remplacement, ordre). */
export type ControlGroup = 'drag' | 'compass' | 'zoom' | 'view' | 'basemap' | 'target' | 'layers' | 'fullscreen'

export type MapControlsProps = {
  /** Côté d'ancrage de la barre. */
  position?: 'left' | 'right'
  /** Grain GROUPE : masquer (`false`) ou remplacer (ReactNode) un groupe entier de la barre. */
  components?: SlotConfig<ControlGroup>
  /**
   * Grain BOUTON : `false` masque un bouton précis (ex. `{ rotate: false, zoomOut: false }`).
   * Un groupe dont tous les boutons sont masqués disparaît, et le raccourci
   * clavier d'un bouton masqué est désactivé avec lui.
   */
  buttons?: Partial<Record<MapControlButton, boolean>>
  /**
   * Raccourcis clavier par action — `false` pour en désactiver un, une autre
   * touche pour le remapper si elle est déjà prise ailleurs dans l'app. Lettres
   * SEULES (pas de ⌘/Ctrl : les navigateurs réservent ⌘T/⌘N/⌘W…), identiques
   * Mac/PC, affichées dans les tooltips. Défauts : `interaction.shortcuts.controls`
   * (README « Raccourcis clavier ») — sans collision avec les outils de dessin.
   */
  shortcuts?: Partial<Record<MapControlAction, string | false>>
  /** Libellé lisible d'un tag dans le panneau « Couches » (défaut : le tag brut). */
  tagLabel?: (tag: string) => string
  /**
   * Point de référence de l'écran (l'alerte consultée, l'événement en cours…) :
   * fournir cette prop ajoute un bouton **« revenir à la cible »** à la barre ;
   * l'omettre le retire. La carte n'a pas à savoir ce que la cible représente,
   * seulement où elle est.
   */
  target?: MapControlTarget
}

export type MapControlTarget = {
  position: LatLng
  /** Tooltip et `aria-label` du bouton (défaut : `labels.controls.target`). */
  label?: string
  /**
   * Zoom d'arrivée. Absent = l'altitude courante est conservée (simple recentrage),
   * ce qui évite de casser le niveau de détail que l'utilisateur avait choisi.
   */
  zoom?: number
  /**
   * N'afficher le bouton que lorsque la cible est **sortie de la vue**. Il
   * disparaît dès qu'elle redevient visible : le bouton ne dit alors plus « reviens
   * ici » alors qu'on y est déjà.
   */
  onlyWhenOutOfView?: boolean
}

const TIP_ID = 'm3d-tooltip'

/** Sections de la barre (grain GROUPE) — clés de `MapControlsProps.components`. */
type Slot = keyof NonNullable<MapControlsProps['components']>

/** Contrôles de navigation : déplacement/rotation du drag, boussole, zoom, inclinaison / vue du dessus / retour au globe, couches (filtre par tag), plein écran. */
export function MapControls({
  position = 'right',
  components = {},
  buttons = {},
  shortcuts,
  tagLabel,
  target,
}: MapControlsProps) {
  const { engine, theme } = useMapContext()
  const config = useConfig()
  const labels = useLabels()

  // Cible hors de la vue ? Recalculé sur `viewport` (la vue stabilisée), pas sur
  // `camera` : inutile de tester à chaque frame d'un vol, seule la vue posée compte.
  const [targetOut, setTargetOut] = useState(false)
  const watchTarget = target?.onlyWhenOutOfView === true
  const tLat = target?.position.lat
  const tLng = target?.position.lng
  useEffect(() => {
    if (!watchTarget || tLat === undefined || tLng === undefined) return
    const check = () => setTargetOut(!boundsContains(engine.getView().bounds, { lat: tLat, lng: tLng }))
    check()
    return engine.on('viewport', check)
  }, [engine, watchTarget, tLat, tLng])

  const goToTarget = useCallback(() => {
    if (!target) return
    // UN seul vol, position et altitude ensemble. Enchaîner `panTo` puis `setZoom`
    // ne marcherait pas : `setZoom` relit l'état COURANT pour savoir où rester, et
    // à cet instant le vol vient d'être armé sans avoir avancé d'une frame — il
    // repartirait donc vers le point de départ, annulant le recentrage.
    engine.camera.panTo(
      target.position,
      target.zoom !== undefined ? { altitude: altitudeForZoom(target.zoom) } : undefined,
    )
  }, [engine, target])

  // Mode du drag gauche (déplacer / pivoter) — source de vérité côté moteur.
  const [dragMode, setDragModeState] = useState(engine.getDragMode())
  useEffect(() => engine.on('dragmode', setDragModeState), [engine])

  // Fond de carte (3D / plan / trafic) — également piloté par le moteur, qui éteint
  // le trafic de lui-même au retour en 3D : l'UI suit l'événement plutôt que de
  // dupliquer la règle.
  // Initialiseur paresseux, et objet stable côté moteur : la barre ne se re-rend
  // que sur changement réel du fond.
  const [basemap, setBasemap] = useState(() => engine.getBasemap())
  useEffect(() => engine.on('basemap', setBasemap), [engine])

  const zoomBy = useCallback(
    (factor: number) => {
      const s = engine.camera.getState()
      engine.camera.flyTo(
        { lat: s.lat, lng: s.lng, altitude: s.altitude * factor },
        { duration: theme.animations.zoom },
      )
    },
    [engine, theme.animations.zoom],
  )
  const topDown = useCallback(() => engine.flyToTopDown(), [engine])
  const tiltUp = useCallback(() => engine.tiltBy(config.camera.tiltStep), [engine, config.camera.tiltStep])
  const globe = useCallback(() => engine.flyToGlobe(), [engine])
  const toggleFs = useCallback(() => {
    const root = engine.renderer.domElement.parentElement
    if (!document.fullscreenElement) root?.requestFullscreen?.()
    else document.exitFullscreen?.()
  }, [engine])

  // Sections configurables : convention partagée avec `Toolbar` (cf. `slots.ts`).
  const { slot, isDefault } = resolveSlots<Slot>(components)
  /** Le groupe PAR DÉFAUT est-il rendu ? — même vérité pour le rendu ET pour
   *  l'activation des raccourcis : un slot customisé ne garde pas d'action clavier
   *  fantôme. S'ajoute au prédicat partagé : le fond 2D est un service Google, sans
   *  clé le groupe n'existe pas (une seule vérité, pas trois tests séparés). */
  const defaultShown = (key: Slot) => isDefault(key) && (key !== 'basemap' || engine.supportsBasemap2d)
  /** Ce bouton précis est-il visible ? (grain fin `buttons`, dans un groupe rendu) */
  const btn = (b: MapControlButton) => buttons[b] !== false
  // Défauts pris dans la config : les dix touches vivaient dans une table de module,
  // donc remappables par prop mais invisibles depuis `<Map config>`. L'assertion
  // `satisfies` garde les deux ensembles de clés alignés.
  const keys = {
    ...(config.interaction.shortcuts.controls satisfies Record<MapControlAction, string | false>),
    ...shortcuts,
  }
  // Barre compactée puis étalée en colonnes plutôt que débordant d'une carte courte,
  // sans jamais passer sous la boîte de recherche (sans effet si elle est à l'opposé).
  const setBar = useFitColumns({ recenter: true, avoid: '.m3d-search' })
  const tip = useTip(TIP_ID)

  // Raccourcis : listener monté UNE fois (les props sont lues via ref au moment de
  // la frappe — un littéral `shortcuts={{...}}` inline ne recrée pas le listener).
  const stateRef = useRef({ keys, defaultShown, btn })
  stateRef.current = { keys, defaultShown, btn }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = plainKey(e)
      if (!k) return
      const { keys, defaultShown, btn } = stateRef.current
      // '=' accepté pour zoomIn '+' : même touche sans Maj sur la plupart des claviers.
      const is = (a: MapControlAction) => k === keys[a] || (keys[a] === '+' && k === '=')
      // Un raccourci n'est actif que si SON bouton est visible (groupe + grain fin).
      const hit = (slot: Slot, button: MapControlButton, action: MapControlAction) =>
        defaultShown(slot) && btn(button) && is(action)
      // Lu au moment de la frappe, pas capturé : une seule source de vérité.
      const bm = engine.getBasemap()
      const to: MapMode = bm.mode === '3d' ? 'plan' : '3d'
      if (hit('compass', 'compass', 'north') || hit('view', 'topDown', 'topDown')) topDown()
      else if (hit('zoom', 'zoomIn', 'zoomIn')) zoomBy(config.camera.zoomFactor.in)
      else if (hit('zoom', 'zoomOut', 'zoomOut')) zoomBy(config.camera.zoomFactor.out)
      else if (hit('view', 'tilt', 'tilt')) tiltUp()
      else if (hit('view', 'globe', 'globe')) globe()
      else if (hit('fullscreen', 'fullscreen', 'fullscreen')) toggleFs()
      // La bascule s'applique au bouton de destination : masquer « Plan » désactive
      // aussi la touche qui y mènerait.
      else if (hit('basemap', to === 'plan' ? 'plan' : 'mode3d', 'basemap')) engine.setMapMode(to)
      else if (bm.trafficAvailable && hit('basemap', 'traffic', 'traffic')) engine.setTrafficVisible(!bm.traffic)
      else return
      // Raccourci consommé : pas d'action par défaut du navigateur (ex. frappe
      // insérée si un champ vient de prendre le focus).
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine, topDown, zoomBy, tiltUp, globe, toggleFs])

  return (
    <div ref={setBar} className={`m3d-controls m3d-${position}`}>
      {slot(
        'drag',
        (btn('pan') || btn('rotate')) && (
          <div className="m3d-controls-group">
            {btn('pan') && (
              <ToolButton
                icon={mdiCursorMove}
                label={labels.controls.pan}
                tip={tip}
                active={dragMode === 'pan'}
                onClick={() => engine.setDragMode('pan')}
              />
            )}
            {btn('rotate') && (
              <ToolButton
                icon={mdiRotateOrbit}
                label={labels.controls.rotate}
                tip={tip}
                active={dragMode === 'rotate'}
                onClick={() => engine.setDragMode('rotate')}
              />
            )}
          </div>
        ),
      )}

      {slot(
        'compass',
        btn('compass') && (
          <div className="m3d-controls-group">
            <ToolButton
              icon={mdiCompassOutline}
              label={labels.controls.north}
              tip={tip}
              shortcut={keys.north}
              onClick={topDown}
            />
          </div>
        ),
      )}

      {slot(
        'zoom',
        (btn('zoomIn') || btn('zoomOut')) && (
          <div className="m3d-controls-group">
            {btn('zoomIn') && (
              <ToolButton
                icon={mdiPlus}
                label={labels.controls.zoomIn}
                tip={tip}
                shortcut={keys.zoomIn}
                onClick={() => zoomBy(config.camera.zoomFactor.in)}
              />
            )}
            {btn('zoomOut') && (
              <ToolButton
                icon={mdiMinus}
                label={labels.controls.zoomOut}
                tip={tip}
                shortcut={keys.zoomOut}
                onClick={() => zoomBy(config.camera.zoomFactor.out)}
              />
            )}
          </div>
        ),
      )}

      {slot(
        'view',
        (btn('tilt') || btn('topDown') || btn('globe')) && (
          <div className="m3d-controls-group">
            {btn('tilt') && (
              <ToolButton
                icon={mdiVideo3d}
                label={labels.controls.tilt}
                tip={tip}
                shortcut={keys.tilt}
                onClick={tiltUp}
              />
            )}
            {btn('topDown') && (
              <ToolButton
                icon={mdiVideo2d}
                label={labels.controls.topDown}
                tip={tip}
                shortcut={keys.topDown}
                onClick={topDown}
              />
            )}
            {btn('globe') && (
              <ToolButton
                icon={mdiEarth}
                label={labels.controls.globe}
                tip={tip}
                shortcut={keys.globe}
                onClick={globe}
              />
            )}
          </div>
        ),
      )}

      {/* Fond de carte : le groupe entier disparaît sans clé Google (les modes 2D et
          le trafic sont des services Google). La visibilité du bouton trafic dépend
          de l'ÉTAT (pas seulement de la config) : elle entre donc dans le test de
          non-vacuité, sinon le groupe se rendrait vide. */}
      {slot(
        'basemap',
        engine.supportsBasemap2d && (btn('mode3d') || btn('plan') || (btn('traffic') && basemap.trafficAvailable)) && (
          <div className="m3d-controls-group">
            {btn('mode3d') && (
              <ToolButton
                icon={mdiCubeOutline}
                label={labels.controls.mode3d}
                tip={tip}
                // Le raccourci bascule : ne l'annoncer que sur le bouton vers
                // lequel il mène, sinon « Vue 3D (B) » s'affiche en étant déjà en 3D.
                shortcut={basemap.mode === '3d' ? undefined : keys.basemap}
                active={basemap.mode === '3d'}
                onClick={() => engine.setMapMode('3d')}
              />
            )}
            {btn('plan') && (
              <ToolButton
                icon={mdiMapOutline}
                label={labels.controls.plan}
                tip={tip}
                shortcut={basemap.mode === '3d' ? keys.basemap : undefined}
                active={basemap.mode === 'plan'}
                onClick={() => engine.setMapMode('plan')}
              />
            )}
            {btn('traffic') && basemap.trafficAvailable && (
              <ToolButton
                icon={mdiTrafficLight}
                label={labels.controls.traffic}
                tip={tip}
                shortcut={keys.traffic}
                active={basemap.traffic}
                onClick={() => engine.setTrafficVisible(!basemap.traffic)}
              />
            )}
          </div>
        ),
      )}

      {/* Cible : présente = bouton, absente = rien. Aucune valeur par défaut ne
          serait sensée — la lib ne sait pas vers quoi « revenir » d'elle-même. */}
      {slot(
        'target',
        btn('target') && target && (!target.onlyWhenOutOfView || targetOut) && (
          <div className="m3d-controls-group">
            <ToolButton
              icon={mdiCrosshairsGps}
              label={target.label ?? labels.controls.target}
              tip={tip}
              onClick={goToTarget}
            />
          </div>
        ),
      )}

      {slot(
        'layers',
        btn('layers') && (
          <TagFilterControl position={position} tipId={TIP_ID} shortcut={keys.layers} tagLabel={tagLabel} />
        ),
      )}

      {slot(
        'fullscreen',
        btn('fullscreen') && (
          <div className="m3d-controls-group">
            <ToolButton
              icon={mdiFullscreen}
              label={labels.controls.fullscreen}
              tip={tip}
              shortcut={keys.fullscreen}
              onClick={toggleFs}
            />
          </div>
        ),
      )}

      {/* Apparence pilotée par `.m3d-tip` (thème) : le style « base » du paquet est
          coupé, son « core » (position/opacité/transitions) reste injecté. */}
      <Tooltip
        id={TIP_ID}
        place={position === 'right' ? 'left' : 'right'}
        className="m3d-tip"
        classNameArrow="m3d-tip-arrow"
        disableStyleInjection
      />
    </div>
  )
}
