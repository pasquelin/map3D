import { ProviderRegistry } from '../core/ProviderRegistry'
import type { CatalogSource } from './types'

/**
 * Registre des sources de catalogue partagé sur `MapEngine` (`engine.catalog`) : l'hôte
 * et les plugins y déclarent leurs types, le contrôle les liste sans en connaître aucun.
 * Même mécanique que `engine.tags` ou `engine.search`.
 *
 * Indexé par `id` et non par référence, contrairement au `Set` du socle : une source
 * réinscrite après un rechargement à chaud, ou deux montages concurrents du même plugin,
 * produiraient sinon deux entrées homonymes dans le sous-menu.
 */
export class CatalogRegistry extends ProviderRegistry<CatalogSource> {
  private readonly byIdMap = new Map<string, CatalogSource>()

  /** Inscrit (ou remplace) une source ; la fonction rendue la retire. */
  register(source: CatalogSource): () => void {
    this.byIdMap.set(source.id, source)
    this.itemsChanged()
    return () => {
      // Ne retirer que si c'est TOUJOURS la nôtre : un remplacement par même id a pu
      // passer entre-temps, et le démontage de l'ancienne n'a pas à effacer la courante.
      if (this.byIdMap.get(source.id) !== source) return
      this.byIdMap.delete(source.id)
      this.itemsChanged()
    }
  }

  /** Sources déclarées, dans leur ordre d'inscription. */
  sources(): readonly CatalogSource[] {
    return [...this.byIdMap.values()]
  }

  byId(id: string): CatalogSource | undefined {
    return this.byIdMap.get(id)
  }

  /** Jeton d'identité du jeu de sources — dépendance d'un `useSyncExternalStore`. */
  snapshot(): object {
    return this.snapshotToken
  }
}
