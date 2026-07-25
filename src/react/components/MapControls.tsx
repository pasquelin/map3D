import {
  mdiCompassOutline,
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
import Icon from '@mdi/react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Tooltip } from 'react-tooltip'
import 'react-tooltip/dist/react-tooltip.css'
import type { MapMode } from '../../core/MapEngine'
import { useLabels, useMapContext } from '../context'
import { useFitColumns } from './panelFit'
import { plainKey } from './shortcuts'
import { TagFilterControl } from './TagFilterControl'
import { ICON_SIZE, useTip } from './tooltip'

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

export type MapControlsProps = {
  position?: 'left' | 'right'
  /** Grain GROUPE : masquer (`false`) ou remplacer (ReactNode) un groupe entier de la barre. */
  components?: Partial<
    Record<'drag' | 'compass' | 'zoom' | 'view' | 'basemap' | 'layers' | 'fullscreen', boolean | ReactNode>
  >
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
   * Mac/PC, affichées dans les tooltips. Défauts : voir `DEFAULT_SHORTCUTS`
   * (README « Raccourcis clavier ») — sans collision avec les outils de dessin.
   */
  shortcuts?: Partial<Record<MapControlAction, string | false>>
  /** Libellé lisible d'un tag dans le panneau « Couches » (défaut : le tag brut). */
  tagLabel?: (tag: string) => string
}

/** Pas d'inclinaison par clic (rad). */
const TILT_STEP = Math.PI * 0.11
const TIP_ID = 'm3d-tooltip'

const DEFAULT_SHORTCUTS: Record<MapControlAction, string | false> = {
  north: 'n',
  zoomIn: '+',
  zoomOut: '-',
  tilt: 'i',
  /** N (nord) fait déjà la vue du dessus — pas de 2e touche par défaut. */
  topDown: false,
  globe: 'g',
  layers: 't',
  fullscreen: 'f',
  basemap: 'b',
  /** Le bouton n'existe qu'en mode plan : un raccourci global serait déroutant. */
  traffic: false,
}

function isNode(v: boolean | ReactNode | undefined): v is ReactNode {
  return v !== undefined && typeof v !== 'boolean'
}

/** Contrôles de navigation : déplacement/rotation du drag, boussole, zoom, inclinaison / vue du dessus / retour au globe, couches (filtre par tag), plein écran. */
export function MapControls({ position = 'right', components = {}, buttons = {}, shortcuts, tagLabel }: MapControlsProps) {
  const { engine } = useMapContext()
  const labels = useLabels()

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
      engine.camera.flyTo({ lat: s.lat, lng: s.lng, altitude: s.altitude * factor }, { duration: 0.4 })
    },
    [engine],
  )
  const topDown = useCallback(() => engine.flyToTopDown(), [engine])
  const tiltUp = useCallback(() => engine.tiltBy(TILT_STEP), [engine])
  const globe = useCallback(() => engine.flyToGlobe(), [engine])
  const toggleFs = useCallback(() => {
    const root = engine.renderer.domElement.parentElement
    if (!document.fullscreenElement) root?.requestFullscreen?.()
    else document.exitFullscreen?.()
  }, [engine])

  type Slot = keyof NonNullable<MapControlsProps['components']>
  /** Le groupe PAR DÉFAUT est-il rendu ? (ni masqué, ni remplacé par un nœud custom)
   *  — même vérité pour le rendu et l'activation des raccourcis : un slot customisé
   *  ne garde pas d'action clavier fantôme. */
  //  Le fond 2D est un service Google : sans clé, le groupe n'existe pas — même
  //  vérité pour le rendu, le clavier et la non-vacuité, plutôt que trois tests.
  const defaultShown = (key: Slot) =>
    !isNode(components[key]) && components[key] !== false && (key !== 'basemap' || engine.supportsBasemap2d)
  /** Ce bouton précis est-il visible ? (grain fin `buttons`, dans un groupe rendu) */
  const btn = (b: MapControlButton) => buttons[b] !== false
  const keys = { ...DEFAULT_SHORTCUTS, ...shortcuts }
  // Barre compactée puis étalée en colonnes plutôt que débordant d'une carte courte,
  // sans jamais passer sous la boîte de recherche (sans effet si elle est à l'opposé).
  const setBar = useFitColumns({ recenter: true, avoid: '.m3d-search' })
  const tipBase = useTip(TIP_ID)
  const tip = (label: string, action?: MapControlAction) => tipBase(label, action && keys[action])

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
      else if (hit('zoom', 'zoomIn', 'zoomIn')) zoomBy(0.5)
      else if (hit('zoom', 'zoomOut', 'zoomOut')) zoomBy(2)
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
      {isNode(components.drag)
        ? components.drag
        : defaultShown('drag') && (btn('pan') || btn('rotate')) && (
            <div className="m3d-controls-group">
              {btn('pan') && (
                <button
                  className={`m3d-btn${dragMode === 'pan' ? ' m3d-on' : ''}`}
                  {...tip(labels.controls.pan)}
                  onClick={() => engine.setDragMode('pan')}
                >
                  <Icon path={mdiCursorMove} size={ICON_SIZE} />
                </button>
              )}
              {btn('rotate') && (
                <button
                  className={`m3d-btn${dragMode === 'rotate' ? ' m3d-on' : ''}`}
                  {...tip(labels.controls.rotate)}
                  onClick={() => engine.setDragMode('rotate')}
                >
                  <Icon path={mdiRotateOrbit} size={ICON_SIZE} />
                </button>
              )}
            </div>
          )}

      {isNode(components.compass)
        ? components.compass
        : defaultShown('compass') && btn('compass') && (
            <div className="m3d-controls-group">
              <button className="m3d-btn" {...tip(labels.controls.north, 'north')} onClick={topDown}>
                <Icon path={mdiCompassOutline} size={ICON_SIZE} />
              </button>
            </div>
          )}

      {isNode(components.zoom)
        ? components.zoom
        : defaultShown('zoom') && (btn('zoomIn') || btn('zoomOut')) && (
            <div className="m3d-controls-group">
              {btn('zoomIn') && (
                <button className="m3d-btn" {...tip(labels.controls.zoomIn, 'zoomIn')} onClick={() => zoomBy(0.5)}>
                  <Icon path={mdiPlus} size={ICON_SIZE} />
                </button>
              )}
              {btn('zoomOut') && (
                <button className="m3d-btn" {...tip(labels.controls.zoomOut, 'zoomOut')} onClick={() => zoomBy(2)}>
                  <Icon path={mdiMinus} size={ICON_SIZE} />
                </button>
              )}
            </div>
          )}

      {isNode(components.view)
        ? components.view
        : defaultShown('view') && (btn('tilt') || btn('topDown') || btn('globe')) && (
            <div className="m3d-controls-group">
              {btn('tilt') && (
                <button className="m3d-btn" {...tip(labels.controls.tilt, 'tilt')} onClick={tiltUp}>
                  <Icon path={mdiVideo3d} size={ICON_SIZE} />
                </button>
              )}
              {btn('topDown') && (
                <button className="m3d-btn" {...tip(labels.controls.topDown, 'topDown')} onClick={topDown}>
                  <Icon path={mdiVideo2d} size={ICON_SIZE} />
                </button>
              )}
              {btn('globe') && (
                <button className="m3d-btn" {...tip(labels.controls.globe, 'globe')} onClick={globe}>
                  <Icon path={mdiEarth} size={ICON_SIZE} />
                </button>
              )}
            </div>
          )}

      {/* Fond de carte : le groupe entier disparaît sans clé Google (`defaultShown`),
          les modes 2D et le trafic étant des services Google. La visibilité du
          bouton trafic dépend de l'ÉTAT (pas seulement de la config) : elle entre
          donc dans le test de non-vacuité, sinon le groupe se rendrait vide. */}
      {isNode(components.basemap)
        ? components.basemap
        : defaultShown('basemap') &&
          (btn('mode3d') || btn('plan') || (btn('traffic') && basemap.trafficAvailable)) && (
            <div className="m3d-controls-group">
              {btn('mode3d') && (
                <button
                  className={`m3d-btn${basemap.mode === '3d' ? ' m3d-on' : ''}`}
                  // Le raccourci bascule : ne l'annoncer que sur le bouton vers
                  // lequel il mène, sinon « Vue 3D (B) » s'affiche en étant déjà en 3D.
                  {...tip(labels.controls.mode3d, basemap.mode === '3d' ? undefined : 'basemap')}
                  onClick={() => engine.setMapMode('3d')}
                >
                  <Icon path={mdiCubeOutline} size={ICON_SIZE} />
                </button>
              )}
              {btn('plan') && (
                <button
                  className={`m3d-btn${basemap.mode === 'plan' ? ' m3d-on' : ''}`}
                  {...tip(labels.controls.plan, basemap.mode === '3d' ? 'basemap' : undefined)}
                  onClick={() => engine.setMapMode('plan')}
                >
                  <Icon path={mdiMapOutline} size={ICON_SIZE} />
                </button>
              )}
              {btn('traffic') && basemap.trafficAvailable && (
                <button
                  className={`m3d-btn${basemap.traffic ? ' m3d-on' : ''}`}
                  {...tip(labels.controls.traffic, 'traffic')}
                  onClick={() => engine.setTrafficVisible(!basemap.traffic)}
                >
                  <Icon path={mdiTrafficLight} size={ICON_SIZE} />
                </button>
              )}
            </div>
          )}

      {isNode(components.layers)
        ? components.layers
        : defaultShown('layers') && btn('layers') && (
            <TagFilterControl position={position} tipId={TIP_ID} shortcut={keys.layers} tagLabel={tagLabel} />
          )}

      {isNode(components.fullscreen)
        ? components.fullscreen
        : defaultShown('fullscreen') && btn('fullscreen') && (
            <div className="m3d-controls-group">
              <button className="m3d-btn" {...tip(labels.controls.fullscreen, 'fullscreen')} onClick={toggleFs}>
                <Icon path={mdiFullscreen} size={ICON_SIZE} />
              </button>
            </div>
          )}

      <Tooltip id={TIP_ID} place={position === 'right' ? 'left' : 'right'} />
    </div>
  )
}
