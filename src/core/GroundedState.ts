/**
 * État de vue « caméra au ras du sol » (mode piéton), avec garde d'idempotence.
 *
 * Facteur commun de `DrapedLayer`, `DrawLayer` et `MapEngine` : les trois portent le même
 * booléen et la même bascule « ne rien faire si l'état ne change pas ». Ce qu'ils font APRÈS
 * un vrai changement leur reste propre — reconstruire leurs drapes, diffuser aux couches —,
 * d'où un `set` qui rend s'il y a eu changement plutôt qu'un callback centralisé ici.
 */
export class GroundedState {
  private value = false

  /** Vrai quand la caméra est au ras du sol — donne le `depthTest` des matériaux plats. */
  get active(): boolean {
    return this.value
  }

  /** Pose l'état ; rend `true` s'il a changé (à l'appelant de réagir), `false` sinon. */
  set(next: boolean): boolean {
    if (next === this.value) return false
    this.value = next
    return true
  }
}
