import { useReducer, useRef } from 'react'

/** FNV-1a 32 bits — bon mélange, pas de dépendance, pas d'allocation. */
const fnv1a = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
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
  const lastRef = useRef('')
  const accRef = useRef<{ xor: number; sum: number; count: number; seed: number }>({
    xor: 0,
    sum: 0,
    count: 0,
    seed: 0,
  })
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
      const h = (fnv1a(String(key)) + weight * 0x9e3779b1) >>> 0
      a.xor = (a.xor ^ h) >>> 0
      a.sum = (a.sum + h) >>> 0
      a.count++
    },
    end: () => {
      const a = accRef.current
      const sig = `${a.seed}|${a.count}|${a.xor}|${a.sum}`
      if (sig === lastRef.current) return
      lastRef.current = sig
      bump()
    },
  })

  return [rev, apiRef.current]
}
