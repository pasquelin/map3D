// Iconographie : le glyphe « 3D » va à la BASCULE DE FOND (3D ↔ plan) — désormais UN seul
// bouton à état actif, logé dans le groupe boussole (l'ancien bouton « 2D » a disparu :
// éteindre la 3D revient au plan). Les actions caméra (incliner / remettre à plat) prennent
// la perspective et, elles, ne portent pas d'état.
import {
  mdiCompassOutline,
  mdiCrosshairsGps,
  mdiCursorMove,
  mdiEarth,
  mdiGrid,
  mdiFullscreen,
  mdiMinus,
  mdiPerspectiveMore,
  mdiPlus,
  mdiRotateOrbit,
  mdiTrafficLight,
  mdiWalk,
  mdiVideo3d,
} from '@mdi/js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Tooltip } from 'react-tooltip'
import { canEnterMode } from '../../core/basemap'
import { altitudeForZoom, type MapMode } from '../../core/MapEngine'
import { boundsContains } from '../../core/MarkerQuery'
import type { LatLng } from '../../shared'
import { useConfig, useLabels, useMapContext } from '../context'
import { useGraticule } from '../hooks/useGraticule'
import { usePedestrian } from '../hooks/usePedestrian'
import { useFitColumns } from './panelFit'
import { plainKey } from './shortcuts'
import { resolveSlots, type SlotConfig } from './slots'
import { CatalogControl } from './CatalogControl'
import { TagFilterControl } from './TagFilterControl'
import { TemplatesPanel, type TemplatesPanelProps } from './TemplatesPanel'
import { ToolButton } from './ToolButton'
import { useTip } from './tooltip'

export type MapControlAction =
  | 'north'
  | 'zoomIn'
  | 'zoomOut'
  | 'tilt'
  | 'globe'
  | 'graticule'
  | 'layers'
  | 'catalog'
  | 'fullscreen'
  /** Bascule 3D ↔ plan 2D. */
  | 'basemap'
  | 'traffic'
  /** Entrer / quitter le mode piéton. */
  | 'pedestrian'

/** Boutons individuels de la barre (grain fin de `MapControlsProps.buttons`). */
export type MapControlButton =
  | 'pan'
  | 'rotate'
  | 'compass'
  | 'zoomIn'
  | 'zoomOut'
  | 'tilt'
  | 'globe'
  /** Grille de coordonnées. Sa TOUCHE vit dans `shortcuts.draw.graticule`, avec le
   *  sous-menu « Mesures » qu'elle partage — pas dans `shortcuts.controls`. */
  | 'graticule'
  | 'layers'
  /** Catalogue d'entités distantes — partage le groupe `layers` avec « Couches ». */
  | 'catalog'
  | 'fullscreen'
  | 'mode3d'
  | 'plan'
  | 'traffic'
  /** Retour au point de référence de l'écran (cf. `MapControlsProps.target`). */
  | 'target'
  /** Mode piéton — n'apparaît qu'en 3D photoréaliste externe. */
  | 'pedestrian'

/**
 * Groupes de la barre — l'unité du grain GROUPE (masquage, remplacement, ordre).
 *
 * `compass` réunit tout le « point de vue » : boussole, inclinaison, bascule 3D ↔ plan, trafic,
 * retour au globe et grille. Il n'y a donc plus de groupe `basemap` ni `view` dédié ; masquer /
 * remplacer passe par `compass` (grain groupe) ou par les boutons (grain fin).
 */
export type ControlGroup = 'drag' | 'compass' | 'zoom' | 'pedestrian' | 'target' | 'layers' | 'fullscreen'

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
   * Gestionnaire de templates (bouton sous « Couches », même structure). `false`/absent
   * le retire ; un objet le règle (provider API, catégories…). Fourni par `<Map templates>`.
   */
  templates?: false | TemplatesPanelProps
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

/** Clé de bouton qui gouverne l'accès à un mode de fond : `plan` mène au plan, le reste à la
 *  3D. Une seule règle, lue au render (visibilité de la bascule) comme au clavier. */
const modeButtonKey = (m: MapMode): MapControlButton => (m === 'plan' ? 'plan' : 'mode3d')

/** Sections de la barre (grain GROUPE) — clés de `MapControlsProps.components`. */
type Slot = keyof NonNullable<MapControlsProps['components']>

/** Contrôles de navigation : déplacement/rotation du drag, boussole, zoom, inclinaison / vue du dessus / retour au globe, couches (filtre par tag), plein écran. */
export function MapControls({
  position = 'right',
  components = {},
  buttons = {},
  shortcuts,
  tagLabel,
  templates,
  target,
}: MapControlsProps) {
  const { engine, theme } = useMapContext()
  const config = useConfig()
  const graticule = useGraticule()
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
  // Initialiseur PARESSEUX : passé par valeur, `engine.getDragMode()` s'appelle à
  // chaque render pour un résultat que React jette après le premier.
  const [dragMode, setDragModeState] = useState(() => engine.getDragMode())
  useEffect(() => engine.on('dragmode', setDragModeState), [engine])

  // Fond de carte (3D / plan / trafic) — également piloté par le moteur, qui éteint
  // le trafic de lui-même au retour en 3D : l'UI suit l'événement plutôt que de
  // dupliquer la règle.
  // Initialiseur paresseux, et objet stable côté moteur : la barre ne se re-rend
  // que sur changement réel du fond.
  const [basemap, setBasemap] = useState(() => engine.getBasemap())
  useEffect(() => engine.on('basemap', setBasemap), [engine])

  // Mode piéton — même patron que le fond de carte : le moteur referme le mode de lui-même
  // (bascule 2D, Échap dans le canvas), et la barre suit l'événement plutôt que ses propres
  // appels.
  const pedestrian = usePedestrian()
  /** Mode armé (placement) OU en cours : dans les deux cas, le bouton quitte. */
  const inPedestrian = pedestrian.state.mode === 'pedestrian'

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
  /** Ce bouton précis est-il visible ? (grain fin `buttons`, dans un groupe rendu) */
  const btn = (b: MapControlButton) => buttons[b] !== false
  /**
   * Bascule 3D ↔ plan réduite à UN bouton (« 3D »), logé dans le groupe boussole : sa
   * destination est le mode OPPOSÉ à l'actuel. Il n'est proposé que si cette destination a de
   * quoi s'afficher (`canEnterMode`, la même table de vérité que `engine.setMapMode` et le
   * raccourci `b` plus bas), et la clé de bouton lue suit la destination : `plan` quand on
   * éteint la 3D (utile en fond externe, où l'hôte peut vouloir interdire le retour au plan),
   * `mode3d` quand on la rallume.
   */
  const toMode: MapMode = basemap.mode === '3d' ? 'plan' : '3d'
  const showModeToggle = btn(modeButtonKey(toMode)) && canEnterMode(basemap, toMode)
  /** Trafic : dépend de l'état ET du fournisseur, inchangé — il rejoint juste le groupe boussole. */
  const showTraffic = btn('traffic') && basemap.trafficAvailable
  /**
   * Le bouton piéton n'existe que si le mode est SERVABLE (3D photoréaliste externe) — même
   * règle que la paire 2D/3D : un bouton qui ne mène nulle part n'est pas proposé. Masqué et
   * non grisé, c'est la convention de cette barre : aucun de ses boutons n'a d'état inerte.
   */
  const showPedestrian = btn('pedestrian') && pedestrian.state.available
  /** Le groupe PAR DÉFAUT est-il rendu ? — même vérité pour le rendu ET pour
   *  l'activation des raccourcis : un slot customisé ne garde pas d'action clavier fantôme. */
  const defaultShown = (key: Slot) => isDefault(key) && (key !== 'pedestrian' || pedestrian.state.available)
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
  // `graticule` entre dans le ref pour la même raison que le reste : le handler clavier est
  // abonné une fois et survit à ses renders.
  const stateRef = useRef({ keys, defaultShown, btn, graticule })
  stateRef.current = { keys, defaultShown, btn, graticule }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = plainKey(e)
      if (!k) return
      const { keys, defaultShown, btn, graticule } = stateRef.current
      // '=' accepté pour zoomIn '+' : même touche sans Maj sur la plupart des claviers.
      const is = (a: MapControlAction) => k === keys[a] || (keys[a] === '+' && k === '=')
      // Un raccourci n'est actif que si SON bouton est visible (groupe + grain fin).
      const hit = (slot: Slot, button: MapControlButton, action: MapControlAction) =>
        defaultShown(slot) && btn(button) && is(action)
      // Lu au moment de la frappe, pas capturé : une seule source de vérité.
      const bm = engine.getBasemap()
      const to: MapMode = bm.mode === '3d' ? 'plan' : '3d'
      if (hit('compass', 'compass', 'north')) topDown()
      else if (hit('zoom', 'zoomIn', 'zoomIn')) zoomBy(config.camera.zoomFactor.in)
      else if (hit('zoom', 'zoomOut', 'zoomOut')) zoomBy(config.camera.zoomFactor.out)
      else if (hit('compass', 'tilt', 'tilt')) tiltUp()
      else if (hit('compass', 'globe', 'globe')) globe()
      // Un CALQUE, pas un mode : on ne relâche rien, et un tracé en cours n'est pas interrompu.
      else if (hit('compass', 'graticule', 'graticule')) graticule.toggle()
      else if (hit('fullscreen', 'fullscreen', 'fullscreen')) toggleFs()
      // La bascule s'applique au bouton de destination : masquer « Plan » désactive
      // aussi la touche qui y mènerait — et `canEnterMode` la désactive de même quand la
      // destination n'a rien à afficher, exactement comme elle en masque le bouton. Le
      // bouton unique vit désormais dans le groupe boussole (`compass`).
      else if (canEnterMode(bm, to) && hit('compass', modeButtonKey(to), 'basemap')) engine.setMapMode(to)
      else if (bm.trafficAvailable && hit('compass', 'traffic', 'traffic')) engine.setTrafficVisible(!bm.traffic)
      else if (hit('pedestrian', 'pedestrian', 'pedestrian')) {
        // Lu au moment de la frappe (comme le fond de carte) : une seule source de vérité,
        // et la touche reste juste même si la carte a changé de mode entre-temps.
        if (engine.getPedestrian().mode === 'pedestrian') engine.exitPedestrian()
        else engine.enterPedestrianPlacement()
      } else return
      // Raccourci consommé : pas d'action par défaut du navigateur (ex. frappe
      // insérée si un champ vient de prendre le focus).
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Les deux facteurs de zoom sont des primitives lues dans la closure (le `stateRef`
    // ci-dessus ne couvre que ce qui change d'identité à chaque render) : sans eux, un
    // `config` revu à chaud gardait le facteur du montage.
  }, [engine, topDown, zoomBy, tiltUp, globe, toggleFs, config.camera.zoomFactor.in, config.camera.zoomFactor.out])

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

      {/* Groupe « point de vue », tout réuni : boussole (nord / vue du dessus), inclinaison,
          bascule 3D ↔ plan, trafic, retour au globe et grille. Le « d'où on regarde » et le
          « quoi qu'on regarde » (carte plate ou volume) tiennent dans une seule pilule ; la
          bascule 3D et le trafic en sont les seuls boutons à état actif. Inclinaison, globe et
          grille venaient du groupe « Vues », la bascule d'un groupe `basemap` dédié — tous ont
          migré ici. */}
      {slot(
        'compass',
        (btn('compass') || btn('tilt') || showModeToggle || showTraffic || btn('globe') || btn('graticule')) && (
          <div className="m3d-controls-group">
            {btn('compass') && (
              <ToolButton
                icon={mdiCompassOutline}
                label={labels.controls.north}
                tip={tip}
                shortcut={keys.north}
                onClick={topDown}
              />
            )}
            {btn('tilt') && (
              <ToolButton
                icon={mdiPerspectiveMore}
                label={labels.controls.tilt}
                tip={tip}
                shortcut={keys.tilt}
                onClick={tiltUp}
              />
            )}
            {/* Bascule 3D ↔ plan : UN seul bouton (l'ancien « 2D » a disparu). Actif = on est
                en 3D ; l'éteindre revient à l'ancien clic « Plan » — `setMapMode('plan')`. */}
            {showModeToggle && (
              <ToolButton
                icon={mdiVideo3d}
                label={labels.controls.mode3d}
                tip={tip}
                shortcut={keys.basemap}
                active={basemap.mode === '3d'}
                onClick={() => engine.setMapMode(toMode)}
              />
            )}
            {showTraffic && (
              <ToolButton
                icon={mdiTrafficLight}
                label={labels.controls.traffic}
                tip={tip}
                shortcut={keys.traffic}
                active={basemap.traffic}
                onClick={() => engine.setTrafficVisible(!basemap.traffic)}
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
            {/* Grille de coordonnées. Présente ICI en plus du sous-menu « Mesures » de la
                barre d'outils parce que celle-ci se replie sous `drawToolbarMinZoom` (11) :
                sans ce bouton, la grille deviendrait impilotable en vue globe — exactement
                là où elle sert le plus. Les deux pilotent le même état moteur. */}
            {btn('graticule') && (
              <ToolButton
                icon={mdiGrid}
                label={labels.controls.graticule}
                tip={tip}
                shortcut={keys.graticule}
                active={graticule.visible}
                onClick={graticule.toggle}
              />
            )}
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

      {/* Mode piéton : comme la bascule 3D ↔ plan, c'est le choix de CE QU'ON REGARDE (du ciel
          ou de la rue), pas une manière de le regarder — et il porte un état actif. Le groupe
          n'existe pas hors 3D photoréaliste externe : le mode n'y a rien à parcourir. */}
      {slot(
        'pedestrian',
        showPedestrian && (
          <div className="m3d-controls-group">
            <ToolButton
              icon={mdiWalk}
              label={inPedestrian ? labels.controls.pedestrianExit : labels.controls.pedestrian}
              tip={tip}
              shortcut={keys.pedestrian}
              active={inPedestrian}
              onClick={() => (inPedestrian ? pedestrian.exit() : pedestrian.enterPlacement())}
            />
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

      {/* « Couches », « Catalogue » et « Templates » dans le MÊME groupe : filtrer par
          tag, parcourir un référentiel et rappeler une sauvegarde sont la gestion du
          contenu de la carte, réunie en une carte. Chacun garde son propre bouton +
          flyout (ancré, dismiss), et l'exclusivité de `Dropdown` fait qu'un seul
          s'ouvre à la fois. `<CatalogControl>` ne rend rien sans source déclarée. */}
      {slot(
        'layers',
        (btn('layers') || btn('catalog') || templates) && (
          <div className="m3d-controls-group">
            {btn('layers') && (
              <TagFilterControl grouped position={position} tipId={TIP_ID} shortcut={keys.layers} tagLabel={tagLabel} />
            )}
            {btn('catalog') && <CatalogControl grouped position={position} tipId={TIP_ID} shortcut={keys.catalog} />}
            {templates && <TemplatesPanel grouped {...templates} position={position} tipId={TIP_ID} />}
          </div>
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
