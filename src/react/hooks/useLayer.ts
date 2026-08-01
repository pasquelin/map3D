import { type RefObject, useEffect, useRef } from 'react'
import type { Layer } from '../../core/Layer'
import type { StatCounter } from '../../core/CounterRegistry'
import { useMapContext } from '../context'

/**
 * Monte une couche du moteur pour la durée de vie du composant : construction,
 * `addLayer`, puis `removeLayer` au démontage. Renvoie un ref sur l'instance (null
 * hors montage) pour lui pousser des mises à jour.
 *
 * `factory` n'est appelée QU'AU montage : elle est volontairement hors dépendances.
 * Toute valeur qui change ensuite (thème, données, options) doit passer par un
 * setter de la couche — via `useLayerSync` — et non par une reconstruction, qui
 * jetterait géométries et textures à chaque changement de prop.
 */
export function useLayer<T extends Layer>(factory: () => T): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  const { engine } = useMapContext()
  const latest = useLatest(factory)
  useEffect(() => {
    const layer = latest.current()
    engine.addLayer(layer)
    ref.current = layer
    return () => {
      engine.removeLayer(layer)
      ref.current = null
    }
  }, [engine, latest])
  return ref
}

/**
 * Garde la dernière version d'une fonction dans un ref, SANS écrire pendant le rendu.
 *
 * React 19 proscrit l'écriture de `ref.current` en phase de rendu : un rendu concurrent
 * abandonné publierait la valeur d'un arbre qui ne sera jamais monté. L'affectation
 * passe donc par un effet sans dépendances, qui s'exécute après chaque commit — soit
 * exactement quand la valeur devient celle de l'arbre réellement affiché.
 */
function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

/**
 * Pousse une valeur vers la couche quand elle change : le `useEffect(() => {
 * ref.current?.setX(x) }, [x])` que chaque wrapper répétait.
 *
 * `apply` est lue via un ref, donc une lambda inline au point d'appel ne redéclenche
 * rien : seule la valeur `value` commande. C'est exactement ce qu'on veut ici, et
 * c'est ce qu'un `useEffect` écrit à la main obtenait en omettant `apply` de ses
 * dépendances — silencieusement, à la faveur d'un `eslint-disable`.
 */
export function useLayerSync<T, V>(ref: RefObject<T | null>, value: V, apply: (layer: T, value: V) => void): void {
  const latest = useLatest(apply)
  useEffect(() => {
    if (ref.current) latest.current(ref.current, value)
  }, [ref, value, latest])
}

/**
 * Inscrit une couche au registre des compteurs tant qu'elle est montée.
 *
 * Appelé APRÈS `useLayer` : l'ordre des effets suit celui des hooks, donc la couche est
 * déjà posée dans la ref quand celui-ci s'exécute. La désinscription part avec le
 * démontage — un compteur qui survivrait à sa couche afficherait un chiffre figé, ce qui
 * est pire que pas de chiffre du tout.
 */
export function useStatCounter<T extends StatCounter>(ref: RefObject<T | null>): void {
  const { engine } = useMapContext()
  useEffect(() => {
    const counter = ref.current
    if (!counter) return
    return engine.counters.register({ stats: () => counter.stats() })
  }, [engine, ref])
}
