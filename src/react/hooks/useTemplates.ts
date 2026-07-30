import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  filterByCategories,
  mergeTemplateInto,
  namespaceTemplate,
  removeTemplateFrom,
  statsOf,
} from '../../core/templates/collect'
import type { TemplateProvider } from '../../core/templates/TemplateProvider'
import type { ApplyDefault, ApplyMode, Template, TemplateCategory } from '../../core/templates/types'
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
}

/** Vue réactive + actions du gestionnaire de templates, consommée par `TemplatesPanel`. */
export type TemplatesView = {
  templates: readonly Template[]
  categories: readonly TemplateCategory[]
  defaultCategories: readonly TemplateCategory[]
  defaultApply: ApplyDefault
  allowExport: boolean
  /** Une opération réseau (provider) est en cours. */
  busy: boolean
  saveCurrent: (name: string, cats: readonly TemplateCategory[]) => Promise<void>
  /** Écrase le contenu d'un template existant avec le dessin courant (mise à jour). */
  updateFromDrawing: (id: string) => Promise<void>
  apply: (id: string, mode: ApplyMode) => void
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Recharge depuis le provider (no-op sans provider). */
  refresh: () => Promise<void>
  exportFile: (id: string) => void
  importFile: (file: File) => Promise<void>
}

const M3DT_FORMAT = 'm3dt'

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
  // Ref pour lire les catégories dans `updateFromDrawing` sans le recréer à chaque render.
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories

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
    async (name: string, cats: readonly TemplateCategory[]) => {
      const port = reg.drawPort
      if (!port) return
      const draw = filterByCategories(port.toGeoJSON(), cats)
      const now = Date.now()
      const provider = providerRef.current
      const base: Template = {
        id: newId(),
        name,
        origin: provider ? 'api' : 'local',
        content: { draw },
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
    [reg],
  )

  const updateFromDrawing = useCallback(
    async (id: string) => {
      const port = reg.drawPort
      const current = reg.get(id)
      if (!port || !current || current.readOnly) return
      // Recapture le dessin courant avec les catégories offertes (mêmes que la sauvegarde).
      const draw = filterByCategories(port.toGeoJSON(), categoriesRef.current)
      const next: Template = { ...current, content: { draw }, stats: statsOf(draw), updatedAt: Date.now() }
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
    [reg],
  )

  const apply = useCallback(
    (id: string, mode: ApplyMode) => {
      const port = reg.drawPort
      const t = reg.get(id)
      if (!port || !t) return
      const fc = t.content.draw
      // `fromGeoJSON` est le chemin d'import canonique (gère symbole/polygone/verrou).
      if (mode === 'replace') {
        // Namespacé même en remplacement : « retirer » retrouve alors ces formes après
        // coup, quel que soit le mode par lequel le template a été chargé.
        port.fromGeoJSON(namespaceTemplate(fc, id))
      } else {
        // Fusion et retrait partagent la clé namespacée (`templateId:featureId`) : la
        // fusion la pose, le retrait la reconnaît. D'où l'idempotence de l'un et la
        // précision de l'autre, sans correspondance géométrique approximative.
        const current = port.toGeoJSON()
        const next = mode === 'remove' ? removeTemplateFrom(current, fc, id) : mergeTemplateInto(current, fc, id)
        if (next.features.length === current.features.length) return // rien à changer
        port.fromGeoJSON(next)
      }
      reg.notifyApply(id, mode)
    },
    [reg],
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
      if (parsed.format !== M3DT_FORMAT || !parsed.template?.content?.draw) return
      const draw = parsed.template.content.draw
      const now = Date.now()
      // Importé = local : identité neuve pour ne pas percuter un id backend existant.
      reg.save({
        id: newId(),
        name: parsed.template.name || labels.importedName,
        origin: 'local',
        content: { draw },
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
