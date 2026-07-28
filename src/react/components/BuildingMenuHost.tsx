// Menu contextuel d'un bâtiment désigné.
//
// Même patron que le menu d'un marker : la lib ouvre le panneau, l'hôte en compose le
// contenu (`<Map buildingMenu>`). Aucun texte ici — pas même un titre : ce que « ce
// bâtiment » veut dire n'appartient qu'à l'application.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BuildingHit, BuildingInfo } from '../../core/MapEngine'
import { useMapContext } from '../context'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { useDismiss } from './useDismiss'

export type BuildingMenuHostProps = {
  menu: (info: BuildingInfo) => MenuItem[]
}

/** Position en px CONTENEUR — `ContextMenu` s'y ancre, comme le menu d'une ligne de liste. */
type Open = { hit: BuildingHit; left: number; top: number }

/** Ouvre le menu d'un bâtiment au clic, et le tient mis en évidence tant qu'il est ouvert. */
export function BuildingMenuHost({ menu }: BuildingMenuHostProps) {
  const { engine, overlay } = useMapContext()
  const root = overlay.parentElement
  const [open, setOpen] = useState<Open | null>(null)
  const panel = useRef<HTMLElement | null>(null)
  const setPanel = useCallback((el: HTMLElement | null) => {
    panel.current = el
  }, [])

  // Lu au moment du clic, jamais capturé : une prop `menu` écrite en littéral inline ne
  // doit pas réabonner l'écoute à chaque rendu de l'hôte.
  const latest = useRef(menu)
  latest.current = menu

  useEffect(() => {
    return engine.on('buildingclick', ({ hit, originalEvent }) => {
      const rect = root?.getBoundingClientRect()
      if (!rect) return
      // Le menu ne s'ouvre que s'il a quelque chose à montrer : un panneau vide au clic
      // serait pire que pas de menu du tout.
      if (latest.current(hit.info).length === 0) return
      setOpen({ hit, left: originalEvent.clientX - rect.left, top: originalEvent.clientY - rect.top })
    })
  }, [engine, root])

  const close = useCallback(() => setOpen(null), [])
  useDismiss(panel, open !== null, close, { wheel: true, captureEscape: true })

  // Le bâtiment reste mis en évidence TANT QUE son menu est ouvert — c'est ce qui relie le
  // panneau à ce qu'il décrit, sur une carte qui en montre des centaines.
  const ref = open?.hit.ref ?? null
  useEffect(() => {
    engine.buildingPicker.setHighlight(ref, 'active')
    return () => engine.buildingPicker.setHighlight(null, 'active')
  }, [engine, ref])

  // L'outil quitté (raccourci, bouton, fond de carte changé), le menu n'a plus d'objet.
  useEffect(() => engine.on('buildingpickmode', (on) => !on && setOpen(null)), [engine])

  if (!open || !root) return null
  return createPortal(
    <ContextMenu
      items={latest.current(open.hit.info)}
      onClose={close}
      style={{ left: open.left, top: open.top }}
      panelRef={setPanel}
    />,
    root,
  )
}
