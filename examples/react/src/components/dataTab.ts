import type { LatLng, MarkerData } from 'map3d'
import type { FolderApi, TabPageApi } from 'tweakpane'

import { STATUS_LABEL, clusterTypeLabel } from '../config/labels'
import { assignDraft, cloneDraft } from '../config/draft'
import { type AgentStatus, type AnyData, type Severity, isAgentMarker, isDefibMarker } from '../data/types'
import { type DataSettings, type DemoScene, type MarkerPatch, defaultDataSettings } from '../hooks/useDemoScene'

/* ══════════════════ ONGLET « DATA » ══════════════════
   Trois choses, dans cet ordre : de quoi la scène est faite (jeux), ce qu'on fait de
   l'élément visé (sélection), et de quoi la modifier à la main (scène).

   Le panneau tient un BROUILLON mutable (`draft`) que Tweakpane binde directement, et
   n'émet vers React qu'une COPIE à chaque changement. Binder l'état React lui-même
   reviendrait à le muter en place : ni re-render, ni recomposition de la scène. */

export type DataTabContext = {
  data: DataSettings
  onDataChange: (next: DataSettings) => void
  scene: DemoScene
  /** Sélection courante de la carte, ou `undefined`. */
  selected: MarkerData<AnyData> | undefined
  onSelect: (id: string | undefined) => void
  /** Centre de la vue — cible de « poser une alerte ». `null` si la carte n'est pas prête. */
  centerOfView: () => LatLng | null
}

/**
 * L'onglet lit le contexte du DERNIER render, jamais celui figé à sa construction.
 *
 * `ConfigPane` lui passe directement sa `propsRef` : `ConfigPaneProps` contient ces
 * champs, donc l'assignation est structurelle et il n'y a rien à recomposer.
 */
type ContextRef = { readonly current: DataTabContext }

/* Libellés PRIS aux tables métier de la démo plutôt que réécrits : `STATUS_LABEL` et
   le registre de types sont déjà ce que lisent les infobulles, les parts de cluster et
   la barre de relations. Les réécrire ici avait déjà produit deux noms pour la même
   chose — « sur place » dans le panneau, « Sur site » partout ailleurs.

   Tweakpane affiche la CLÉ et écrit la VALEUR : les tables sont donc inversées. */
const invert = <V extends string>(entries: readonly (readonly [V, string])[]): Record<string, V> =>
  Object.fromEntries(entries.map(([value, label]) => [label, value]))

const SEVERITIES: Record<string, Severity> = invert(
  (['critical', 'high', 'medium', 'low'] as const).map((s) => [s, clusterTypeLabel(`alert-${s}`)] as const),
)

const STATUSES: Record<string, AgentStatus> = invert(Object.entries(STATUS_LABEL) as [AgentStatus, string][])

/** Le modèle bindé de la sélection : à plat, parce que Tweakpane binde des scalaires. */
type SelectionModel = {
  id: string
  type: string
  title: string
  lat: number
  lng: number
  severity: string
  status: string
  urgent: boolean
  new: boolean
}

const EMPTY_SELECTION: SelectionModel = {
  id: '—',
  type: '—',
  title: '',
  lat: 0,
  lng: 0,
  severity: 'medium',
  status: 'available',
  urgent: false,
  new: false,
}

function readSelection(marker: MarkerData<AnyData> | undefined): SelectionModel {
  if (!marker) return { ...EMPTY_SELECTION }
  const data = marker.data
  return {
    id: String(marker.id),
    type: marker.type,
    title: marker.title ?? '',
    lat: marker.position.lat,
    lng: marker.position.lng,
    severity: data && 'severity' in data ? data.severity : EMPTY_SELECTION.severity,
    status: data && 'status' in data ? data.status : EMPTY_SELECTION.status,
    urgent: marker.urgent === true,
    new: marker.new === true,
  }
}

/** Construit l'onglet. Renvoie de quoi lui répercuter une sélection venue de la CARTE. */
export function buildDataTab(page: TabPageApi, ctxRef: ContextRef, refresh: () => void): { sync: () => void } {
  const draft = cloneDraft(ctxRef.current.data)
  const emit = () => ctxRef.current.onDataChange(cloneDraft(draft))

  // ── ① Jeux ────────────────────────────────────────────────────────────────
  const sets = page.addFolder({ title: 'Jeux de données' })

  /** Un jeu = une bascule + un effectif. Au-delà du relevé, `data/generate` prolonge. */
  const countable = (folder: FolderApi, group: 'alerts' | 'agents' | 'defibs', max: number) => {
    folder.addBinding(draft[group], 'enabled', { label: 'afficher' }).on('change', emit)
    folder
      .addBinding(draft[group], 'count', {
        label: `nombre (${defaultDataSettings[group].count} relevés)`,
        min: 0,
        max,
        step: 1,
      })
      .on('change', emit)
  }

  const alerts = sets.addFolder({ title: 'Alertes', expanded: true })
  countable(alerts, 'alerts', 2000)

  const agents = sets.addFolder({ title: 'Agents (temps réel)', expanded: true })
  countable(agents, 'agents', 500)
  agents.addBinding(draft.agents, 'tickMs', { label: 'cadence (ms)', min: 16, max: 2000, step: 10 }).on('change', emit)
  // `0` fige les agents sans couper le flux : le rendu continue de recevoir des
  // positions, ce qui n'est pas la même chose qu'un jeu statique.
  agents.addBinding(draft.agents, 'speedScale', { label: 'allure (×)', min: 0, max: 20, step: 0.1 }).on('change', emit)

  const defibs = sets.addFolder({ title: 'Défibrillateurs (décor)' })
  countable(defibs, 'defibs', 2000)

  const shapes = sets.addFolder({ title: 'Formes' })
  shapes.addBinding(draft.zones, 'enabled', { label: 'zones de ville' }).on('change', emit)
  shapes.addBinding(draft.buildings, 'enabled', { label: 'bâtiments' }).on('change', emit)
  shapes.addBinding(draft.volumes, 'enabled', { label: 'volumes' }).on('change', emit)
  shapes
    .addBinding(draft.volumes, 'height', { label: 'hauteur volume (m)', min: 0, max: 800, step: 10 })
    .on('change', emit)

  sets.addBlade({ view: 'separator' })
  sets.addButton({ title: 'Rétablir les effectifs' }).on('click', () => {
    assignDraft(draft, defaultDataSettings)
    refresh()
    emit()
  })

  page.addBlade({ view: 'separator' })

  // ── ② Sélection ───────────────────────────────────────────────────────────
  const selection = page.addFolder({ title: 'Élément sélectionné', expanded: true })
  const sel = readSelection(ctxRef.current.selected)

  /** Sans sélection, une retouche irait modifier le marker précédent. */
  const patch = (fields: MarkerPatch) => {
    const current = ctxRef.current.selected
    if (current) ctxRef.current.scene.patchMarker(String(current.id), fields)
  }

  // Identité en lecture seule, règle, puis ce qui se modifie : la séparation dit
  // d'un coup d'œil ce qui répond au clavier et ce qui ne fait que renseigner.
  selection.addBinding(sel, 'id', { label: 'id', readonly: true })
  selection.addBinding(sel, 'type', { label: 'type', readonly: true })
  selection.addBlade({ view: 'separator' })
  selection.addBinding(sel, 'title', { label: 'titre' }).on('change', () => patch({ title: sel.title }))
  // Pas de bornes : une position est un endroit du monde, pas un curseur. Le pas fin
  // (1e-5 ≈ 1 m) rend la molette utilisable pour ajuster sans tout retaper.
  const onMove = () => patch({ position: { lat: sel.lat, lng: sel.lng } })
  selection.addBinding(sel, 'lat', { label: 'latitude', step: 1e-5 }).on('change', onMove)
  selection.addBinding(sel, 'lng', { label: 'longitude', step: 1e-5 }).on('change', onMove)

  // Ces deux-là ne valent que pour une famille de markers : cachés plutôt que
  // désactivés pour les autres — un champ « sévérité » grisé sur un agent laisserait
  // croire qu'un agent en a une.
  const severity = selection.addBinding(sel, 'severity', { label: 'sévérité', options: SEVERITIES })
  // Tweakpane écrit la VALEUR de l'option choisie (pas son libellé) dans `sel.severity` :
  // c'est déjà une `Severity`, on la transmet telle quelle. La ré-indexer par SEVERITIES
  // (table libellé→valeur) donnait `undefined` → repli forcé sur 'medium', repeignant
  // toute sélection en `alert-medium`.
  severity.on('change', () => patch({ severity: sel.severity as Severity }))
  const status = selection.addBinding(sel, 'status', { label: 'statut', options: STATUSES })
  status.on('change', () => patch({ status: sel.status as AgentStatus }))

  selection.addBinding(sel, 'urgent', { label: 'urgent (viseur)' }).on('change', () => patch({ urgent: sel.urgent }))
  selection.addBinding(sel, 'new', { label: 'nouveau (sonar)' }).on('change', () => patch({ new: sel.new }))

  selection.addBlade({ view: 'separator' })
  const removeBtn = selection.addButton({ title: 'Supprimer de la scène' })
  removeBtn.on('click', () => {
    const current = ctxRef.current.selected
    if (!current) return
    ctxRef.current.scene.removeMarker(String(current.id))
    ctxRef.current.onSelect(undefined)
  })

  page.addBlade({ view: 'separator' })

  // ── ③ Scène ───────────────────────────────────────────────────────────────
  const scene = page.addFolder({ title: 'Scène' })
  // Une retouche ne se voit pas : un marker déplacé ressemble à un marker. Ce compteur
  // dit qu'on ne regarde plus la démo d'origine — et que le bouton du bas y ramène.
  const stats = { edits: 0 }
  scene.addBinding(stats, 'edits', { label: 'modifications', readonly: true })
  scene.addBlade({ view: 'separator' })
  const spawn = { severity: 'critical' }
  scene.addBinding(spawn, 'severity', { label: 'sévérité à poser', options: SEVERITIES })
  scene.addButton({ title: 'Poser une alerte au centre de la vue' }).on('click', () => {
    const center = ctxRef.current.centerOfView()
    if (!center) return
    const id = ctxRef.current.scene.addAlertAt(center, SEVERITIES[spawn.severity] ?? 'critical')
    // Sélectionnée d'office : ce qu'on vient de poser est ce qu'on veut retoucher.
    ctxRef.current.onSelect(id)
  })
  scene.addBlade({ view: 'separator' })
  scene.addButton({ title: 'Annuler ajouts, retraits et retouches' }).on('click', () => {
    ctxRef.current.scene.clearEdits()
    ctxRef.current.onSelect(undefined)
  })

  /** Rien n'a bougé si les neuf champs sont identiques — cf. `sync`. */
  const sameSelection = (a: SelectionModel, b: SelectionModel): boolean =>
    (Object.keys(a) as (keyof SelectionModel)[]).every((k) => a[k] === b[k])

  let lastData: DataSettings = ctxRef.current.data

  const sync = () => {
    const marker = ctxRef.current.selected
    const data = ctxRef.current.data
    const dataChanged = data !== lastData
    lastData = data
    // Les effectifs changent AUSSI depuis la barre d'outils de la démo (hauteur de
    // volume) : sans cette recopie, le brouillon du panneau afficherait l'ancienne.
    assignDraft(draft, data)
    const edits = ctxRef.current.scene.editCount
    const next = readSelection(marker)
    // Un agent SÉLECTIONNÉ est refabriqué à chaque tick du flux : son marker change
    // d'identité trois fois par seconde alors que ses champs, eux, sont le plus souvent
    // les mêmes. Repeindre la page à ce rythme pour réécrire des valeurs identiques est
    // le seul travail qu'on puisse ici supprimer entièrement.
    if (!dataChanged && edits === stats.edits && sameSelection(sel, next)) return
    stats.edits = edits
    Object.assign(sel, next)
    const isAgent = marker ? isAgentMarker(marker) : false
    // Le décor n'a ni sévérité ni statut : les deux listes disparaissent.
    const isDecor = marker ? isDefibMarker(marker) : false
    severity.hidden = !marker || isAgent || isDecor
    status.hidden = !isAgent
    removeBtn.disabled = !marker
    refresh()
  }
  // Premier passage FORCÉ : `sel` a été lue au montage, donc `sameSelection` serait vraie
  // et les visibilités ci-dessus ne seraient jamais posées.
  stats.edits = -1
  sync()

  return { sync }
}
