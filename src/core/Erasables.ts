import { ProviderRegistry } from './ProviderRegistry'
import type { HostLayerKind } from '../config/types'
import type { LatLng } from '../shared'

/**
 * Un objet de couche hôte (route `PathLayer`, forme `ShapeLayer`) que la **gomme**
 * est autorisée à effacer. La lib ne possède pas ces objets (props React) : elle
 * n'expose donc qu'un **anneau géodésique** interrogeable, projeté par le `DrawLayer`
 * avec sa propre hauteur d'ancre. La suppression effective est déléguée à l'app via
 * le callback `onErase` (la lib ne mute jamais des props).
 */
export type ErasableItem = {
  id: string | number
  /** Contour lat/lng — polyligne pour un tracé, anneau fermé pour une forme. */
  ring: readonly LatLng[]
  closed: boolean
  /** Catégorie régie par `config.erase.targets` (cf. `HostLayerKind`). */
  kind: HostLayerKind
}

/** Contrat d'une couche hôte qui expose des objets effaçables à la gomme. */
export type ErasableProvider = {
  /**
   * Catégorie servie, DÉCLARÉE une fois — une couche hôte en sert toujours une seule
   * (`PathLayer` des tracés, `ShapeLayer` des formes). Elle est ici plutôt qu'en
   * paramètre de `has()` pour que le registre n'ait pas à demander à chaque provider
   * s'il répond pour des catégories qu'il ne possède pas.
   */
  readonly kind: HostLayerKind
  /** Uniquement les objets marqués `erasable` — appelé au finalize marquee / clic, jamais par frame. */
  items(): ErasableItem[]
  /**
   * Y a-t-il au moins un objet effaçable ?
   *
   * Répond SANS construire la liste : c'est ce qui permet à la barre de décider si la
   * gomme a lieu d'être (`config.toolbar.autoHide.erase`) sans matérialiser les
   * « dizaines de milliers d'objets » que `all()` évoque plus bas — un test de présence
   * n'a pas à payer le prix d'une collecte.
   */
  has(): boolean
}

/**
 * Registre des objets hôte effaçables, partagé sur `MapEngine` (`engine.erasables`) —
 * même motif que `engine.selectables`, mais SÉPARÉ : un objet effaçable par la gomme
 * n'est pas pour autant sélectionnable par l'outil sélection, et réciproquement. Les
 * couches s'enregistrent comme providers ; le `DrawLayer` les interroge.
 */
export class ErasableRegistry extends ProviderRegistry<ErasableProvider> {
  /** Concatène les objets effaçables de tous les providers. Boucle plutôt que spread
   *  `push(...items)` : un hôte portant des dizaines de milliers d'objets ferait sinon
   *  déborder la pile d'appels. Appelé au finalize marquee / au clic, jamais par frame. */
  all(): ErasableItem[] {
    const out: ErasableItem[] = []
    for (const p of this.providers) for (const it of p.items()) out.push(it)
    return out
  }

  /**
   * Existe-t-il un objet hôte effaçable dans l'une des catégories AUTORISÉES
   * (`config.erase.targets`) ? Court-circuite au premier trouvé, sans rien allouer.
   *
   * Prend la table des cibles plutôt qu'une liste de `kind` : c'est la forme sous
   * laquelle la politique existe déjà, et la traduire au point d'appel aurait produit
   * un tableau par question posée.
   */
  hasAny(targets: Readonly<Record<HostLayerKind, boolean>>): boolean {
    for (const p of this.providers) if (targets[p.kind] && p.has()) return true
    return false
  }
}
