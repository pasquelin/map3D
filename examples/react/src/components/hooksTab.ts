import type { ButtonApi, FolderApi, TabPageApi } from 'tweakpane'


import type { HooksFeed } from '../hooks/hooksFeed'

/**
 * Onglet « Hooks » du banc d'essai : ce que les hooks de contexte et la poignée `MapHandle`
 * donnent (lecture seule) et déclenchent (boutons). Les valeurs viennent de `HooksBridge`,
 * monté sous `<Map>` ; chaque dossier nomme le hook qu'il exerce — l'onglet se lit comme un
 * index. Le rafraîchissement suit `feed.notify`, jamais un intervalle : rien ne tourne quand
 * rien ne change.
 */
export function buildHooksTab(page: TabPageApi, feed: HooksFeed): { dispose: () => void } {
  const { model } = feed
  const read = (folder: FolderApi, key: keyof typeof model, label: string) =>
    folder.addBinding(model, key, { label, readonly: true, interval: 0 })

  const events = page.addFolder({ title: 'useMapEvents · caméra' })
  read(events, 'camera', 'position')
  read(events, 'altitude', 'altitude')
  read(events, 'click', 'clic')

  const viewport = page.addFolder({ title: 'useViewport · vue stabilisée' })
  read(viewport, 'viewport', 'emprise')

  const gate = page.addFolder({ title: 'useZoomGate · décor static' })
  read(gate, 'gate', 'seuil')

  // Les tags changent de liste (registre) et d'état (sélection) : le dossier se reconstruit
  // quand la liste change, ses titres se réécrivent quand la sélection change.
  const tagsFolder = page.addFolder({ title: 'useTags · filtre couches' })
  let tagButtons = new Map<string, ButtonApi>()
  let clearButton: ButtonApi | null = null

  const titleOf = (tag: string, count: number) => `${feed.selectedTags.has(tag) ? '●' : '○'} ${tag} (${count})`
  const rebuildTags = () => {
    for (const child of [...tagsFolder.children]) child.dispose()
    tagButtons = new Map()
    for (const { tag, count } of feed.tags) {
      const b = tagsFolder.addButton({ title: titleOf(tag, count) })
      b.on('click', () => feed.actions.toggleTag(tag))
      tagButtons.set(tag, b)
    }
    clearButton = null
    if (feed.selectedTags.size > 0) {
      clearButton = tagsFolder.addButton({ title: 'tout afficher' })
      clearButton.on('click', () => feed.actions.clearTags())
    }
  }
  const syncTags = () => {
    const same = feed.tags.length === tagButtons.size && feed.tags.every((t) => tagButtons.has(t.tag))
    if (!same || feed.selectedTags.size > 0 !== (clearButton !== null)) {
      rebuildTags()
      return
    }
    for (const { tag, count } of feed.tags) {
      const b = tagButtons.get(tag)
      const title = titleOf(tag, count)
      if (b && b.title !== title) b.title = title
    }
  }

  const camera = page.addFolder({ title: 'useCameraCommands · useCapture' })
  camera.addButton({ title: 'cadrer les markers' }).on('click', () => feed.actions.fitMarkers())
  camera.addButton({ title: 'zoom −' }).on('click', () => feed.actions.zoomOut())
  camera.addButton({ title: 'zoom +' }).on('click', () => feed.actions.zoomIn())
  camera.addButton({ title: 'capture' }).on('click', () => feed.actions.capture())

  const handle = page.addFolder({ title: 'MapHandle (ref) · dessin, interrogation' })
  handle.addButton({ title: 'interroger' }).on('click', () => feed.actions.probe())
  handle.addButton({ title: 'cadrer les dessins' }).on('click', () => feed.actions.fitDrawings())
  read(handle, 'probe', 'réponse')

  const lens = page.addFolder({ title: 'useLens' })
  read(lens, 'lens', 'loupe')
  const lensButton = lens.addButton({ title: 'basculer' })
  lensButton.on('click', () => feed.actions.toggleLens?.())

  const relations = page.addFolder({ title: 'useRelations' })
  read(relations, 'relations', 'état')
  const relClear = relations.addButton({ title: 'effacer' })
  relClear.on('click', () => feed.actions.clearRelations?.())

  const sync = () => {
    syncTags()
    lensButton.disabled = feed.actions.toggleLens === null
    relClear.disabled = feed.actions.clearRelations === null
    page.refresh()
  }
  sync()
  const off = feed.subscribe(sync)
  return { dispose: off }
}
