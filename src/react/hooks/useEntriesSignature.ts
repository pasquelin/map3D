import { useReducer, useRef } from 'react'

/** FNV-1a 32 bits — bon mélange, pas de dépendance, pas d'allocation. */
const fnv1a = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/**
 * Mélange d'une clé numérique, SANS passer par une chaîne. Un `String(id)` par entrée
 * allouait sur le chemin même que ce hook prétend dégager : les ids de base de données
 * sont des nombres, et une surface de 2 000 markers recalcule à ~11 Hz pendant un pan.
 * Les deux moitiés comptent — un id au-delà de 2³¹ ne tient pas dans un entier signé.
 */
const mixNumber = (n: number): number => {
  let h = Math.imul((n | 0) ^ 0x9e3779b1, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ Math.trunc(n / 0x100000000)) >>> 0
}

/**
 * Signature du jeu d'entrées d'une surface, accumulée clé par clé.
 *
 * Trois combinaisons (xor, somme, compte) plutôt qu'une : le xor seul est aveugle à
 * un échange de deux clés contre deux autres de même parité, la somme seule à une
 * permutation de bits. Ensemble, une différence réelle est détectée en pratique sans
 * jamais trier ni concaténer.
 */
export type SignatureAccumulator = {
  /** Ouvre une accumulation. `seed` distingue deux jeux de clés identiques dont les
   *  DONNÉES ont changé (version de points, par exemple). */
  begin(seed: number): void
  /** Ajoute une clé, et ce qu'elle porte de significatif (total d'un cluster…). */
  add(key: string | number, weight?: number): void
  /** Clôt l'accumulation et re-rend la surface si la signature a changé. */
  end(): void
}

/**
 * Détecte « le jeu d'entrées a-t-il changé ? » sans allouer.
 *
 * Deux surfaces recalculent leur contenu à ~11 Hz pendant un mouvement de caméra
 * alors qu'il ne change presque jamais (`<MarkerLayer>`, `<ClusterSurface>`). Les
 * portails ne doivent se re-rendre qu'au changement réel, d'où la signature ; et
 * celle-ci ne doit pas coûter, à chaque frame throttlée, un tableau de N chaînes,
 * un tri O(n log n) et une concaténation de plusieurs Ko — ce que faisaient les deux
 * implémentations jumelles qu'il remplace.
 *
 * Rend la version courante (à mettre dans les dépendances du `useMemo` des portails)
 * et l'accumulateur, d'identité STABLE : il vit hors du cycle React, comme le
 * recompute qui l'appelle.
 */
export function useEntriesSignature(): [rev: number, signature: SignatureAccumulator] {
  const [rev, bump] = useReducer((x: number) => x + 1, 0)
  const accRef = useRef<{ xor: number; sum: number; count: number; seed: number }>({
    xor: 0,
    sum: 0,
    count: 0,
    seed: 0,
  })
  // Signature publiée, comparée champ à champ. `count: -1` est l'état « rien n'a encore
  // été publié » (impossible à produire), ce qui garantit un premier bump. Composer une
  // chaîne pour comparer quatre entiers allouait à chaque passe — sur le chemin qu'on dégage.
  const lastRef = useRef({ xor: 0, sum: 0, count: -1, seed: 0 })
  const apiRef = useRef<SignatureAccumulator>({
    begin: (seed) => {
      const a = accRef.current
      a.xor = 0
      a.sum = 0
      a.count = 0
      a.seed = seed
    },
    add: (key, weight = 0) => {
      const a = accRef.current
      const h = ((typeof key === 'number' ? mixNumber(key) : fnv1a(key)) + weight * 0x9e3779b1) >>> 0
      a.xor = (a.xor ^ h) >>> 0
      a.sum = (a.sum + h) >>> 0
      a.count++
    },
    end: () => {
      const a = accRef.current
      const last = lastRef.current
      if (a.seed === last.seed && a.count === last.count && a.xor === last.xor && a.sum === last.sum) return
      last.seed = a.seed
      last.count = a.count
      last.xor = a.xor
      last.sum = a.sum
      bump()
    },
  })

  return [rev, apiRef.current]
}
