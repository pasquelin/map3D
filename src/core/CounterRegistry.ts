// Registre des compteurs de diagnostic : qui sait compter quoi, dans la vue courante.
//
// Même marché que les autres registres portés par le moteur (`selectables`, `markers`,
// `tags`) : un contributeur s'inscrit, le panneau interroge, et les contributeurs ne se
// connaissent jamais entre eux. Une couche custom peut donc déclarer ses propres
// éléments sans que rien du cœur n'ait à la connaître.
//
// ⚠️ STRICTEMENT en lecture. Un compteur ne décide de rien, ne modifie rien, et son
// absence n'enlève aucune fonction : retirer ce registre rendrait le panneau vide, et
// c'est tout. C'est la condition pour qu'un outil de diagnostic ne devienne jamais la
// cause de ce qu'il diagnostique.

import type { Bounds } from '../shared'
import { ProviderRegistry } from './ProviderRegistry'
import { foldLayerStats, type StatContribution, type ViewStats } from './viewStats'

/** Un contributeur de compteurs. */
export type StatCounter = {
  /**
   * Compte les éléments de ce contributeur, dont ceux qui tombent dans `bounds`.
   *
   * Appelé à la CADENCE DU PANNEAU (quelques fois par seconde) et seulement pendant qu'il
   * est ouvert : c'est ici, et non dans une passe de frame, que le balayage se paie — cf.
   * la règle centrale de `viewStats`.
   */
  stats(bounds: Bounds): StatContribution
}

export class CounterRegistry extends ProviderRegistry<StatCounter> {
  /**
   * Agrège les contributions dans `out`, qui est RÉUTILISÉ d'un rafraîchissement à
   * l'autre — le panneau ne doit pas allouer un instantané par passage.
   */
  collect(out: ViewStats, bounds: Bounds): ViewStats {
    // Tableau de travail réutilisé : `foldLayerStats` prend une liste, et en construire
    // une neuve à chaque passage annulerait le soin pris juste au-dessus.
    this.scratch.length = 0
    for (const p of this.providers) this.scratch.push(p.stats(bounds))
    return foldLayerStats(out, this.scratch)
  }

  private readonly scratch: StatContribution[] = []
}
