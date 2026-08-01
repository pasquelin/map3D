/**
 * Diffusion du « le jeu d'éléments a changé », sans opinion sur la façon dont ce jeu
 * est stocké.
 *
 * Séparée de `ProviderRegistry` parce que tous les registres n'indexent pas par
 * référence : le catalogue indexe par `id` (deux montages concurrents du même plugin
 * ne doivent pas produire deux entrées homonymes) et n'a donc que faire du `Set` du
 * socle. Il héritait pourtant de lui pour ces trente lignes, laissant derrière un
 * `providers` vide à vie — un champ hérité qui ment est un piège qui n'attend qu'un
 * futur helper du socle pour se refermer.
 */
export class ChangeNotifier {
  private readonly changeListeners = new Set<() => void>()
  /**
   * Jeton d'identité du jeu d'éléments : nouvelle référence à chaque mutation, la même
   * entre deux mutations. Il permet à un registre concret de publier un INSTANTANÉ
   * interrogeable plutôt qu'un compteur de révision — la différence est qu'un
   * instantané est nommé par le code qui l'interroge, donc c'est une vraie dépendance
   * React, là où un compteur reste un casse-cache que rien ne relie au calcul.
   */
  protected snapshotToken: object = {}

  /**
   * S'abonne au changement du jeu d'éléments (données, filtre tags…).
   *
   * Champ fléché et non méthode de prototype : `useSyncExternalStore` appelle la
   * fonction d'abonnement DÉTACHÉE de son objet, ce qui perdrait `this`.
   */
  onItemsChanged = (cb: () => void): (() => void) => {
    this.changeListeners.add(cb)
    return () => {
      this.changeListeners.delete(cb)
    }
  }

  /** Signale que le jeu d'éléments a changé (appelé par les fournisseurs). */
  itemsChanged(): void {
    this.snapshotToken = {}
    for (const cb of this.changeListeners) cb()
  }
}

/**
 * Socle des registres de providers partagés sur `MapEngine` (`engine.selectables`,
 * `engine.markers`, `engine.tags`…) : des couches s'enregistrent comme fournisseurs,
 * un outil les interroge, et les couches ne se connaissent jamais entre elles.
 *
 * Seule la mécanique commune vit ici — inscription, désinscription, diffusion du
 * « le jeu d'éléments a changé ». Chaque registre concret n'ajoute que SES méthodes
 * de requête (positions écran, cadre géo…). Écrite une fois : un changement de la
 * mécanique (ordre de notification, désabonnement) ne peut plus diverger d'un
 * registre à l'autre.
 */
export class ProviderRegistry<P> extends ChangeNotifier {
  protected readonly providers = new Set<P>()

  /** Inscrit un fournisseur ; la fonction rendue le retire. Notifie dans les deux sens. */
  register(p: P): () => void {
    this.providers.add(p)
    this.itemsChanged()
    return () => {
      this.providers.delete(p)
      this.itemsChanged()
    }
  }
}
