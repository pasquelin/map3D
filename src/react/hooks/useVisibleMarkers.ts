import { useMemo } from 'react'
import type { TagFilter } from '../../core/TagFilter'
import { staticMinZoomOf } from '../../data/types'
import type { MarkerData } from '../../data/types'
import { useZoomGate } from './useZoomGate'

/**
 * Réapplique les exemptions (sélection/suivi) sur `base` : les ids non déjà présents dans
 * `base` sont réinjectés depuis `pool`. Rend la MÊME référence `base` quand aucune exemption
 * n'est nécessaire (cas courant), pour ne pas invalider l'index de regroupement en aval.
 */
function applyExemptions<T>(
  base: MarkerData<T>[],
  pool: MarkerData<T>[],
  ids: Array<string | number | undefined>,
  getId: (p: MarkerData<T>) => string | number,
): MarkerData<T>[] {
  const exempt = ids.filter((id) => id !== undefined && !base.some((p) => getId(p) === id))
  if (exempt.length === 0) return base
  return [...base, ...pool.filter((p) => exempt.includes(getId(p)))]
}

/**
 * Pipeline de visibilité d'une couche de markers : filtre « Couches » (tags), gate de
 * zoom des `static`, et exemptions (sélection/suivi) réappliquées en second sur chacun
 * des deux étages — cf. `MarkerLayer` pour le détail de chaque décision.
 *
 * Extrait tel quel de `MarkerLayer` (mêmes `useMemo`/deps, y compris les
 * `eslint-disable exhaustive-deps` existants) : le corps ne change pas, seul l'appelant
 * change.
 */
export function useVisibleMarkers<T>(
  allPoints: MarkerData<T>[],
  tagFilter: TagFilter,
  selectedId: string | number | undefined,
  followId: string | number | undefined,
  staticMinZoomProp: number | undefined,
  configStaticMinZoom: number,
  getId: (p: MarkerData<T>) => string | number,
): { points: MarkerData<T>[]; rendered: MarkerData<T>[] } {
  // Le marker SÉLECTIONNÉ et celui qui est SUIVI échappent au filtre : masquer ce
  // sur quoi la carte est centrée (ou ce que la caméra suit) ferait disparaître la
  // cible sans explication, et le suivi perdrait sa position en cours de route.
  const visible = useMemo(
    () => (tagFilter.isActive ? allPoints.filter((p) => tagFilter.isVisible(p.tags)) : allPoints),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPoints, tagFilter.selectionVersion],
  )
  /**
   * Les exemptions sont ajoutées EN SECOND, et seulement quand le filtre les masque
   * vraiment : le cas courant (cible déjà visible, ou aucun filtre) rend alors la
   * MÊME référence de tableau. Les inclure dans le filtre lui-même faisait qu'un
   * simple clic de sélection produisait un tableau neuf, donc un rechargement complet
   * de l'index supercluster (O(n log n)) et un rebuild de tous les portails —
   * précisément quand un filtre est actif, c'est-à-dire quand la liste est grande.
   */
  const points = useMemo(() => {
    return applyExemptions(visible, allPoints, [selectedId, followId], getId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, allPoints, selectedId, followId])

  /**
   * Gate de zoom des markers `static` (décor fixe : symboles posés, défibrillateurs).
   *
   * Contrairement au filtre de tags, il ne s'applique QU'À L'AFFICHAGE : `points`
   * reste complet et continue d'alimenter la recherche, la loupe et le panneau
   * « Couches ». Un seuil de zoom dit ce qui est lisible, pas ce que l'utilisateur a
   * choisi de masquer — chercher « défibrillateur » doit le trouver et y voler quel
   * que soit le zoom, là où un calque décoché doit disparaître partout.
   *
   * `rendered` alimente en revanche supercluster ET la pose des nœuds : un statique
   * masqué disparaît donc de la carte et cesse du même geste de gonfler le total des
   * clusters. Un cluster ne compte jamais que ce qu'il cache réellement.
   */
  // Seuil de CETTE couche, comme `size` : deux cartes de la même app — alertes denses
  // d'un côté, décor de l'autre — n'ont pas le même horizon de lisibilité. Un marker
  // garde le dernier mot avec `static: { minZoom }`.
  const staticMinZoom = staticMinZoomProp ?? configStaticMinZoom
  /**
   * Seuil de chaque point du décor, et la liste des seuils à surveiller. Les deux
   * sortent d'un balayage UNIQUE : les calculer séparément appelait `staticMinZoomOf`
   * deux fois par point et par rendu, pour la même réponse.
   */
  const { thresholds, minZoomOf } = useMemo(() => {
    const set = new Set<number>()
    const byPoint = new Map<MarkerData<T>, number>()
    for (const p of points) {
      const min = staticMinZoomOf(p, staticMinZoom)
      if (min !== null && min > 0) {
        set.add(min)
        byPoint.set(p, min)
      }
    }
    return { thresholds: [...set], minZoomOf: byPoint }
  }, [points, staticMinZoom])
  const zoomAllows = useZoomGate(thresholds)
  /**
   * Décor masqué par le zoom, INDÉPENDANT de la sélection.
   *
   * L'indépendance est le point : ce mémo alimente l'index de regroupement, et le
   * refaire dépendre de `selectedId` rendait un tableau neuf à chaque clic dès qu'un
   * seul statique était masqué — donc un rechargement de l'index (O(n log n)) et un
   * rebuild de tous les portails, alors que rien n'avait bougé sur la carte.
   */
  const gated = useMemo(() => {
    if (minZoomOf.size === 0) return points
    const out = points.filter((p) => {
      const min = minZoomOf.get(p)
      return min === undefined || zoomAllows(min)
    })
    // Au-dessus de tous les seuils, rien n'est masqué : rendre la MÊME référence.
    return out.length === points.length ? points : out
  }, [points, minZoomOf, zoomAllows])
  /**
   * Exemptions ajoutées EN SECOND, et seulement quand le zoom masque vraiment la
   * cible : on ne fait pas disparaître ce sur quoi la carte est centrée ni ce que la
   * caméra suit, fût-ce du décor. Même construction que `points` ci-dessus.
   */
  const rendered = useMemo(() => {
    if (gated === points) return gated
    return applyExemptions(gated, points, [selectedId, followId], getId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gated, points, selectedId, followId])

  return { points, rendered }
}
