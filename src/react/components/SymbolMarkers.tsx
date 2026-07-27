import { useCallback, useMemo, useRef } from 'react'
import type { MarkerData } from '../../data/types'
import type { ShapeSymbol } from '../../layers/DrawLayer'
import type { LatLng } from '../../shared'
import type { SymbolCatalog, SymbolRenderer } from '../../symbols/types'
import { useLabels } from '../context'
import { MarkerLayer, svgToDataUri } from './MarkerLayer'

/** Symbole posé, tel que le fournit la couche de dessin. */
export type PlacedSymbolShape = {
  id: string
  at: LatLng
  symbol: ShapeSymbol
  tags: readonly string[]
  /**
   * Graphisme et libellé résolus, embarqués dans la donnée du marker — donc dans la
   * **charge du drag**. Sans eux, un hôte qui reçoit un symbole déposé (dock de
   * favoris, panier…) n'a qu'une clé de catalogue et ne peut ni l'afficher ni le
   * nommer, le renderer étant encapsulé dans la couche de dessin.
   */
  svg?: string
  label?: string
  /** Catégorie du catalogue (le libellé traduit vit dans `labels.symbols`). */
  category?: string
  /**
   * Couleur de l'**affiliation** — c'est elle qui identifie un symbole d'un coup
   * d'œil hors de la carte (pastille de favori, puce de liste), là où la catégorie
   * ne dit que le genre d'objet.
   */
  color?: string
}

export type SymbolMarkersProps = {
  shapes: PlacedSymbolShape[]
  catalog: SymbolCatalog
  renderer: SymbolRenderer
  /** Taille (px) à l'écran — constante, contrairement à une emprise au sol. */
  size?: number
  /**
   * Le renderer répond-il ? Bascule à `true` quand son graphisme devient
   * disponible, et c'est ce qui déclenche le recalcul des SVG embarqués : sans ce
   * signal, `render()` ayant rendu `null` avant le chargement, la charge du drag
   * resterait dépourvue de graphisme jusqu'au prochain changement de `shapes`.
   */
  ready?: boolean
  /** Nouvelle position après déplacement du marker. */
  onMove: (id: string, at: LatLng) => void
}

/** Vignette neutre tant que le graphisme n'est pas disponible (SDK en vol). */
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-opacity=".5" stroke-dasharray="3 2"/></svg>'

/**
 * Rendu des symboles posés, en **markers DOM**.
 *
 * C'est le bon support pour un pictogramme : toujours face à l'écran et de taille
 * constante, donc lisible à tout zoom et sous toute inclinaison — là où un quad
 * drapé au sol s'écrase en trait en vue rasante. Les emprises au sol (rect, cercle,
 * polygone) restent, elles, rendues en WebGL par la couche de dessin.
 *
 * L'état ne vit PAS ici : il reste dans la collection de dessin, ce qui donne aux
 * symboles l'historique undo/redo, le GeoJSON et les events par forme sans rien
 * dupliquer. Ce composant ne fait que projeter et remonter les déplacements.
 */
export function SymbolMarkers({ shapes, catalog, renderer, size = 40, ready, onMove }: SymbolMarkersProps) {
  const byKey = useMemo(() => new Map(catalog.entries.map((e) => [e.key, e])), [catalog])
  // Tous les symboles portent le type `'symbol'` : leur rubrique de recherche est
  // unique, et son nom vient de la lib (l'application n'a pas déclaré ce type).
  const symbolsLabel = useLabels().search.groups.symbol
  const symbolTypeLabel = useCallback(() => symbolsLabel, [symbolsLabel])

  // Data-URI par graphisme, mémoïsé sur la DURÉE DE VIE du composant : encoder un
  // SVG MIL-STD n'est pas gratuit, et plusieurs symboles partagent le même dessin
  // (dix véhicules amis = une seule icône). La clé couvre ce qui change le dessin.
  const uriCache = useRef(new Map<string, string>())
  const iconUri = (key: string, variant: string | undefined, svg: string | undefined): string | undefined => {
    if (!svg) return undefined
    const k = `${key}/${variant ?? ''}`
    let uri = uriCache.current.get(k)
    if (uri === undefined) {
      uri = svgToDataUri(svg)
      uriCache.current.set(k, uri)
    }
    return uri
  }

  const points = useMemo<MarkerData<PlacedSymbolShape>[]>(
    () =>
      shapes.map((s) => {
        const svg = renderer.render(s.symbol.key, { size, variant: s.symbol.variant })?.svg
        const entry = byKey.get(s.symbol.key)
        return {
          id: s.id,
          position: s.at,
          type: 'symbol',
          // Le libellé de catalogue (déjà traduit) EST l'identité du symbole : titre
          // au survol, en liste, et texte indexé par la recherche — un seul champ
          // sert les trois, là où un `tooltip` dédié n'aurait servi que le survol.
          title: entry?.label,
          content: entry?.description,
          tags: [...s.tags],
          // Déplaçable : le drapeau vit sur la donnée, comme pour tout marker éditable.
          repositionable: true,
          // Repère des LISTES (loupe, sélection) : le dessin du symbole, pas une
          // pastille de couleur. Le type vaut `'symbol'` pour tous — il ne distingue
          // rien, là où le pictogramme dit d'un coup d'œil ce qui est posé.
          icon: iconUri(s.symbol.key, s.symbol.variant, svg),
          data: {
            ...s,
            svg,
            label: entry?.label,
            category: entry?.category,
            color: s.symbol.variant ? catalog.variantColors?.[s.symbol.variant] : undefined,
          },
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shapes, renderer, ready, size, byKey, catalog],
  )

  // Callbacks STABLES. `icon` et `tooltip` sont dans les deps du `useMemo` des
  // portails de `MarkerLayer`, et `icon` y vide en plus le cache d'encodage SVG :
  // en flèches inline, chaque frame d'un tracé en cours (qui re-rend `<DrawLayer>`)
  // reconstruisait les N portails et ré-encodait N SVG MIL-STD de plusieurs Ko.
  //
  // `icon` lit le graphisme DÉJÀ résolu dans `points` au lieu de rappeler le
  // renderer par marker — c'est le même rendu, payé une fois.
  const icon = useCallback((m: MarkerData<PlacedSymbolShape>) => m.data.svg ?? PLACEHOLDER_SVG, [])

  const reposition = useCallback(
    (m: MarkerData<PlacedSymbolShape>, at: LatLng) => onMove(m.data.id, at),
    [onMove],
  )

  return (
    <MarkerLayer<PlacedSymbolShape>
      points={points}
      getId={getSymbolId}
      size={size}
      icon={icon}
      typeLabel={symbolTypeLabel}
      // Deux gestes distincts et complémentaires : l'ICÔNE se saisit au long-press
      // vers la dock (comme tout marker), le POINT AU SOL se glisse pour repositionner.
      draggable
      onReposition={reposition}
    />
  )
}

/** Hors composant : une flèche inline invaliderait le `useMemo` des portails. */
const getSymbolId = (m: MarkerData<PlacedSymbolShape>): string | number => m.id
