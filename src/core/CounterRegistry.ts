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

import { ProviderRegistry } from './ProviderRegistry'
import { foldLayerStats, type StatContribution, type ViewStats } from './viewStats'

/**
 * Un contributeur de compteurs.
 *
 * `stats()` est appelé à la CADENCE DU PANNEAU (quelques fois par seconde), jamais par
 * frame : il peut donc allouer son petit objet de retour sans conséquence. Il doit en
 * revanche rester une LECTURE — parcourir mille markers pour les recompter à chaque
 * appel remettrait dans la boucle ce que le panneau prétend mesurer. Les couches
 * tiennent leurs compteurs à jour dans leur propre passe.
 */
export type StatCounter = {
  stats(): StatContribution
}

export class CounterRegistry extends ProviderRegistry<StatCounter> {
  /**
   * Agrège les contributions dans `out`, qui est RÉUTILISÉ d'un rafraîchissement à
   * l'autre — le panneau ne doit pas allouer un instantané par passage.
   */
  collect(out: ViewStats): ViewStats {
    // Tableau de travail réutilisé : `foldLayerStats` prend une liste, et en construire
    // une neuve à chaque passage annulerait le soin pris juste au-dessus.
    this.scratch.length = 0
    for (const p of this.providers) this.scratch.push(p.stats())
    return foldLayerStats(out, this.scratch)
  }

  private readonly scratch: StatContribution[] = []
}
