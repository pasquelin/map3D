import type { MarkerData } from '../data/types'
import type { LatLng } from '../shared'
import { ProviderRegistry } from './ProviderRegistry'

/**
 * Un point contribué au regroupement commun, muni d'une clé UNIQUE à l'échelle de
 * la carte. Deux couches peuvent porter le même id métier (`1` dans les alertes,
 * `1` dans les symboles) : la clé préfixe donc l'id par le rang du contributeur,
 * seul moyen de les distinguer dans un index unique.
 */
export type ClusterPoint = {
  uid: string
  marker: MarkerData
  owner: ClusterContributor
}

/**
 * Ce que le service décide pour UNE couche, à chaque recompute. La couche pose ses
 * markers en conséquence — c'est tout ce qu'elle a à savoir du regroupement.
 */
export type ClusterPlacement = {
  /** Markers agrégés dans une pastille : la couche ne les pose PAS. */
  absorbed: ReadonlySet<string | number>
  /**
   * Markers décollés par l'éventail (zoom maximal, points confondus) : à poser à
   * cette position plutôt qu'à la leur, chacun gardant son fil vers son point au sol.
   */
  moved: ReadonlyMap<string | number, LatLng>
}

/** Placement neutre — tout est posé normalement. */
export const NO_PLACEMENT: ClusterPlacement = { absorbed: new Set(), moved: new Map() }

/** Deux placements décident-ils la même chose ? Comparaison par CONTENU, sans allocation. */
function samePlacement(a: ClusterPlacement, b: ClusterPlacement): boolean {
  if (a === b) return true
  if (a.absorbed.size !== b.absorbed.size || a.moved.size !== b.moved.size) return false
  for (const id of a.absorbed) if (!b.absorbed.has(id)) return false
  for (const [id, at] of a.moved) {
    const other = b.moved.get(id)
    if (!other || other.lat !== at.lat || other.lng !== at.lng) return false
  }
  return true
}

/**
 * Une couche qui participe au regroupement commun.
 *
 * Le contrat tient en deux gestes : elle DONNE ses points, et elle POSE ce que le
 * service lui rend. Elle ne connaît ni les autres couches, ni les pastilles.
 */
export type ClusterContributor = {
  /**
   * Clé STABLE de la couche — elle préfixe les uid (cf. `ClusterPoint.uid`).
   *
   * Fournie par la couche (`useId()`) et non attribuée à l'inscription : un rang
   * d'inscription changerait à chaque remontage, donc tous les uid de la couche, donc
   * le cache de feuilles de l'index et les clés DOM de ses pastilles.
   */
  key: string
  /**
   * Points à regrouper, déjà filtrés par la couche (filtre de tags, seuil de zoom
   * des statiques) : le service ne regroupe que ce qui serait affiché.
   */
  points(): readonly MarkerData[]
  /** Clé stable d'un point, telle que la couche la voit (`getId`). */
  idOf(m: MarkerData): string | number
  /** Applique le placement décidé. Appelé hors cycle React — passer par des refs. */
  place(placement: ClusterPlacement): void
}

/**
 * Registre de regroupement partagé sur `MapEngine`.
 *
 * Pourquoi au niveau de la CARTE et non de la couche : un cluster est un regroupement
 * de ce qui se superpose **à l'écran**, quelle que soit la provenance des points. Tant
 * que chaque couche regroupait les siens dans son coin, un symbole posé restait
 * affiché seul à côté — voire par-dessus — la pastille de la couche voisine, qui pour
 * lui n'existait pas.
 *
 * Le registre ne regroupe rien lui-même : il collecte les points et diffuse les
 * décisions. Le calcul vit dans la surface de clusters, seule à connaître la caméra.
 */
export class ClusterRegistry extends ProviderRegistry<ClusterContributor> {
  /** Dernier placement diffusé, par couche — cf. `place`. */
  private readonly last = new WeakMap<ClusterContributor, ClusterPlacement>()

  /** Tous les points contribués, toutes couches confondues. */
  allPoints(): ClusterPoint[] {
    const out: ClusterPoint[] = []
    for (const owner of this.providers) {
      for (const marker of owner.points()) out.push({ uid: `${owner.key}/${owner.idOf(marker)}`, marker, owner })
    }
    return out
  }

  /**
   * Diffuse les placements. Une couche absente de la table reçoit le placement
   * neutre : sans cela, une couche dont tous les points viennent d'être libérés
   * garderait ses markers masqués.
   *
   * Une couche dont le placement n'a PAS changé n'est pas notifiée. Le regroupement
   * est recalculé à ~11 Hz pendant un mouvement de caméra alors qu'il ne change
   * presque jamais ; sans ce filtre, chaque frame throttlée coûterait à chaque couche
   * un balayage complet de ses points et une repose de ses nœuds. Le juge est ici,
   * une fois, plutôt que dans chaque couche.
   */
  place(byContributor: ReadonlyMap<ClusterContributor, ClusterPlacement>): void {
    for (const owner of this.providers) {
      const next = byContributor.get(owner) ?? NO_PLACEMENT
      if (samePlacement(this.last.get(owner) ?? NO_PLACEMENT, next)) continue
      this.last.set(owner, next)
      owner.place(next)
    }
  }
}
