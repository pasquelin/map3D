import { useEffect, useMemo, useRef } from 'react'
import type { ErasableItem } from '../../core/Erasables'
import type { HostLayerKind } from '../../config/types'
import { useMapContext } from '../context'

/**
 * Objet hôte admissible à la gomme : opt-in EXPLICITE, et une identité à remonter dans
 * `onErase` — sans elle, l'application ne saurait pas quoi supprimer.
 *
 * Ici et non recopié dans chaque couche : c'est la règle d'admissibilité d'`ErasableItem`,
 * elle appartient au contrat, pas à ses consommateurs.
 */
export const isErasableHost = (o: { erasable?: boolean; id?: string | number }): boolean => !!o.erasable && o.id != null

/**
 * Inscrit une couche hôte au registre de la gomme (`engine.erasables`).
 *
 * `PathLayer` et `ShapeLayer` en tenaient chacune leur copie — même prédicat, même trio
 * présence/ref/effet, même inscription. Le contrat vient de gagner deux membres requis
 * (`kind`, `has`) : une évolution de plus se serait payée deux fois.
 *
 * **`items()` lit par ref**, jamais par closure capturée : le provider est inscrit UNE
 * fois, et la gomme l'interroge au moment du geste — pas par frame. La présence, elle,
 * est mémoïsée sur l'identité de la liste : `some()` ne court-circuite jamais dans le cas
 * nominal (`erasable` est opt-in, donc le plus souvent faux partout) et balayait donc la
 * liste entière à CHAQUE rendu, y compris quand rien n'avait bougé.
 */
export function useErasableProvider<T extends { erasable?: boolean; id?: string | number }>(
  kind: HostLayerKind,
  list: readonly T[],
  toItem: (o: T) => ErasableItem,
): void {
  const { engine } = useMapContext()

  const latest = useRef(list)
  latest.current = list
  const toItemRef = useRef(toItem)
  toItemRef.current = toItem

  const present = useMemo(() => list.some(isErasableHost), [list])
  const presentRef = useRef(present)
  presentRef.current = present

  useEffect(
    () =>
      engine.erasables.register({
        kind,
        items: () => latest.current.filter(isErasableHost).map((o) => toItemRef.current(o)),
        has: () => presentRef.current,
      }),
    [engine, kind],
  )

  // La barre retire la gomme quand plus rien n'est effaçable, et le provider — qui lit par
  // ref — ne notifie rien de lui-même. Sur le BOOLÉEN, pas sur la liste : une liste neuve
  // à contenu équivalent ne doit pas relancer le balayage des couches.
  useEffect(() => engine.erasables.itemsChanged(), [engine, present])
}
