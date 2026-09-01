import { type RefObject, useEffect, useState } from 'react'
import type { MapEngine } from '../../core/MapEngine'
import type { LinkLayer } from '../../layers/LinkLayer'
import type { RelationEngine } from '../../relations/core/engine'
import { useConfig } from '../context'
import { isActiveMap } from '../activeMap'

/** Classe posée sur le conteneur carte quand un lien est survolé (curseur). */
const HOVER_CLASS = 'm3d-hover-link'

/** Un champ de saisie a-t-il le focus ? Échap lui appartient alors, pas à la carte. */
function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
}

/**
 * Gestes des liens de relation : survol, clic (ouvrir/refermer un itinéraire) et
 * Échap. Séparé de `<RelationLayer>`, qui orchestre le moteur et le rendu — ici il
 * n'est question que de traduire des événements d'entrée en intentions.
 *
 * Renvoie l'id du lien ou du socle sous le pointeur, dont dépend le style des visuels.
 */
export function useRelationInteraction(
  engine: MapEngine,
  overlay: HTMLElement,
  layerRef: RefObject<LinkLayer | null>,
  relations: RelationEngine,
): string | null {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Contexte et non `engine.config` : cf. `useConfig`.
  const linkHitTolerancePx = useConfig().interaction.linkHitTolerancePx

  // Survol : curseur de sélection + mise en évidence du trait. C'est le seul signal
  // qui rend les liens découvrables comme cliquables.
  useEffect(() => {
    const el = engine.renderer.domElement
    let frame = 0
    // Dernier point brut (px client) en attente. Deux scalaires plutôt qu'un objet :
    // `pointermove` arrive en continu, et rien ne justifie d'y allouer.
    let pendingX = 0
    let pendingY = 0
    let hasPending = false

    /**
     * Le hit-test est COALESCÉ sur la frame. Il projette chaque sommet de chaque lien
     * (un lien échantillonné en porte jusqu'à 257), donc l'exécuter à la cadence brute
     * du pointeur — 120 Hz sur une souris moderne, davantage sur un trackpad — le fait
     * tourner plusieurs fois entre deux images affichées, pour un résultat que
     * personne ne voit. Une passe par frame suffit et suit le rendu.
     */
    const test = () => {
      frame = 0
      const layer = layerRef.current
      if (!layer || !hasPending) return
      hasPending = false
      // Le rect se lit ICI, une seule fois par frame. Dans `onMove` il forçait une mise
      // en page à chaque événement de pointeur — le calcul de layout le plus cher du
      // hook, payé plusieurs fois pour une image. Même parade que `GraticuleLayer` et
      // `DrawLayer`, qui mémoïsent leur rect par frame.
      const rect = el.getBoundingClientRect()
      const x = pendingX - rect.left
      const y = pendingY - rect.top
      const hub = layer.hitTestHub(x, y)
      // Le socle d'abord : tous les traits rayonnent DEPUIS lui, donc à l'intérieur
      // du disque il s'en trouve toujours un à portée de tolérance. Les tester en
      // premier rendrait le socle définitivement inatteignable. Ailleurs — soit
      // partout au-delà de son rayon — les traits reprennent la main.
      const hit = hub ?? layer.hitTest(x, y, linkHitTolerancePx)
      setHoveredId(hit)
      // Le curseur ne change que sur un trait : sur le socle, seule la croix est
      // cliquable — annoncer tout le disque comme actionnable serait un mensonge.
      overlay.parentElement?.classList.toggle(HOVER_CLASS, hit !== null && hub === null)
    }

    const onMove = (e: PointerEvent) => {
      // Aucune relation ouverte : rien à survoler, et le cas est le plus fréquent de
      // tous — la carte reçoit des `pointermove` en permanence.
      if (relations.snapshots.length === 0) return
      pendingX = e.clientX
      pendingY = e.clientY
      hasPending = true
      if (frame === 0) frame = requestAnimationFrame(test)
    }
    const onLeave = () => {
      setHoveredId(null)
      overlay.parentElement?.classList.remove(HOVER_CLASS)
    }
    el.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', onLeave)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      overlay.parentElement?.classList.remove(HOVER_CLASS)
    }
  }, [engine, overlay, relations, layerRef, linkHitTolerancePx])

  // Clic sur un lien : itinéraire réel, ou promotion d'un alternatif déjà en mémoire.
  useEffect(() => {
    return engine.on('click', ({ originalEvent }) => {
      const layer = layerRef.current
      if (!layer || relations.snapshots.length === 0) return
      const rect = engine.renderer.domElement.getBoundingClientRect()
      const x = originalEvent.clientX - rect.left
      const y = originalEvent.clientY - rect.top
      // Sur le socle, on ne choisit rien : les traits y convergent tous, le clic
      // ouvrirait un itinéraire au hasard. Seule sa croix y est actionnable.
      if (layer.hitTestHub(x, y)) return
      const hit = layer.hitTest(x, y, linkHitTolerancePx)
      if (!hit) return
      // Recliquer sur l'itinéraire affiché le referme : le geste qui l'a ouvert est
      // aussi celui qui le ferme, sans avoir à viser une croix.
      const owner = relations.sourceOf(hit)
      if (owner && relations.snapshotFor(owner)?.tracedLinkId === hit) {
        relations.untrace(hit)
        return
      }
      void relations.trace(hit)
    })
  }, [engine, relations, layerRef, linkHitTolerancePx])

  // Échap referme les itinéraires ouverts, puis efface les relations restantes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // La carte est montée DANS une application : Échap y sert aussi à quitter un
      // champ ou à refermer une surface. Effacer toutes les relations parce qu'une
      // modale de l'hôte se ferme serait une prise d'otage du raccourci.
      if (e.defaultPrevented || isEditingTarget(e.target) || !isActiveMap(engine)) return
      if (relations.snapshots.length === 0) return
      const traced = relations.snapshots.some((s) => s.tracedLinkId !== null)
      if (traced) relations.untrace()
      else relations.clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [relations, engine])

  return hoveredId
}
