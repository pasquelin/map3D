import { useMemo, useRef } from 'react'

/**
 * Identité stable d'une fonction, pour la clé de contenu.
 *
 * `JSON.stringify` OMET purement et simplement les fonctions : sans ce traitement,
 * deux thèmes ne différant que par leur `flyEasing` (ou deux jeux de libellés ne
 * différant que par `plural`) produiraient la même clé, et le cache renverrait la
 * version périmée. On leur substitue donc un identifiant tiré d'une `WeakMap` : même
 * référence → même id, référence neuve → clé neuve, sans retenir la fonction.
 */
const fnIds = new WeakMap<object, number>()
let nextFnId = 0

const contentKey = (value: unknown): string =>
  JSON.stringify(value ?? null, (_k, v: unknown) => {
    if (typeof v !== 'function') return v
    const known = fnIds.get(v as object)
    if (known !== undefined) return `fn:${known}`
    const id = nextFnId++
    fnIds.set(v as object, id)
    return `fn:${id}`
  })

/**
 * Merge mémoïsé **par contenu** d'un arbre d'overrides.
 *
 * Le pattern documenté partout dans la lib est le littéral inline (`theme={{…}}`,
 * `labels={{…}}`, `config={{…}}`, `presets={{…}}`), donc une nouvelle référence à
 * chaque render du parent. Mémoïser sur l'IDENTITÉ ne sert alors à rien : le contexte
 * s'invalide à chaque tick et re-rend tous ses consommateurs. Ces arbres sont de
 * petits ensembles de scalaires — la sérialisation est bornée, et largement moins
 * chère que le rendu qu'elle évite.
 *
 * Écrit une fois pour les quatre : c'était le même bloc de neuf lignes, recopié.
 */
// Deux signatures pour un seul corps : l'appelant qui passe TOUJOURS une valeur (le
// thème, dont l'enveloppe est construite sur place) ne doit pas avoir à écrire `input!`
// dans son merge pour satisfaire un `| undefined` que lui-même exclut.
export function useMergedByContent<P, R>(input: P, merge: (input: P) => R): R
export function useMergedByContent<P, R>(input: P | undefined, merge: (input?: P) => R): R
export function useMergedByContent<P, R>(input: P | undefined, merge: (input?: P) => R): R {
  // Écrit pendant le render, et c'est volontaire : ce cache est PUR — même contenu,
  // même résultat — donc un render abandonné (StrictMode, rendu concurrent interrompu)
  // ne peut y laisser qu'une entrée valide, jamais une divergence observable. C'est le
  // motif de mémoïsation que React admet explicitement, à ce prix-là.
  const cache = useRef<{ input: P | undefined; key: string; merged: R } | null>(null)
  return useMemo(() => {
    const cached = cache.current
    // Court-circuit sur l'identité AVANT de sérialiser : un hôte qui ne passe pas
    // d'overrides (ou qui les mémoïse déjà) retombe sur la même référence à chaque
    // render, cas où la clé de contenu ne peut pas changer. Sans cette garde, ce
    // cache transforme un cas gratuit en parcours d'arbre récurrent.
    if (cached && cached.input === input) return cached.merged
    const key = contentKey(input)
    if (cached && cached.key === key) {
      // Contenu identique sous une référence neuve : on retient la référence pour que
      // le render suivant sorte par le court-circuit ci-dessus.
      cached.input = input
      return cached.merged
    }
    const merged = merge(input)
    cache.current = { input, key, merged }
    return merged
    // `merge` est volontairement hors des dépendances : c'est soit un import de
    // module, soit une closure recréée à chaque render — la dépendre relancerait le
    // merge à chaque fois, c'est-à-dire exactement ce que ce cache évite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input])
}
