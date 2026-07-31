import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  EMPTY_COLLECTION,
  filterByCategories,
  mergeTemplateInto,
  namespaceTemplate,
  removeTemplateFrom,
  statsOf,
} from '../../core/templates/collect'
import type { TemplateProvider } from '../../core/templates/TemplateProvider'
import type {
  ApplyDefault,
  ApplyMode,
  Template,
  TemplateCategory,
  TemplateContent,
  TemplateView,
} from '../../core/templates/types'
import type { GeoJSONFeatureCollection } from '../../layers/DrawLayer'
import { applyView, captureView } from '../../core/templates/view'
import { useConfig, useLabels, useMapContext } from '../context'

/** Réglages du gestionnaire, tous optionnels (retombent sur `config.providers.templates`). */
export type UseTemplatesOptions = {
  /**
   * Backend des templates. Absent = cache localStorage seul. Présent = il fait
   * autorité : sa liste écrase la vue au montage, et les mutations passent par lui.
   */
  provider?: TemplateProvider
  /** Catégories offertes à la sauvegarde. */
  categories?: readonly TemplateCategory[]
  /** Catégories cochées par défaut. */
  defaultCategories?: readonly TemplateCategory[]
  /** Mode d'application par défaut. */
  defaultApply?: ApplyDefault
  /** Autorise l'export/import `.m3dt`. */
  allowExport?: boolean
  /** Offre la case « Vue » à la sauvegarde (cf. `TemplateView`). */
  saveView?: boolean
  /** Case « Vue » cochée d'avance. */
  defaultSaveView?: boolean
  /** Rejoue la vue d'un template à son chargement. */
  applyView?: boolean
  /** Durée (s) du trajet vers la vue chargée ; `0` = instantané. */
  viewFlyDuration?: number
}

/** Ce qu'une sauvegarde emporte en plus du dessin. */
export type SaveTemplateOptions = {
  /** Mémorise la vue courante (pose caméra, fond de carte, couches, piéton). */
  view?: boolean
}

/** Vue réactive + actions du gestionnaire de templates, consommée par `TemplatesPanel`. */
export type TemplatesView = {
  templates: readonly Template[]
  categories: readonly TemplateCategory[]
  defaultCategories: readonly TemplateCategory[]
  defaultApply: ApplyDefault
  allowExport: boolean
  /** La case « Vue » est-elle offerte au formulaire ? */
  saveView: boolean
  /** État initial de cette case. */
  defaultSaveView: boolean
  /** Une opération réseau (provider) est en cours. */
  busy: boolean
  saveCurrent: (name: string, cats: readonly TemplateCategory[], opts?: SaveTemplateOptions) => Promise<void>
  /**
   * Écrase le contenu d'un template existant par l'état courant (mise à jour) : le dessin
   * dans les catégories offertes, et la vue si `opts.view` — un template dont on veut
   * corriger le seul cadrage n'a pas à être supprimé puis recréé.
   */
  updateFromDrawing: (id: string, opts?: SaveTemplateOptions) => Promise<void>
  apply: (id: string, mode: ApplyMode) => void
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Recharge depuis le provider (no-op sans provider). */
  refresh: () => Promise<void>
  exportFile: (id: string) => void
  importFile: (file: File) => Promise<void>
}

const M3DT_FORMAT = 'm3dt'

/** Contenu d'un template — `view` n'est posée que si elle existe (pas de clé `undefined`
 *  dans le JSON sérialisé). Un 3ᵉ volet s'ajoute ici, pas dans les trois appelants. */
const contentOf = (draw: GeoJSONFeatureCollection, view?: TemplateView): TemplateContent =>
  view ? { draw, view } : { draw }

const newId = (): string => {
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  return g.crypto?.randomUUID?.() ?? `tpl-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Pilote `engine.templates` (registre versionné) et un éventuel `TemplateProvider`.
 * Le provider est tenu dans un ref (latest-ref pattern) : il est construit par
 * l'hôte avant la carte, ne doit pas re-déclencher les effets, et reçoit
 * `providers.templates` via `setConfig` à chaque changement de config.
 */
export function useTemplates(opts: UseTemplatesOptions = {}): TemplatesView {
  const { engine } = useMapContext()
  const reg = engine.templates
  const cfg = useConfig().providers.templates
  const labels = useLabels().templates
  const version = useSyncExternalStore(reg.on, () => reg.version)

  const providerRef = useRef<TemplateProvider | undefined>(opts.provider)
  providerRef.current = opts.provider
  const [busy, setBusy] = useState(false)

  const categories = opts.categories ?? cfg.categories
  const defaultCategories = opts.defaultCategories ?? cfg.defaultCategories
  const defaultApply = opts.defaultApply ?? cfg.defaultApply
  const allowExport = opts.allowExport ?? cfg.allowExport
  const saveView = opts.saveView ?? cfg.saveView
  const defaultSaveView = opts.defaultSaveView ?? cfg.defaultSaveView
  // Ref pour lire les catégories dans `updateFromDrawing` sans le recréer à chaque render.
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories
  // Même raison pour les réglages de vue, lus par `apply` : les mettre en dépendance
  // recréerait le callback (donc re-rendrait toutes les lignes) au moindre ajustement.
  const applyEnabled = opts.applyView ?? cfg.applyView
  const viewFlyDuration = opts.viewFlyDuration ?? cfg.viewFlyDuration
  const viewRef = useRef({ apply: applyEnabled, duration: viewFlyDuration })
  viewRef.current = { apply: applyEnabled, duration: viewFlyDuration }

  // Config transmise au provider (endpoints, en-têtes) à la première frame puis à
  // chaque changement — même contrat que `RoutingProvider.setConfig`.
  useEffect(() => {
    providerRef.current?.setConfig?.(cfg)
  }, [cfg])

  const refresh = useCallback(async () => {
    const provider = providerRef.current
    if (!provider) return
    setBusy(true)
    try {
      const remote = await provider.list()
      // La liste distante fait foi : elle écrase la vue (templates marqués `api`).
      reg.setAll(remote.map((t) => ({ ...t, origin: 'api' })))
    } finally {
      setBusy(false)
    }
  }, [reg])

  // Synchro initiale : dès qu'un provider est présent, sa liste prend la main sur le
  // localStorage (des templates d'autres utilisateurs ont pu être publiés).
  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveCurrent = useCallback(
    async (name: string, cats: readonly TemplateCategory[], saveOpts: SaveTemplateOptions = {}) => {
      // Dessin ABSENT ≠ échec : sans `<DrawLayer>` monté (ou sans catégorie cochée), il
      // reste une vue à mémoriser. Refuser ici rendait tout template de vue seule
      // impossible, alors que c'est justement le cas « un template par site ».
      const port = reg.drawPort
      const draw = port ? filterByCategories(port.toGeoJSON(), cats) : EMPTY_COLLECTION
      const now = Date.now()
      const provider = providerRef.current
      const base: Template = {
        id: newId(),
        name,
        origin: provider ? 'api' : 'local',
        content: contentOf(draw, saveOpts.view ? captureView(engine) : undefined),
        stats: statsOf(draw),
        createdAt: now,
        updatedAt: now,
      }
      if (provider) {
        setBusy(true)
        try {
          const saved = await provider.save(base)
          reg.save({ ...saved, origin: 'api' })
        } finally {
          setBusy(false)
        }
      } else {
        reg.save(base)
      }
    },
    [reg, engine],
  )

  const updateFromDrawing = useCallback(
    async (id: string, saveOpts: SaveTemplateOptions = {}) => {
      const port = reg.drawPort
      const current = reg.get(id)
      if (!current || current.readOnly) return
      // Recapture le dessin courant avec les catégories offertes (mêmes que la sauvegarde).
      // Sans couche de dessin, le contenu déjà enregistré est CONSERVÉ : une mise à jour ne
      // doit pas vider un dessin au prétexte qu'on ne peut pas le relire.
      const draw = port ? filterByCategories(port.toGeoJSON(), categoriesRef.current) : current.content.draw
      // Vue non demandée = celle déjà en place, pas une suppression : on met à jour ce qui
      // est coché, on n'efface pas ce qui ne l'est pas.
      const view = saveOpts.view ? captureView(engine) : current.content.view
      const next: Template = {
        ...current,
        content: contentOf(draw, view),
        // Sans couche de dessin, `draw` EST le contenu déjà enregistré : le re-mesurer
        // (parcours + `JSON.stringify` + encodage UTF-8 de tout le dessin) reproduirait
        // octet pour octet des stats qu'on a déjà.
        stats: port ? statsOf(draw) : current.stats,
        updatedAt: Date.now(),
      }
      const provider = providerRef.current
      if (provider && current.origin === 'api') {
        setBusy(true)
        try {
          const saved = await provider.update(id, { content: next.content, stats: next.stats })
          reg.save({ ...saved, origin: 'api' })
        } finally {
          setBusy(false)
        }
      } else {
        reg.save(next)
      }
    },
    [reg, engine],
  )

  const apply = useCallback(
    (id: string, mode: ApplyMode) => {
      const t = reg.get(id)
      if (!t) return
      // Le dessin ne se pose que s'il y a une couche pour l'accueillir ; la VUE s'applique
      // dans tous les cas — un template de site peut n'avoir aucune forme.
      const port = reg.drawPort
      const fc = t.content.draw
      // `fromGeoJSON` est le chemin d'import canonique (gère symbole/polygone/verrou).
      if (port) {
        if (mode === 'replace') {
          // Namespacé même en remplacement : « retirer » retrouve alors ces formes après
          // coup, quel que soit le mode par lequel le template a été chargé.
          port.fromGeoJSON(namespaceTemplate(fc, id))
        } else if (fc.features.length) {
          // Fusion et retrait partagent la clé namespacée (`templateId:featureId`) : la
          // fusion la pose, le retrait la reconnaît. D'où l'idempotence de l'un et la
          // précision de l'autre, sans correspondance géométrique approximative.
          // Template sans forme (une vue seule) : rien à fusionner ni à retirer, et les deux
          // sérialisations complètes du dessin courant seraient pour rien.
          const current = port.toGeoJSON()
          const next = mode === 'remove' ? removeTemplateFrom(current, fc, id) : mergeTemplateInto(current, fc, id)
          // Longueur inchangée = rien à poser. Un `return` ici coupait aussi la vue :
          // recliquer un template déjà chargé doit au moins y ramener la caméra.
          if (next.features.length !== current.features.length) port.fromGeoJSON(next)
        }
        // Un filtre de tags actif masquerait les formes qu'on vient de poser si leurs tags
        // n'y figurent pas : on ajoute ces tags à la sélection pour que le template chargé
        // reste visible. « Retirer » ne pose rien — rien à révéler. Filtre inactif = tout
        // déjà visible, on n'en crée pas un.
        if (mode !== 'remove' && engine.tags.isActive) {
          const reveal = new Set<string>()
          for (const f of fc.features) for (const tag of f.properties.tags ?? []) reveal.add(tag)
          engine.tags.add(reveal)
        }
      }
      // « Retirer » ne déplace JAMAIS la carte : on enlève des formes, on ne visite pas.
      if (t.content.view && mode !== 'remove' && viewRef.current.apply) {
        applyView(engine, t.content.view, { duration: viewRef.current.duration })
      }
      reg.notifyApply(id, mode)
    },
    [reg, engine],
  )

  const rename = useCallback(
    async (id: string, name: string) => {
      const provider = providerRef.current
      if (provider) {
        setBusy(true)
        try {
          const saved = await provider.update(id, { name })
          reg.save({ ...saved, origin: 'api' })
        } finally {
          setBusy(false)
        }
      } else {
        reg.rename(id, name)
      }
    },
    [reg],
  )

  const remove = useCallback(
    async (id: string) => {
      const provider = providerRef.current
      if (provider) {
        setBusy(true)
        try {
          await provider.remove(id)
          reg.remove(id)
        } finally {
          setBusy(false)
        }
      } else {
        reg.remove(id)
      }
    },
    [reg],
  )

  const exportFile = useCallback(
    (id: string) => {
      const t = reg.get(id)
      if (!t) return
      const blob = new Blob([JSON.stringify({ format: M3DT_FORMAT, version: 1, template: t }, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${t.name || labels.defaultName}.m3dt`
      a.click()
      URL.revokeObjectURL(url)
    },
    [reg, labels.defaultName],
  )

  const importFile = useCallback(
    async (file: File) => {
      const parsed = JSON.parse(await file.text()) as { format?: string; template?: Template }
      if (parsed.format !== M3DT_FORMAT || !parsed.template?.content) return
      // Un fichier de vue seule n'a pas de dessin : exiger `draw` rejetait tout template
      // de site. La collection vide est un contenu valide, pas un trou.
      const draw = parsed.template.content.draw ?? EMPTY_COLLECTION
      const view = parsed.template.content.view
      const now = Date.now()
      // Importé = local : identité neuve pour ne pas percuter un id backend existant.
      reg.save({
        id: newId(),
        name: parsed.template.name || labels.importedName,
        origin: 'local',
        // La vue traverse l'import : sans ça, exporter puis réimporter un template de site
        // en perdait silencieusement tout l'intérêt.
        content: contentOf(draw, view),
        stats: statsOf(draw),
        createdAt: now,
        updatedAt: now,
      })
    },
    [reg, labels.importedName],
  )

  // `reg.list()` réalloue `[...values]` : ne le refaire que quand la version change
  // (le store ne réveille de toute façon le rendu que sur `version`). `version` est la
  // CLÉ d'invalidation, pas une valeur lue dans le corps — d'où le disable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const templates = useMemo(() => reg.list(), [reg, version])

  return {
    templates,
    categories,
    defaultCategories,
    defaultApply,
    allowExport,
    saveView,
    defaultSaveView,
    busy,
    saveCurrent,
    updateFromDrawing,
    apply,
    rename,
    remove,
    refresh,
    exportFile,
    importFile,
  }
}
