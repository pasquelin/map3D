import { useCallback, useMemo, useRef } from 'react'
import type { MarkerData } from '../../data/types'
import type { ShapeSymbol } from '../../layers/DrawLayer'
import type { LatLng } from '../../shared'
import type { SymbolCatalog, SymbolRenderer } from '../../symbols/types'
import { useConfig, useLabels } from '../context'
import type { MenuItem } from './ContextMenu'
import { MarkerLayer, type MarkerLayerProps, svgToDataUri } from './MarkerLayer'

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
  /**
   * Participation au regroupement COMMUN de la carte (cf. `<Map cluster>`). Les
   * symboles y entrent d'office : posés à la douzaine sur une même zone, ils se
   * recouvrent sans rien dire de ce qu'ils cachent — et ils se regroupent avec les
   * markers de l'application, puisqu'un cluster regroupe ce qui se superpose à
   * l'écran, d'où que viennent les points.
   *
   * `{ enabled: false }` les en sort : un marker par symbole, à tout zoom.
   */
  cluster?: MarkerLayerProps<PlacedSymbolShape>['cluster']
  /**
   * Zoom en deçà duquel les symboles posés disparaissent — à la place de
   * `config.markers.staticMinZoom`, et lui-même surclassé par le `minZoom` d'une
   * entrée de catalogue. La cascade va donc du plus général au plus précis :
   * config → couche → genre de symbole.
   */
  minZoom?: number
  /** Nouvelle position après déplacement du marker. */
  onMove: (id: string, at: LatLng) => void
  /**
   * Menu contextuel au clic — **parité stricte avec les markers** : un symbole posé
   * s'ouvre au clic comme n'importe quel marker (cf. `MarkerLayer.menu`). Construit par
   * `<DrawLayer>` avec « Supprimer » (la lib possède la forme) suivi du `markerMenu` de
   * l'hôte lié aux relations, exactement comme un marker de données.
   */
  menu?: (m: MarkerData<PlacedSymbolShape>) => MenuItem[]
  /**
   * Outil **gomme** actif : un clic sur un symbole le supprime (via `onErase`) au lieu
   * d'ouvrir le menu, et le déplacement est neutralisé — un symbole s'efface alors
   * comme n'importe quelle forme.
   */
  eraseMode?: boolean
  /** Suppression d'un symbole par la gomme. */
  onErase?: (id: string) => void
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
export function SymbolMarkers({
  shapes,
  catalog,
  renderer,
  size: sizeProp,
  ready,
  cluster,
  minZoom,
  onMove,
  menu,
  eraseMode,
  onErase,
}: SymbolMarkersProps) {
  // Taille écran d'un symbole posé. Hook appelé INCONDITIONNELLEMENT (cf. `ToolButton`).
  const symbolsCfg = useConfig().interaction.symbols
  const size = sizeProp ?? symbolsCfg.sizePx
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
          // DÉCOR fixe : masqué au dézoom (cf. `MarkerData.static`). Le seuil n'est
          // porté par le POINT que si le catalogue le fait dépendre du genre de
          // symbole — un poste de commandement se voit de loin, un point de contrôle
          // non. Sinon `true` s'en remet à la couche, qui s'en remet à la config.
          static: entry?.minZoom === undefined ? true : { minZoom: entry.minZoom },
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

  const reposition = useCallback((m: MarkerData<PlacedSymbolShape>, at: LatLng) => onMove(m.data.id, at), [onMove])

  // Clic-gomme : supprime le symbole cliqué. Passé à `onSelect` UNIQUEMENT en mode
  // gomme (le menu est alors coupé) — un clic efface, comme sur une forme.
  const eraseClick = useCallback((m: MarkerData<PlacedSymbolShape> | null) => m && onErase?.(m.data.id), [onErase])

  return (
    <MarkerLayer<PlacedSymbolShape>
      points={points}
      getId={getSymbolId}
      size={size}
      cluster={cluster}
      staticMinZoom={minZoom}
      icon={icon}
      typeLabel={symbolTypeLabel}
      // Parité markers : le clic ouvre le menu contextuel. En mode gomme, le menu cède
      // la place à la suppression au clic (`onSelect`), et le geste de déplacement est
      // neutralisé pour qu'un clic efface au lieu de traîner le symbole.
      menu={eraseMode ? undefined : menu}
      onSelect={eraseMode ? eraseClick : undefined}
      // Deux gestes distincts et complémentaires : l'ICÔNE se saisit au long-press
      // vers la dock (comme tout marker), le POINT AU SOL se glisse pour repositionner.
      // Coupés en mode gomme.
      draggable={!eraseMode}
      repositionable={eraseMode ? false : undefined}
      onReposition={reposition}
    />
  )
}

/** Hors composant : une flèche inline invaliderait le `useMemo` des portails. */
const getSymbolId = (m: MarkerData<PlacedSymbolShape>): string | number => m.id
