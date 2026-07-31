/**
 * Jeton monotone départageant des réponses asynchrones concurrentes.
 *
 * `AbortController` ne suffit pas : une requête annulée peut avoir DÉJÀ résolu sa
 * promesse, et le `.then()` s'exécutera quand même au tour de boucle suivant. Le jeton
 * est ce qui décide si un résultat a encore le droit d'être affiché — sans lui, une
 * réponse lente à « par » écrase la réponse rapide à « paris ».
 */
export class RaceGuard {
  private token = 0
  private current = 0

  /** Ouvre une tentative et rend son jeton. Toutes les précédentes deviennent périmées. */
  next(): number {
    this.token += 1
    this.current = this.token
    return this.token
  }

  isCurrent(token: number): boolean {
    // `token !== 0` : 0 est la valeur d'un jeton jamais émis, et l'état après `cancel()`.
    // Sans ce test, une variable non initialisée passerait pour la tentative courante.
    return token === this.current && token !== 0
  }

  /** Périme tout : démontage, fermeture du panneau, changement de type. */
  cancel(): void {
    this.current = 0
  }
}
