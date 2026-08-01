import { defaultLabels } from '@pasquelin/map3d'
import type { FolderApi, TabPageApi } from 'tweakpane'

import { assignDraft, cloneDraft } from '../config/draft'
import { BUTTON_LABELS, GROUP_LABELS, SECTION_LABELS, SELECT_MODE_LABELS } from '../config/uiLabels'
import {
  CONTROL_BUTTONS,
  CONTROL_GROUPS,
  DRAW_TOOLS,
  SELECT_MODES,
  TOOLBAR_SECTIONS,
  type UiSettings,
  defaultUiSettings,
} from '../config/uiSettings'

/* ══════════════════ ONGLET « INTERFACE » ══════════════════
   Les surfaces que `<Map>` monte, du grain le plus gros (la barre existe-t-elle ?) au
   plus fin (ce bouton précis est-il là ?). C'est ce qui remplace le menu « banc de
   test » qui vivait DANS la barre d'outils : régler la barre depuis un bouton de cette
   même barre revenait à scier la branche — la retirer retirait son propre réglage. */

export type UiTabContext = {
  ui: UiSettings
  onUiChange: (next: UiSettings) => void
  /** Vols de cadrage, repris du menu de démo retiré de la barre. */
  camera: {
    flyToCity: (index: number) => void
    fitAlerts: () => void
    fitZones: () => void
    recenter: () => void
    setZoom: (zoom: number) => void
  }
  /** Villes proposées, dans l'ordre de `CITY_LIST`. */
  cityLabels: readonly string[]
}

/** Cf. `dataTab` : `ConfigPane` passe sa `propsRef`, assignable par structure. */
type UiContextRef = { readonly current: UiTabContext }

export function buildUiTab(page: TabPageApi, ctxRef: UiContextRef, refresh: () => void): { sync: () => void } {
  const draft = cloneDraft(ctxRef.current.ui)
  const emit = () => ctxRef.current.onUiChange(cloneDraft(draft))

  /** Une case par clé, libellée en français. */
  const checkboxes = <K extends string>(
    folder: FolderApi,
    order: readonly K[],
    state: Record<K, boolean>,
    labels: Record<string, string>,
  ) => {
    for (const key of order) folder.addBinding(state, key, { label: labels[key] ?? key }).on('change', emit)
  }

  // La sonde `DrawDebug` consomme `useDrawing()` : sans couche de dessin, la monter
  // jette. Sa case est donc grisée avec elle plutôt que de rester cochable pour rien.
  // Déclaré AVANT les surfaces : la bascule « couche de dessin » l'appelle, et un
  // `const` défini plus bas ne serait qu'une TDZ en attente d'un déplacement d'appel.
  let debugToggle: { disabled: boolean } | null = null
  const syncDebugToggle = () => {
    if (debugToggle) debugToggle.disabled = !draft.draw
  }

  // ── ① Surfaces : présence, le grain le plus gros ───────────────────────────
  const surfaces = page.addFolder({ title: 'Surfaces', expanded: true })
  surfaces.addBinding(draft.toolbar, 'enabled', { label: 'barre d’outils' }).on('change', emit)
  surfaces.addBinding(draft.controls, 'enabled', { label: 'contrôles de navigation' }).on('change', emit)
  surfaces.addBinding(draft, 'search', { label: 'recherche' }).on('change', emit)
  surfaces.addBinding(draft.readout, 'enabled', { label: 'position de la caméra' }).on('change', emit)
  // Les quatre coins sont essayables : c'est la seule façon de voir si le bloc gêne une
  // autre surface (la recherche occupe déjà le haut-gauche).
  surfaces
    .addBinding(draft.readout, 'corner', {
      label: '↳ coin',
      options: {
        'haut droite': 'top-right',
        'haut gauche': 'top-left',
        'bas droite': 'bottom-right',
        'bas gauche': 'bottom-left',
      },
    })
    .on('change', emit)
  surfaces.addBinding(draft, 'dock', { label: 'dock des favoris' }).on('change', emit)
  surfaces.addBinding(draft.templates, 'enabled', { label: 'gestionnaire de templates' }).on('change', emit)
  // Coché : provider in-memory de démo (sa liste prime sur le localStorage, 1 template
  // en lecture seule). Décoché : localStorage seul, entièrement local et persistant.
  surfaces.addBinding(draft.templates, 'useApi', { label: '↳ provider API (démo)' }).on('change', emit)
  // Retirer le dessin retire AUSSI la barre qui le pilote : c'est le contrat de la lib.
  surfaces.addBinding(draft, 'draw', { label: 'couche de dessin' }).on('change', () => {
    syncDebugToggle()
    emit()
  })
  surfaces.addBinding(draft, 'cluster', { label: 'regroupement' }).on('change', emit)
  surfaces.addBinding(draft, 'relations', { label: 'moteur de relations' }).on('change', emit)
  surfaces.addBlade({ view: 'separator' })
  const debugBinding = surfaces.addBinding(draft, 'drawDebug', { label: 'sonde dessin (console)' })
  debugBinding.on('change', emit)
  debugToggle = debugBinding
  syncDebugToggle()
  // Moniteur de perf, monté en haut à droite de la carte (cf. `StatsOverlay`).
  surfaces.addBinding(draft, 'stats', { label: 'moniteur perf (FPS/RAM)' }).on('change', emit)

  page.addBlade({ view: 'separator' })

  // ── ② Barre d'outils, au bouton près ───────────────────────────────────────
  const toolbar = page.addFolder({ title: 'Barre d’outils' })
  toolbar
    .addBinding(draft.toolbar, 'position', { label: 'côté', options: { gauche: 'left', droite: 'right' } })
    .on('change', emit)
  // `0` la garde visible à tout zoom — pratique pour l'essayer en vue régionale.
  toolbar
    .addBinding(draft.toolbar, 'minZoom', { label: 'zoom mini d’affichage', min: 0, max: 21, step: 1 })
    .on('change', emit)
  toolbar.addBinding(draft.toolbar, 'lens', { label: 'outil loupe' }).on('change', emit)

  toolbar.addBlade({ view: 'separator' })
  const tools = toolbar.addFolder({ title: 'Outils de tracé' })
  checkboxes(tools, DRAW_TOOLS, draft.toolbar.tools, defaultLabels.tools)

  const modes = toolbar.addFolder({ title: 'Modes de sélection' })
  checkboxes(modes, SELECT_MODES, draft.toolbar.selectModes, SELECT_MODE_LABELS)

  const sections = toolbar.addFolder({ title: 'Sections' })
  checkboxes(sections, TOOLBAR_SECTIONS, draft.toolbar.sections, SECTION_LABELS)

  page.addBlade({ view: 'separator' })

  // ── ③ Contrôles de navigation ──────────────────────────────────────────────
  const controls = page.addFolder({ title: 'Contrôles de navigation' })
  controls
    .addBinding(draft.controls, 'position', { label: 'côté', options: { gauche: 'left', droite: 'right' } })
    .on('change', emit)
  controls.addBinding(draft.controls, 'target', { label: 'cible fournie' }).on('change', emit)

  controls.addBlade({ view: 'separator' })
  const buttons = controls.addFolder({ title: 'Boutons' })
  checkboxes(buttons, CONTROL_BUTTONS, draft.controls.buttons, BUTTON_LABELS)

  // Un groupe masqué emporte ses boutons ; un groupe dont TOUS les boutons sont
  // masqués disparaît de lui-même. Les deux grains coexistent, d'où deux dossiers.
  const groups = controls.addFolder({ title: 'Groupes' })
  checkboxes(groups, CONTROL_GROUPS, draft.controls.groups, GROUP_LABELS)

  page.addBlade({ view: 'separator' })

  // ── ④ Cadrages ─────────────────────────────────────────────────────────────
  // Ces vols vivaient dans un menu « banc de test » posé dans la barre d'outils. Ils
  // n'ont rien à y faire : ce sont des commandes de démo, pas des outils de carte.
  const camera = page.addFolder({ title: 'Cadrages de démo' })
  const cities = camera.addFolder({ title: 'Villes' })
  ctxRef.current.cityLabels.forEach((label, index) => {
    cities.addButton({ title: label }).on('click', () => ctxRef.current.camera.flyToCity(index))
  })
  camera.addButton({ title: 'Cadrer les alertes' }).on('click', () => ctxRef.current.camera.fitAlerts())
  camera.addButton({ title: 'Cadrer les zones' }).on('click', () => ctxRef.current.camera.fitZones())
  camera.addButton({ title: 'Revenir au point de contrôle' }).on('click', () => ctxRef.current.camera.recenter())
  camera.addButton({ title: 'Zoom 12' }).on('click', () => ctxRef.current.camera.setZoom(12))

  page.addBlade({ view: 'separator' })
  page.addButton({ title: 'Tout réafficher' }).on('click', () => {
    assignDraft(draft, defaultUiSettings)
    refresh()
    emit()
  })

  return {
    sync: () => {
      assignDraft(draft, ctxRef.current.ui)
      syncDebugToggle()
      refresh()
    },
  }
}
