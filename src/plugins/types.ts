/**
 * Schéma de configuration déclaratif d'un plugin (D4). map3D en rend les contrôles
 * à l'identique dans le hub (lib) et le dev panel (exemple) — l'auteur n'écrit aucun
 * formulaire. Le schéma est la SEULE source des valeurs par défaut.
 */
export type PluginFieldBase = {
  /** Clé stable dans l'objet de config (identifiant TS). */
  key: string
  /** Libellé affiché (hub + dev panel). Donnée fournie par le plugin, pas i18n de la lib. */
  label: string
  /** Aide courte optionnelle (tooltip du contrôle). */
  help?: string
  /**
   * Ce champ influe sur la DONNÉE : le modifier relance `data.fetch`. Défaut `false`
   * = champ purement visuel → pas de refetch (cf. perf : pas d'appel API pour un
   * réglage cosmétique).
   */
  refetch?: boolean
}

export type PluginField =
  | (PluginFieldBase & { type: 'boolean'; default: boolean })
  | (PluginFieldBase & { type: 'number'; default: number; min?: number; max?: number; step?: number })
  | (PluginFieldBase & { type: 'string'; default: string; secret?: boolean; placeholder?: string })
  | (PluginFieldBase & { type: 'select'; default: string; options: Record<string, string> })

/** Valeurs de config inférées depuis le schéma (mapping type → valeur). */
export type PluginConfigOf<S extends readonly PluginField[]> = {
  [F in S[number] as F['key']]: F extends { type: 'boolean' } ? boolean : F extends { type: 'number' } ? number : string
}

import type { FetchPolicy } from '../config/types'
import type { MapEngine } from '../core/MapEngine'
import type { BuildingHit } from '../core/MapEngine'
import type { Layer } from '../core/Layer'
import type { MarkerData } from '../data/types'
import type { Viewport } from '../data/types'
import type { MenuItem } from '../react/components/ContextMenu'
import type { MarkerLayerProps } from '../react/components/MarkerLayer'

/** Contexte de base passé au plugin. `fetchPolicy` : à utiliser avec `fetchWithPolicy`. */
export type PluginContext<C> = {
  engine: MapEngine
  /** Config courante, typée, résolue (défauts ⊕ overrides). */
  config: C
  /** Annulé à la désactivation / au démontage / au changement de champ `refetch`. */
  signal: AbortSignal
  /** Politique réseau résolue (défaut plateforme ⊕ `data.fetchPolicy`). */
  fetchPolicy: FetchPolicy
}

export type PluginDataContext<C> = PluginContext<C> & {
  /** Vue courante — `{ bounds, center, zoom }`. */
  viewport: Viewport
}

export type PluginLayerContext<C> = PluginContext<C>

/** Résultat d'un enrichisseur au pick : attributs + tags de provenance (défaut `[plugin.meta.id]`). */
export type BuildingEnrichmentResult = { attrs: Record<string, unknown>; tags?: string[] }

/**
 * Définition d'un plugin. Un plugin déclare, map3D exécute et câble. Il DOIT fournir au
 * moins un de `data`, `layer`, `enrichBuilding`, `setup`.
 */
export type Plugin<C = Record<string, never>> = {
  meta: {
    /** Namespace unique (config, persistance, tag « Couches »). */
    id: string
    name: string
    description?: string
    /** Chemin d'icône `@mdi/js`. */
    icon: string
    version: string
    author?: string
    homepage?: string
  }

  /** Schéma de config déclaratif (D4). Absent = plugin sans réglage. */
  config?: readonly PluginField[]

  /** Activé au premier montage si l'utilisateur n'a jamais choisi (défaut `false`). */
  enabledByDefault?: boolean

  // ── Voie A — déclarative (markers viewport) ──
  data?: {
    fetch: (ctx: PluginDataContext<C>) => Promise<MarkerData[]> | MarkerData[]
    /** `'viewport'` (défaut) rechargé au déplacement ; `{ intervalMs }` polling ; `'manual'`. */
    refresh?: 'viewport' | { intervalMs: number } | 'manual'
    /** Gate de zoom : sous ce zoom, pas de fetch. */
    minZoom?: number
    /** Surcharge de la politique réseau (timeout/retries/backoff). */
    fetchPolicy?: Partial<FetchPolicy>
  }

  /** Réglages de rendu passés à la `MarkerLayer` interne (voie A). */
  markerLayer?: {
    menu?: (p: MarkerData<unknown>) => MenuItem[]
    tooltip?: MarkerLayerProps<unknown>['tooltip']
    icon?: (p: MarkerData<unknown>) => string
    typeLabel?: (type: string) => string
    cluster?: { enabled: boolean }
    size?: number
  }

  // ── Voie C — échappatoire moteur (avancé) ──
  layer?: (ctx: PluginLayerContext<C>) => Layer

  // ── Voie « enrichir » — enrichissement au pick de bâtiment ──
  enrichBuilding?: (hit: BuildingHit, ctx: PluginContext<C>) => Promise<BuildingEnrichmentResult>

  // ── Cycle de vie optionnel (ressources globales) ──
  /** Appelé à l'activation ; retourne un teardown appelé à la désactivation. */
  setup?: (ctx: PluginContext<C>) => void | (() => void)
}

/**
 * Type effacé pour le registre hétérogène (chaque plugin a son propre `C`). `any` est
 * l'échappatoire assumée, comme la liste de `Layer` du moteur : `Plugin<C>` a `C` en
 * position contravariante (`ctx.config` passé AUX fonctions du plugin), donc non élargissable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPlugin = Plugin<any>
