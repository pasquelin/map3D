// Grandeurs de diagnostic de la vue — module PUR, dans l'esprit de `labels/readout` :
// ni three, ni DOM, ni React. Il déclare CE QUI se mesure et COMMENT le juger ; la
// collecte, elle, vit dans `MapEngine` (seul à tenir le renderer et les couches) et
// l'écriture dans `StatsLayer`.
//
// ⚠️ Tout ce qui se compte ici se compte DANS LA VUE, jamais dans ce que l'hôte a posé.
// Un inventaire de 4 500 markers dont 40 sont à l'écran ne dit rien du coût de la frame,
// et c'est le coût de la frame qu'on regarde. Les grandeurs qui portent malgré tout un
// total le disent dans leur nom (`markersTotal`), et servent à lire l'écart : c'est lui
// qui révèle un cull ou un regroupement qui ne fait pas son travail.

import type { ReadoutField } from '../labels/readout'

/**
 * Grandeur affichable du panneau de diagnostic.
 *
 * Les champs de `ReadoutField` (caméra) en font partie : le panneau les présente comme
 * les autres, avec le même formatage et le même verdict. C'est ce qui permet au bloc de
 * lecture d'être ABSORBÉ par le panneau plutôt que dupliqué à côté.
 */
export type StatField =
  | ReadoutField
  /** Markers réellement peints — cull d'écran et occlusion par le globe déduits. */
  | 'markersVisible'
  /** Markers pris en charge, toutes couches confondues. L'écart avec le précédent est le sujet. */
  | 'markersTotal'
  /** Pastilles de regroupement à l'écran. */
  | 'clusters'
  /** Formes, tracés et liens drapés dans la vue. */
  | 'shapes'
  | 'paths'
  | 'links'
  /** Objets de la couche de dessin. */
  | 'drawings'
  /** Cadence réellement obtenue, sur une fenêtre glissante. */
  | 'fps'
  /** Part des frames de la boucle qui ont été PEINTES (rendu à la demande). */
  | 'paintedRatio'
  | 'drawCalls'
  | 'triangles'
  | 'textures'
  | 'geometries'
  /** Échelle de résolution appliquée (1 = pleine). En dessous, la carte se dégrade pour tenir. */
  | 'resolutionScale'
  /** Tuiles montées, tous fournisseurs confondus. */
  | 'tilesCached'
  /** Tuiles en cours de téléchargement ou d'extrusion. */
  | 'tilesInflight'
  /** Mémoire retenue par les tuiles (octets, GPU et CPU confondus). */
  | 'tileBytes'
  /** Workers d'extrusion vivants (cf. `WorkerPool`). */
  | 'workers'

/** Verdict d'une grandeur, tel que la couleur le rend. */
export type StatLevel = 'ok' | 'warn' | 'bad'

/**
 * Bornes de confort d'une grandeur.
 *
 * Le SENS se déduit de l'ordre des deux bornes, et n'a donc pas à être déclaré :
 * — `ok < warn` : la grandeur pèse (triangles, markers) — petit = bon ;
 * — `ok > warn` : la grandeur porte (fps, ratio de frames peintes) — grand = bon.
 *
 * Un drapeau `higherIsBetter` séparé aurait pu contredire les bornes ; ici c'est
 * impossible.
 */
export type StatThreshold = {
  /** Jusqu'ici (ou à partir d'ici, cf. le sens), la grandeur est confortable. */
  ok: number
  /** Au-delà (ou en deçà), elle est excessive. Entre les deux : à surveiller. */
  warn: number
}

/**
 * Verdict d'une valeur face à ses bornes.
 *
 * Une valeur non finie rend `'ok'` et non `'bad'` : une grandeur qu'on ne sait pas encore
 * mesurer (première frame, fournisseur absent) n'est pas une alerte, et la peindre en
 * rouge apprendrait au lecteur à ignorer le rouge.
 */
export function statLevel(value: number, threshold: StatThreshold | undefined): StatLevel {
  if (!threshold || !Number.isFinite(value)) return 'ok'
  const { ok, warn } = threshold
  if (ok > warn) return value >= ok ? 'ok' : value >= warn ? 'warn' : 'bad'
  return value <= ok ? 'ok' : value <= warn ? 'warn' : 'bad'
}

/**
 * Ce qu'un contributeur sait compter de lui-même, à cette frame.
 *
 * Passe par un REGISTRE (`engine.counters`) et non par un champ de `Layer` : le
 * regroupement n'est pas une couche mais une surface React (`ClusterSurface`), et les
 * pastilles à l'écran sont précisément ce qu'on veut compter. Un champ sur `Layer`
 * l'aurait laissée dehors — et aurait modifié un type que toutes les couches
 * implémentent, pour une fonction que le rendu n'utilise pas.
 */
export type StatContribution = {
  /** À quelle grandeur ce contributeur ajoute. Plusieurs peuvent partager la même. */
  kind: 'markers' | 'clusters' | 'shapes' | 'paths' | 'links' | 'drawings'
  /** Éléments réellement dans la vue. */
  visible: number
  /** Éléments pris en charge, vue ou non. */
  total: number
}

/**
 * ⚠️ RÈGLE CENTRALE de ce module, et la raison de sa forme : **un compteur ne coûte rien
 * quand personne ne regarde**.
 *
 * Le panneau interroge à `performance.readoutRefreshMs` (~8 fois par seconde) et
 * seulement pendant qu'il est ouvert ; une couche qui compterait dans son `update()`
 * paierait 60 fois par seconde, panneau fermé compris — et sur les frames non peintes,
 * que le rendu à la demande existe justement pour rendre gratuites. C'est pourquoi le
 * cadre de la vue descend jusqu'au contributeur (`stats(bounds)`) plutôt que d'être lu
 * dans `FrameContext` : `ctx.view` est un getter que le moteur réserve aux consommateurs
 * HORS boucle de frame (cf. `GraticuleLayer`), et le forcer par frame ferait payer 25
 * raycasts d'ellipsoïde à une fonctionnalité de diagnostic.
 */

/** Instantané complet, tel que `MapEngine.viewStats()` le rend et que `StatsLayer` l'écrit. */
export type ViewStats = Partial<Record<StatField, number>>

/**
 * Agrège les contributions dans l'instantané.
 *
 * Additionne par `kind` : deux `MarkerLayer` montées côte à côte (des alertes et des
 * agents, par exemple) donnent UN total de markers, qui est ce que la frame paie
 * réellement — c'est aussi la raison d'être du regroupement commun (cf.
 * `ClusterRegistry`).
 *
 * Écrit dans `out` plutôt que de rendre un objet neuf : appelé à chaque rafraîchissement
 * du panneau, il ne doit rien allouer — un panneau de diagnostic qui pèse sur la frame
 * fausse ce qu'il affiche.
 */
export function foldLayerStats(out: ViewStats, contributions: readonly StatContribution[]): ViewStats {
  let markersVisible = 0
  let markersTotal = 0
  let clusters = 0
  let shapes = 0
  let paths = 0
  let links = 0
  let drawings = 0
  for (const s of contributions) {
    switch (s.kind) {
      case 'markers':
        markersVisible += s.visible
        markersTotal += s.total
        break
      case 'clusters':
        clusters += s.visible
        break
      case 'shapes':
        shapes += s.visible
        break
      case 'paths':
        paths += s.visible
        break
      case 'links':
        links += s.visible
        break
      case 'drawings':
        drawings += s.visible
        break
    }
  }
  out.markersVisible = markersVisible
  out.markersTotal = markersTotal
  out.clusters = clusters
  out.shapes = shapes
  out.paths = paths
  out.links = links
  out.drawings = drawings
  return out
}
