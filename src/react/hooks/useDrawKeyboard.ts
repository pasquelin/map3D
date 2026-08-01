import { type RefObject, useEffect, useRef } from 'react'
import type { MapEngine } from '../../core/MapEngine'
import type { DrawAction, LensApi } from '../context'
import { type DrawLayer as CoreDrawLayer, type DrawTool, type SelectMode } from '../../layers/DrawLayer'
import type { DrawToolShortcuts, EditShortcuts } from '../../config/types'
import { inTextInput, matchesEdit, plainKey } from '../components/shortcuts'
import { SELECT_MODE_META } from '../components/drawControls'
import type { PedestrianApi } from './usePedestrian'

/** Table de raccourcis effective, telle que consommée par le dispatch clavier. */
type ShortcutTable = Partial<Record<DrawTool | DrawAction, string | false>>

/**
 * Gestion clavier de `<DrawLayer>` : barre-espace = pan/rotation caméra temporaire
 * (le geste en cours est gelé, pas perdu), et raccourcis outils/édition (Entrée,
 * Échap, Ctrl+Z…). Extrait tel quel : mêmes handlers, mêmes bindings/cleanups.
 */
export function useDrawKeyboard(
  engine: MapEngine,
  overlay: HTMLElement,
  coreRef: RefObject<CoreDrawLayer | null>,
  toolRef: RefObject<DrawTool | null>,
  selectionRef: RefObject<readonly string[]>,
  pedestrianRef: RefObject<PedestrianApi>,
  lensRef: RefObject<LensApi | null>,
  releaseSpaceRef: RefObject<() => void>,
  setTool: (t: DrawTool | null) => void,
  setSelectMode: (m: SelectMode) => void,
  shortcuts: ShortcutTable | undefined,
  drawKeys: DrawToolShortcuts,
  editKeys: EditShortcuts,
): void {
  // Barre espace = pan caméra temporaire (le dessin/geste en cours est gelé, pas
  // perdu) ; Espace+Maj = rotation caméra. Relâcher = reprise exacte de l'outil.
  const spaceRef = useRef<{ prevMode: ReturnType<MapEngine['getDragMode']> } | null>(null)
  useEffect(() => {
    const releaseSpace = () => {
      coreRef.current?.setRotateHint(false)
      const held = spaceRef.current
      if (!held) return
      spaceRef.current = null
      engine.setDrawingSuspended(false)
      coreRef.current?.setSuspended(false)
      engine.setDragMode(held.prevMode)
      overlay.parentElement?.classList.remove('m3d-space-pan')
    }
    releaseSpaceRef.current = releaseSpace
    const onDown = (e: KeyboardEvent) => {
      if (inTextInput(e)) return
      if (e.code === 'Space' && !e.repeat && toolRef.current !== null) {
        e.preventDefault()
        if (spaceRef.current) return
        spaceRef.current = { prevMode: engine.getDragMode() }
        engine.setDrawingSuspended(true)
        coreRef.current?.setSuspended(true)
        overlay.parentElement?.classList.add('m3d-space-pan')
        if (e.shiftKey) engine.setDragMode('rotate')
      } else if (e.key === 'Shift') {
        if (spaceRef.current) engine.setDragMode('rotate')
        coreRef.current?.setRotateHint(true)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') releaseSpace()
      else if (e.key === 'Shift') {
        if (spaceRef.current) engine.setDragMode(spaceRef.current.prevMode)
        coreRef.current?.setRotateHint(false)
      }
    }
    // Fenêtre défocalisée pendant le maintien : on relâche proprement.
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', releaseSpace)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', releaseSpace)
      releaseSpace()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, overlay])

  // Raccourcis clavier (configurables) + Entrée/Échap/Ctrl+Z.
  useEffect(() => {
    const table = { ...drawKeys, ...shortcuts }
    const onKey = (e: KeyboardEvent) => {
      if (inTextInput(e)) return
      if (e.code === 'Space') return // géré par l'effet barre espace
      if (editKeys.closePolygon !== false && e.key === editKeys.closePolygon) coreRef.current?.closeCurrent()
      else if (e.key === 'Escape') {
        /**
         * Le mode piéton POSSÈDE Échap (`usePedestrianKeys`, toujours monté, indépendant de
         * `draw`) : ici on se contente de NE PAS lancer la cascade de dessin par-dessus (spec
         * §5) — sans cette garde, `coreRef.escape()` consommerait la touche et l'utilisateur
         * resterait enfermé au sol. La sortie elle-même (et le relâchement du Pointer Lock en
         * immersion totale) ne se décide plus ici.
         */
        if (pedestrianRef.current.state.mode === 'pedestrian') return
        // Cascade : marquee en cours → sélection → sortie de l'outil. La garde
        // `toolRef.current !== null` est CAPITALE : sans outil de dessin actif,
        // `setTool(null)` reprendrait quand même le slot partagé
        // `engine.inputInterceptor` (+ `setDrawing(false)`) alors qu'il appartient
        // à un outil externe (loupe) — celui-ci resterait affiché actif mais mort.
        if (!coreRef.current?.escape()) {
          if (toolRef.current !== null) setTool(null)
          // Aucun outil de tracé : Échap quitte le pick de bâtiment, qui est armé sur le
          // moteur et non sur cette couche. Les deux étant exclusifs, l'ordre suffit — et
          // le menu contextuel, lui, capte déjà Échap pour son propre compte avant nous.
          else engine.setBuildingPickMode(false)
        }
      } else if (editKeys.delete.includes(e.key)) {
        coreRef.current?.deleteSelected()
      } else if (e.key.startsWith('Arrow') && selectionRef.current.length > 0) {
        // Nudge, en pixels écran ; Maj prend le pas rapide.
        e.preventDefault()
        const step = e.shiftKey ? editKeys.nudgeFastPx : editKeys.nudgePx
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        coreRef.current?.nudgeSelection(dx, dy)
        // `redo` AVANT `undo` : au défaut les deux portent la même touche et ne se
        // distinguent que par Maj, donc le plus spécifique doit être testé d'abord.
      } else if (matchesEdit(e, editKeys.redo) || matchesEdit(e, editKeys.redoAlt)) {
        e.preventDefault()
        coreRef.current?.redo()
      } else if (matchesEdit(e, editKeys.undo)) {
        e.preventDefault()
        coreRef.current?.undo()
      } else if (matchesEdit(e, editKeys.selectAll) && toolRef.current !== null) {
        // Tout sélectionner — seulement quand un outil de la carte est actif
        // (sinon on laisse le ⌘A natif de la page).
        e.preventDefault()
        coreRef.current?.selectAll()
        if (toolRef.current !== 'select') setTool('select')
      } else if (matchesEdit(e, editKeys.duplicate) && selectionRef.current.length > 0) {
        e.preventDefault()
        coreRef.current?.duplicateSelected()
      } else {
        const k = plainKey(e)
        if (!k) return
        const found = (Object.entries(table) as Array<[DrawTool | DrawAction, string | false]>).find(
          ([, key]) => key === k,
        )
        if (!found) return
        const modeMeta = SELECT_MODE_META.find((m) => m.action === found[0])
        if (found[0] === 'selectBuilding') {
          // Ligne « bâtiment » du sélecteur : un outil du MOTEUR, pas du dessin. Le moteur
          // refuse de lui-même hors volume interne, et `useYieldsTool` retire l'outil de
          // tracé — comme pour la loupe. Reste la loupe elle-même, qui ne se cède pas.
          const next = !engine.getBuildingPickMode()
          if (next) lensRef.current?.deactivate()
          engine.setBuildingPickMode(next)
        } else if (modeMeta) {
          // Raccourci d'un mode de sélection : choisit le mode ET active l'outil.
          setSelectMode(modeMeta.mode)
          if (toolRef.current !== 'select') setTool('select')
        } else {
          setTool(found[0] as DrawTool)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // `drawKeys`/`editKeys` viennent de `config.interaction.shortcuts` : sans eux, seule
    // la prop `shortcuts` rebranchait le clavier, et remapper les raccourcis par la
    // config restait sans effet. Identités stables (arbre mergé), donc pas de churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts, setTool, drawKeys, editKeys, engine])
}
