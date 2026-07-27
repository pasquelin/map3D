import type { LatLng, MarkerData, ShapeData } from 'map3d'
import { useCallback, useMemo, useRef, useState } from 'react'

import { typeColor } from '../config/colors'
import { ROSTER_SIZE, TICK_MS, agentTags } from '../data/agents'
import { ALERTS } from '../data/alerts'
import { DEFIBS } from '../data/defibs'
import { MANUAL_ID_BASE, manualAlert, syntheticAlerts, syntheticDefibs } from '../data/generate'
import { BUILDINGS, DEMO_SHAPES, demoVolumes } from '../data/shapes'
import { type AgentStatus, type AnyData, type Severity, isAgentMarker } from '../data/types'
import { useAgentMarkers } from './useAgentMarkers'

/* ══════════════════ LA SCÈNE DE DÉMO, PILOTABLE ══════════════════
   Les jeux de `data/` sont des constantes : c'est ce qu'on veut d'une démo, elle
   montre toujours la même chose. Mais un banc d'essai de `MapConfig` a besoin du
   contraire — un rayon de clustering, une marge de cull ou un budget de raycasts ne
   se jugent pas sur quarante points, et un seuil `staticMinZoom` ne se juge pas sans
   pouvoir couper le décor.

   Ce hook ne remplace donc pas les jeux relevés : il les tronque, les prolonge
   (cf. `data/generate`), les éteint, et applique par-dessus les retouches faites à la
   main. Les constantes, elles, restent la source. */

export type DataSettings = {
  alerts: { enabled: boolean; count: number }
  agents: { enabled: boolean; count: number; tickMs: number; speedScale: number }
  defibs: { enabled: boolean; count: number }
  zones: { enabled: boolean }
  buildings: { enabled: boolean }
  volumes: { enabled: boolean; height: number }
}

/** Les effectifs relevés — l'état « démo d'origine », auquel « réinitialiser » revient. */
export const defaultDataSettings: DataSettings = {
  alerts: { enabled: true, count: ALERTS.length },
  agents: { enabled: true, count: ROSTER_SIZE, tickMs: TICK_MS, speedScale: 1 },
  defibs: { enabled: true, count: DEFIBS.length },
  zones: { enabled: true },
  buildings: { enabled: true },
  volumes: { enabled: true, height: 200 },
}

/** Retouches applicables à un marker sélectionné, quel que soit son type. */
export type MarkerPatch = {
  title?: string
  position?: LatLng
  urgent?: boolean
  new?: boolean
  severity?: Severity
  status?: AgentStatus
}

export type DemoScene = {
  markers: MarkerData<AnyData>[]
  shapes: ShapeData[]
  /** Agents bruts — le menu « Assigner un agent » lit des noms, pas des markers. */
  agents: ReturnType<typeof useAgentMarkers>['agents']
  /** Retouche du marker `id`. Fusionnée avec les retouches précédentes. */
  patchMarker: (id: string, patch: MarkerPatch) => void
  /** Pose une alerte à `position` et renvoie son id (pour la sélectionner aussitôt). */
  addAlertAt: (position: LatLng, severity: Severity) => string
  removeMarker: (id: string) => void
  /** Oublie ajouts, suppressions et retouches — les effectifs, eux, ne bougent pas. */
  clearEdits: () => void
  /** Nombre de retouches en vigueur : le panneau l'affiche, sinon elles sont invisibles. */
  editCount: number
}

const ID = (m: MarkerData<AnyData>): string => String(m.id)

/** Défauts STABLES : un littéral dans la signature rendrait une référence neuve à chaque
 *  appel, qui alimenterait ensuite un `useMemo` et le ferait recalculer pour rien. */
const NO_PINNED: MarkerData<AnyData>[] = []
const NO_REMOVED: ReadonlySet<string> = new Set()

/**
 * Applique une retouche.
 *
 * `severity` et `status` ne sont pas de simples champs de données : ils commandent le
 * `type` du marker (donc sa couleur), ses tags (donc le filtre « Couches ») et
 * `selectedColor`. Les écrire dans `data` seul afficherait une alerte « critique »
 * avec la teinte de sa sévérité précédente.
 */
function applyPatch(marker: MarkerData<AnyData>, patch: MarkerPatch): MarkerData<AnyData> {
  const next: MarkerData<AnyData> = { ...marker }
  if (patch.title !== undefined) next.title = patch.title
  if (patch.position) next.position = patch.position
  if (patch.urgent !== undefined) next.urgent = patch.urgent
  if (patch.new !== undefined) next.new = patch.new

  if (patch.severity && next.data && 'severity' in next.data) {
    const data = { ...next.data, severity: patch.severity }
    next.data = data
    next.type = `alert-${patch.severity}`
    next.selectedColor = typeColor(next.type)
    next.tags = ['alert', patch.severity, data.city]
  }

  if (patch.status && isAgentMarker(next)) {
    const data = { ...next.data, status: patch.status }
    next.data = data
    next.type = `agent-${patch.status}`
    next.selectedColor = typeColor(next.type)
    next.tags = agentTags(data)
  }

  return next
}

/**
 * Compose la scène : jeux relevés tronqués ou prolongés, flux d'agents à l'effectif
 * demandé, puis ajouts, suppressions et retouches par-dessus.
 *
 * `pinned` reçoit les markers que l'application tient elle-même (le point éditable de
 * la démo) : ils traversent le même pipeline, donc ils se retouchent et se suppriment
 * comme les autres.
 */
export function useDemoScene(settings: DataSettings, pinned: MarkerData<AnyData>[] = NO_PINNED): DemoScene {
  const [patches, setPatches] = useState<Record<string, MarkerPatch>>({})
  const [added, setAdded] = useState<MarkerData<AnyData>[]>([])
  // Un `Set` et non un tableau : l'appartenance est testée pour CHAQUE marker à chaque
  // recomposition (jusqu'à 4 500, trois fois par seconde), et un tableau imposait d'en
  // reconstruire un `Set` à chaque fois.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(NO_REMOVED)

  const { agents, agentMarkers } = useAgentMarkers({
    count: settings.agents.enabled ? settings.agents.count : 0,
    tickMs: settings.agents.tickMs,
    speedScale: settings.agents.speedScale,
  })

  const alerts = useMemo(() => {
    if (!settings.alerts.enabled) return []
    const { count } = settings.alerts
    // Les points relevés d'abord : ils portent les cas de test (superpositions,
    // drapeaux). Tronquer par la fin garde ceux du début, jamais l'inverse.
    return count <= ALERTS.length ? ALERTS.slice(0, count) : [...ALERTS, ...syntheticAlerts(count - ALERTS.length)]
    // Dépendances PRIMITIVES et non `settings.alerts` : le panneau reconstruit les six
    // sous-objets de réglages à chaque évènement, donc bouger l'allure des agents
    // régénérerait ici des milliers d'alertes — soixante fois par seconde en glissé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.alerts.enabled, settings.alerts.count])

  const defibs = useMemo(() => {
    if (!settings.defibs.enabled) return []
    const { count } = settings.defibs
    return count <= DEFIBS.length ? DEFIBS.slice(0, count) : [...DEFIBS, ...syntheticDefibs(count - DEFIBS.length)]
    // Cf. `alerts` juste au-dessus : primitives, pas le sous-objet de réglages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.defibs.enabled, settings.defibs.count])

  const patchCount = Object.keys(patches).length

  const markers = useMemo(() => {
    const all: MarkerData<AnyData>[] = [...alerts, ...agentMarkers, ...defibs, ...pinned, ...added]
    // Cas nominal (aucune retouche) : on rend la concaténation telle quelle. Le filtre
    // et la projection ci-dessous coûtent deux parcours et un `String(id)` par marker,
    // trois fois par seconde — jusqu'à 4 500 markers au réglage haut.
    if (removed.size === 0 && Object.keys(patches).length === 0) return all
    return all
      .filter((m) => !removed.has(ID(m)))
      .map((m) => {
        const patch = patches[ID(m)]
        return patch ? applyPatch(m, patch) : m
      })
    // Le compte des retouches se relit ici plutôt que de venir de `patchCount` : ce
    // dernier DÉRIVE de `patches`, et le lister aurait ajouté une dépendance qui ne
    // couvre rien de plus que celle qu'elle double.
  }, [alerts, agentMarkers, defibs, pinned, added, removed, patches])

  const shapes = useMemo(
    () => [
      ...(settings.zones.enabled ? DEMO_SHAPES : []),
      ...(settings.buildings.enabled ? BUILDINGS : []),
      ...(settings.volumes.enabled ? demoVolumes(settings.volumes.height) : []),
    ],
    // Idem : un nouveau tableau de formes fait DÉTRUIRE et reconstruire toutes les
    // géométries THREE drapées (`DrapedLayer.rebuildAll`), raycasts d'ancrage compris.
    [settings.zones.enabled, settings.buildings.enabled, settings.volumes.enabled, settings.volumes.height],
  )

  const patchMarker = useCallback((id: string, patch: MarkerPatch) => {
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }, [])

  // Compteur en ref, pas dérivé de `added.length` : une suppression ferait retomber la
  // longueur sur un id déjà distribué, et deux markers porteraient la même identité.
  const nextManualId = useRef(MANUAL_ID_BASE)

  const addAlertAt = useCallback((position: LatLng, severity: Severity) => {
    const id = nextManualId.current++
    setAdded((prev) => [...prev, manualAlert(id, position, severity)])
    return String(id)
  }, [])

  const removeMarker = useCallback((id: string) => setRemoved((prev) => new Set(prev).add(id)), [])

  const clearEdits = useCallback(() => {
    setPatches({})
    setAdded([])
    setRemoved(NO_REMOVED)
  }, [])

  return {
    markers,
    shapes,
    agents,
    patchMarker,
    addAlertAt,
    removeMarker,
    clearEdits,
    editCount: patchCount + added.length + removed.size,
  }
}
