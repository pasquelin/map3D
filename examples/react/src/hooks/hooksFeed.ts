import type { TagEntry } from '@pasquelin/map3d'

/**
 * Ce que l'onglet « Hooks » du banc d'essai AFFICHE : des chaînes prêtes à lire, écrites
 * par `HooksBridge` (sous `<Map>`, seul endroit d'où les hooks de contexte atteignent le
 * moteur) et montrées par des contrôleurs Tweakpane en lecture seule.
 */
export type HooksModel = {
  camera: string
  altitude: string
  click: string
  viewport: string
  gate: string
  probe: string
  lens: string
  relations: string
}

/** Ce que l'onglet DÉCLENCHE : les commandes, posées par `HooksBridge` une fois monté. */
export type HooksActions = {
  fitMarkers: () => void
  zoomIn: () => void
  zoomOut: () => void
  capture: () => void
  probe: () => void
  fitDrawings: () => void
  toggleTag: (tag: string) => void
  clearTags: () => void
  toggleLens: (() => void) | null
  clearRelations: (() => void) | null
}

export type HooksFeed = {
  readonly model: HooksModel
  actions: HooksActions
  /** Tags du filtre « Couches », avec leur compte et leur état. */
  tags: readonly TagEntry[]
  selectedTags: ReadonlySet<string>
  /** Avertit l'onglet qu'une valeur a changé (il rafraîchit ses contrôleurs). */
  notify: () => void
  subscribe: (listener: () => void) => () => void
}

const NOOP = (): void => {}

/**
 * Pont entre le monde React (hooks) et le Tweakpane (impératif). Un seul objet, muté en
 * place : Tweakpane lit ses bindings par référence, un objet neuf le rendrait aveugle.
 */
export function createHooksFeed(): HooksFeed {
  const listeners = new Set<() => void>()
  return {
    model: {
      camera: '— en attente d’un mouvement —',
      altitude: '',
      click: '—',
      viewport: '— en attente —',
      gate: '',
      probe: '',
      lens: '— loupe non montée —',
      relations: '— relations non montées —',
    },
    actions: {
      fitMarkers: NOOP,
      zoomIn: NOOP,
      zoomOut: NOOP,
      capture: NOOP,
      probe: NOOP,
      fitDrawings: NOOP,
      toggleTag: NOOP,
      clearTags: NOOP,
      toggleLens: null,
      clearRelations: null,
    },
    tags: [],
    selectedTags: new Set(),
    notify: () => {
      for (const l of listeners) l()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
