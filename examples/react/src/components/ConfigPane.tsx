import type { LatLng, MapEngine, MarkerData, PartialConfig } from '@pasquelin/map3d'
import { defaultConfig, mergeConfig } from '@pasquelin/map3d'
import { useEffect, useRef } from 'react'
import type { BindingParams, FolderApi, NumberInputParams, StringInputParams, TabPageApi } from 'tweakpane'
import { Pane } from 'tweakpane'

import {
  type ConfigNode,
  type FlatModel,
  type Leaf,
  UNSET,
  folderLabelOf,
  labelOf,
  autoRange,
  buildTree,
  encodeLeaf,
  flatFromConfig,
  flattenLeaves,
  partialFromFlat,
  storePartial,
  withLeaf,
} from '../config/configSchema'
import { assignDraft } from '../config/draft'
import { isRecord } from '../config/isRecord'
import type { MapPropsSettings } from '../config/mapProps'
import type { AnyData } from '../data/types'
import type { UiSettings } from '../config/uiSettings'
import type { DataSettings, DemoScene } from '../hooks/useDemoScene'
import { buildDataTab } from './dataTab'
import { buildPluginsTab } from '../config/pluginsTab'
import { type UiTabContext, buildUiTab } from './uiTab'

/**
 * Banc d'essai de la démo, en trois onglets.
 *
 * **Réglages** est le cœur : `MapConfig` en entier, manipulable en direct. Il n'énumère
 * aucun réglage — l'arborescence vient de `defaultConfig` (cf. `buildTree`), les bornes
 * du suffixe des noms, les libellés de `configLabels`, et `configSchema` ne fournit que
 * les exceptions. Une clé ajoutée à `MapConfig` apparaît donc ici d'elle-même, et un
 * test (`configLabels.test.ts`) échoue tant qu'elle n'a pas son libellé français.
 *
 * Ce que cet onglet émet est un `PartialConfig` MINIMAL (le seul écart aux défauts),
 * pas la config complète : la même forme que ce qu'une application colle dans
 * `config={{ … }}`, ce qui rend le bouton « copier » directement utile.
 *
 * **Carte** porte ce que `MapConfig` ne couvre PAS parce que ce sont des props de
 * `<Map>` : le clair/sombre (`colorScheme`), le fond, l'interactivité. **Interface**
 * découpe les surfaces montées par `<Map>`, jusqu'au bouton près. **Données**
 * compose la scène (cf. `dataTab`) — un réglage de clustering ou de cull ne se juge pas
 * sur quarante points.
 */

export type ConfigPaneProps = {
  /** Moteur capté à `ready` (cf. `onReady` dans `App.tsx`) — `null` avant. Pilote l'onglet
   * « Plugins », construit dans un effet séparé puisqu'il arrive après le montage du panneau. */
  engine: MapEngine | null
  /** Réglages du montage — ce que `partialFromFlat` a produit la fois précédente. */
  initial: PartialConfig
  /** Chaque modification de `MapConfig`, sous forme de `PartialConfig` minimal. */
  onChange: (config: PartialConfig) => void
  /** Remonte la carte : les réglages ❄ sont lus à la CONSTRUCTION du moteur. */
  onRemount: () => void
  mapProps: MapPropsSettings
  onMapPropsChange: (next: MapPropsSettings) => void
  data: DataSettings
  onDataChange: (next: DataSettings) => void
  ui: UiSettings
  onUiChange: (next: UiSettings) => void
  /** Cadrages de démo, repris du menu retiré de la barre d'outils. */
  camera: UiTabContext['camera']
  cityLabels: readonly string[]
  scene: DemoScene
  selected: MarkerData<AnyData> | undefined
  onSelect: (id: string | undefined) => void
  centerOfView: () => LatLng | null
}

type Container = Pane | FolderApi | TabPageApi

/** Largeur de la colonne. Locale : un export de valeur ici casserait le Fast Refresh. */
const PANE_WIDTH = 340

/** ❄ = ne prend effet qu'au remontage. 💰 = pèse sur la facture d'un fournisseur. */
function labelFor(leaf: Leaf): string {
  const flags = `${leaf.meta.cold ? '❄ ' : ''}${leaf.meta.billing ? '💰 ' : ''}`
  return flags + (leaf.meta.label ?? labelOf(leaf.path))
}

function paramsFor(leaf: Leaf): BindingParams {
  const label = labelFor(leaf)

  if (leaf.kind === 'boolean') return { label }

  if (leaf.kind === 'list' || leaf.kind === 'optionalList') {
    const params: StringInputParams = { label }
    // `UNSET` en tête : pour un champ optionnel, « ne rien écrire » est le défaut.
    params.options = leaf.kind === 'optionalList' ? { [UNSET]: UNSET, ...leaf.meta.options } : { ...leaf.meta.options }
    return params
  }

  if (leaf.kind === 'number') {
    const params: NumberInputParams = { label }
    // Bornes déduites du suffixe (`…Px`, `…Ms`, `…Meters`), que la table surcharge.
    // Sans l'une ni l'autre, Tweakpane rend un champ numérique libre — jamais un
    // slider dont les bornes seraient inventées.
    const auto = autoRange(leaf.path, typeof leaf.def === 'number' ? leaf.def : Number.NaN)
    const min = leaf.meta.min ?? auto?.min
    const max = leaf.meta.max ?? auto?.max
    const step = leaf.meta.step ?? auto?.step
    if (min !== undefined) params.min = min
    if (max !== undefined) params.max = max
    if (step !== undefined) params.step = step
    return params
  }

  return { label }
}

/**
 * Littéral TS plutôt que JSON strict : la sortie est faite pour être COLLÉE.
 *
 * Sérialisé en parcourant la valeur, et non par des `replace` sur le JSON : ces derniers
 * ne distinguaient pas une clé d'une chaîne qui lui ressemble, et laissaient passer sans
 * échappement une valeur contenant une apostrophe.
 */
function toSource(value: unknown, indent = '  '): string {
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  const inner = indent + '  '
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[${value.map((v) => toSource(v, inner)).join(', ')}]`
  }
  if (!isRecord(value)) return 'undefined'
  const entries = Object.entries(value)
  if (entries.length === 0) return '{}'
  // Une clé qui n'est pas un identifiant se garde entre quotes — sinon le littéral rendu
  // ne compile pas chez celui qui le colle.
  const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`)
  const body = entries.map(([k, v]) => `${inner}${key(k)}: ${toSource(v, inner)},`).join('\n')
  return `{\n${body}\n${indent}}`
}

export function ConfigPane(props: ConfigPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Latest ref : le panneau est monté UNE fois (il tient ses propres modèles), mais ses
  // callbacks doivent rester ceux du dernier render — cf. le motif documenté de la lib.
  const propsRef = useRef(props)
  propsRef.current = props
  // Deux poignées de resynchronisation, PAS une : les deux onglets ne se remettent pas à
  // jour pour les mêmes raisons, et les fondre en une seule faisait repeindre les ~55
  // contrôleurs de « Interface » à chaque changement de sélection — donc trois fois par
  // seconde dès qu'un agent était sélectionné, puisque le flux en refait l'objet.
  const syncUiRef = useRef<(() => void) | null>(null)
  const syncDataRef = useRef<(() => void) | null>(null)
  // L'onglet Plugins se construit à part (cf. l'effet ci-dessous) : `engine` n'existe
  // qu'après `ready`, alors que ce panneau est monté une seule fois, avant. La page
  // Tweakpane elle-même naît ici avec le reste — on la garde par ref pour cet autre effet.
  const pluginsPageRef = useRef<TabPageApi | null>(null)
  const syncPluginsRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const container = hostRef.current
    if (!container) return

    const pane = new Pane({ container, title: 'Map Config' })
    const tab = pane.addTab({
      pages: [
        { title: 'Carte' },
        { title: 'Interface' },
        { title: 'Réglages' },
        { title: 'Données' },
        { title: 'Plugins' },
      ],
    })
    const [mapPage, uiPage, configPage, dataPage, pluginsPage] = tab.pages
    if (!mapPage || !uiPage || !configPage || !dataPage || !pluginsPage) return
    pluginsPageRef.current = pluginsPage

    // ── Onglet « Carte » : les props de `<Map>` hors `MapConfig` ────────────────
    const mapDraft: MapPropsSettings = { ...propsRef.current.mapProps }
    const emitMapProps = () => propsRef.current.onMapPropsChange({ ...mapDraft })

    mapPage
      .addBinding(mapDraft, 'colorScheme', {
        label: 'thème',
        options: { auto: 'auto', sombre: 'dark', clair: 'light' },
      })
      .on('change', emitMapProps)
    mapPage
      .addBinding(mapDraft, 'interactive', {
        label: 'interaction',
        options: { interactive: 'true', 'vue figée': 'view', inerte: 'false' },
      })
      .on('change', emitMapProps)
    // Sous la règle : ce qui ne prend effet qu'au remontage. La frontière est réelle,
    // elle mérite d'être VUE plutôt que devinée au ❄ de chaque libellé.
    mapPage.addBlade({ view: 'separator' })
    mapPage
      .addBinding(mapDraft, 'mapMode', { label: 'fond', options: { 'plan 2D': 'plan', '3D photo': '3d' } })
      .on('change', emitMapProps)
    mapPage.addBinding(mapDraft, 'fallbackGlobe', { label: '❄ globe de repli' }).on('change', emitMapProps)
    mapPage.addBinding(mapDraft, 'intro', { label: '❄ vol d’intro' }).on('change', emitMapProps)
    mapPage
      .addBinding(mapDraft, 'errorTarget', { label: '❄ erreur cible', min: 1, max: 64, step: 1 })
      .on('change', emitMapProps)
    mapPage.addBinding(mapDraft, 'rememberPosition', { label: '❄ mémoriser la position' }).on('change', emitMapProps)
    mapPage.addBinding(mapDraft, 'resetStoredPosition', { label: '❄ oublier la position' }).on('change', emitMapProps)
    mapPage.addBlade({ view: 'separator' })
    mapPage.addButton({ title: '⟳ Recharger la carte (réglages ❄)' }).on('click', () => propsRef.current.onRemount())

    // Ces props changent aussi depuis l'extérieur du panneau : le brouillon se recopie
    // EN PLACE (cf. `assignDraft`), sans quoi les contrôleurs continueraient d'écrire
    // dans un objet que plus personne ne lit.
    const syncMapPage = () => {
      assignDraft(mapDraft, propsRef.current.mapProps)
      mapPage.refresh()
    }

    // ── Onglet « Config » : `MapConfig` en entier ───────────────────────────────
    const tree = buildTree()
    const leaves = flattenLeaves(tree)
    // `mergeConfig` fait exactement ce qu'on veut ici — défauts complétés par le
    // partiel stocké — et c'est la MÊME fonction que la lib applique à la prop
    // `config`. Le modèle part donc de ce que la carte affiche réellement.
    const flat: FlatModel = flatFromConfig(leaves, mergeConfig(defaultConfig, propsRef.current.initial))

    /**
     * Le partiel COURANT, tenu de façon incrémentale.
     *
     * Le reconstruire entièrement à chaque `pointermove` d'un slider coûtait 199
     * décodages et autant de comparaisons structurelles par frame — sur le thread qui
     * rend la 3D, c'est-à-dire en faussant la fluidité qu'on est justement en train de
     * juger. Une feuille qui bouge n'en change qu'une : `withLeaf` ne recopie que son
     * chemin (cf. `configSchema`).
     */
    let partial = partialFromFlat(leaves, flat)

    /**
     * `last` distingue la fin d'un geste de son déroulé : la carte suit en direct (on
     * règle POUR voir), mais l'écriture `localStorage` est synchrone sur ce même thread —
     * l'appeler à chaque `pointermove`, c'est ~60 écritures par seconde.
     *
     * `leaf` absente = recomposition complète (réinitialisation d'une section ou de tout).
     */
    const push = (last = true, leaf?: Leaf) => {
      partial = leaf ? withLeaf(partial, leaf, flat[leaf.path]) : partialFromFlat(leaves, flat)
      if (last) storePartial(partial)
      propsRef.current.onChange(partial)
    }

    /** `prefix` absent = tout ; sinon la section de premier niveau. */
    const reset = (prefix?: string) => {
      for (const leaf of leaves) {
        if (prefix !== undefined && !leaf.path.startsWith(`${prefix}.`)) continue
        flat[leaf.path] = encodeLeaf(leaf, leaf.def ?? leaf.meta.extra)
      }
      pane.refresh()
      push()
    }

    // Actions en tête : elles doivent rester atteignables sans dérouler 200 champs.
    const actions = configPage.addFolder({ title: 'Actions' })

    const COPY_TITLE = 'Copier le PartialConfig'
    const copy = actions.addButton({ title: COPY_TITLE })
    // Le retour au libellé d'origine est annulé au démontage : sans cela, un panneau
    // disposé dans la seconde qui suit une copie se voyait réécrire son titre.
    let copyTimer: number | undefined
    copy.on('click', () => {
      const source = `config={${toSource(partial)}}`
      void navigator.clipboard.writeText(source).then(
        () => {
          copy.title = 'Copié ✓'
          window.clearTimeout(copyTimer)
          copyTimer = window.setTimeout(() => (copy.title = COPY_TITLE), 1200)
        },
        () => console.log('[config] presse-papier refusé — voici le réglage :\n' + source),
      )
    })

    actions.addButton({ title: 'Tout réinitialiser' }).on('click', () => reset())

    configPage.addBlade({ view: 'separator' })

    // Les 9 sections de `MapConfig`, dans leur ordre de déclaration.
    const addNodes = (parent: Container, nodes: readonly ConfigNode[], depth: number) => {
      for (const node of nodes) {
        if (node.kind === 'leaf') {
          // Un écouteur PAR contrôleur, et non un `pane.on('change')` global : celui-ci
          // se déclencherait aussi pour les onglets Carte et Data, qui n'ont rien à voir
          // avec `flat` — et rejouerait un merge de config à chaque clic.
          const { leaf } = node
          parent.addBinding(flat, leaf.path, paramsFor(leaf)).on('change', (ev) => push(ev.last, leaf))
          continue
        }
        const folder = parent.addFolder({ title: folderLabelOf(node.path), expanded: false })
        if (depth === 0) {
          folder.addButton({ title: 'Réinitialiser la section' }).on('click', () => reset(node.path))
          folder.addBlade({ view: 'separator' })
        }
        addNodes(folder, node.children, depth + 1)
        // Une règle entre deux sections de premier niveau : replié, le panneau n'est
        // qu'une pile de titres, et neuf d'affilée se lisent comme un seul bloc.
        if (depth === 0) parent.addBlade({ view: 'separator' })
      }
    }
    addNodes(configPage, tree, 0)

    /**
     * Raccourci « Mode piéton » sur l'onglet Carte.
     *
     * Ce sont les MÊMES feuilles que dans « Réglages », pas une copie : les deux
     * contrôleurs écrivent dans `flat`, ils ne peuvent donc pas diverger. Ces trois-là se
     * règlent EN MARCHANT, et les chercher parmi deux cents champs repliés cassait le geste.
     *
     * Pas dans `uiTab` malgré l'apparence : cet onglet possède `UiSettings` (les surfaces
     * de `<Map>`) et ignore `MapConfig` — y brancher de la config y dupliquerait l'état.
     */
    const PEDESTRIAN_SHORTCUTS = ['pedestrian.walkSpeed', 'pedestrian.sprintFactor', 'pedestrian.eyeHeightMeters']
    const walkFolder = mapPage.addFolder({ title: 'Mode piéton', expanded: true })
    for (const path of PEDESTRIAN_SHORTCUTS) {
      const leaf = leaves.find((l) => l.path === path)
      if (!leaf) continue
      walkFolder.addBinding(flat, leaf.path, paramsFor(leaf)).on('change', (ev) => {
        push(ev.last, leaf)
        // Le jumeau dans « Réglages » doit suivre — mais à la FIN du geste seulement :
        // rafraîchir la page à chaque `pointermove` repeindrait ses ~200 contrôleurs sur
        // le thread qui rend la 3D, c'est-à-dire en faussant la fluidité qu'on juge.
        if (ev.last) configPage.refresh()
      })
    }

    // ── Onglets « Interface » et « Données » ────────────────────────────────────
    // `propsRef` EST le contexte des deux onglets : `ConfigPaneProps` contient déjà
    // leurs champs, et c'est lui qui porte le dernier render. Un getter qui en
    // recomposait un sous-ensemble n'ajoutait qu'une allocation par lecture.
    //
    // Le refresh est celui de la PAGE, pas du panneau : rafraîchir tout le pane
    // repeindrait aussi les ~200 contrôleurs de l'onglet « Réglages », qui n'ont pas
    // bougé — deux fois par tick dès qu'un agent est sélectionné.
    const uiTab = buildUiTab(uiPage, propsRef, () => uiPage.refresh())
    const dataTab = buildDataTab(dataPage, propsRef, () => dataPage.refresh())

    // La sélection et l'interactivité changent AUSSI depuis la carte (clic sur un
    // marker, bouton de la barre d'outils) : le panneau doit alors se remettre à jour.
    syncUiRef.current = () => {
      syncMapPage()
      uiTab.sync()
    }
    syncDataRef.current = dataTab.sync

    return () => {
      syncUiRef.current = null
      syncDataRef.current = null
      pluginsPageRef.current = null
      window.clearTimeout(copyTimer)
      pane.dispose()
    }
  }, [])

  // Onglet Plugins : à part, parce que `engine` (capté à `ready` dans `App.tsx`) arrive
  // après le montage — jamais dans l'effet `[]` ci-dessus. Un remontage de la carte
  // (bouton ❄) fait aussi arriver un NOUVEL `engine` : on vide d'abord la page des
  // folders du tour précédent, sans quoi ils s'empileraient à chaque remontage.
  useEffect(() => {
    const page = pluginsPageRef.current
    const engine = props.engine
    if (!engine || !page) return

    const pluginsTab = buildPluginsTab(page, engine)
    syncPluginsRef.current = pluginsTab.sync
    // Resync quand le hub in-map (dans la carte) toggle/règle un plugin : les deux
    // surfaces partagent le même registre, elles doivent donc rester en phase.
    const off = engine.plugins.on(() => syncPluginsRef.current?.())

    return () => {
      off()
      syncPluginsRef.current = null
      for (const child of [...page.children]) child.dispose()
    }
  }, [props.engine])

  // Déclarés APRÈS l'effet de montage : les effets s'exécutent dans l'ordre, donc les
  // deux refs sont déjà renseignées au premier passage.
  //
  // Chaque onglet suit SES sources, et elles ne se recouvrent pas : les surfaces
  // d'interface ne bougent pas parce qu'un agent a été sélectionné, et la fiche de
  // sélection ne bouge pas parce qu'on a masqué un bouton de la barre.
  useEffect(() => {
    syncUiRef.current?.()
  }, [props.ui, props.mapProps])

  useEffect(() => {
    syncDataRef.current?.()
  }, [props.selected, props.data, props.scene.editCount])

  return (
    <div
      ref={hostRef}
      // Le panneau est une région à part entière, et Tweakpane n'y met aucun repère : un
      // lecteur d'écran traverserait sinon ~270 contrôleurs sans jamais savoir qu'il a
      // quitté la carte.
      role="region"
      aria-label="Banc de réglages de la carte"
      style={{
        // Colonne à côté de la carte, pas un flottant AU-DESSUS d'elle : le panneau ne
        // masque donc aucune surface (recherche à gauche, contrôles à droite, barre en
        // bas) et n'a pas à se battre avec l'échelle de `style.zIndex`.
        flex: `0 0 ${PANE_WIDTH}px`,
        height: '100%',
        overflowY: 'auto',
        padding: '6px',
        // Le fond de Tweakpane s'arrête à ses blocs : sans lui, la colonne laisserait
        // voir la page sous les 200 contrôleurs. La variable est redéfinie par schéma
        // (cf. `index.html`), donc la colonne suit le clair/sombre comme la carte.
        background: 'var(--tp-base-background-color)',
      }}
    />
  )
}
