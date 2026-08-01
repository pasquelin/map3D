import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LatLng } from '../../shared'
import { type DrawLayer as CoreDrawLayer, type DrawTool } from '../../layers/DrawLayer'
import { MILSYM_CATALOG, createMilSymRenderer } from '../../symbols/providers/milSym'
import type { SymbolCatalog, SymbolRenderer } from '../../symbols/types'
import { useMapDropZone } from './useMapDropZone'
import { SYMBOL_DRAG_TYPE } from '../components/SymbolPaletteButton'
import { useYieldsTool } from '../components/DrawLayer'

/** Sous-ensemble de `DrawLayerProps.symbols` consommé par le sous-système. */
type DrawSymbolsProps = {
  enabled?: boolean
  catalog?: SymbolCatalog
  renderer?: SymbolRenderer
}

/**
 * Sous-système Symboles de `<DrawLayer>` : outil palette (chargement paresseux du SDK
 * MIL-STD-2525D), affiliation courante, dépôt d'une vignette sur la carte, et symboles
 * déjà posés (`symbolShapes`). Extrait tel quel de `DrawLayer`.
 */
export function useDrawSymbols(
  symbols: DrawSymbolsProps | undefined,
  cacheMaxEntries: number,
  coreRef: RefObject<CoreDrawLayer | null>,
  toolRef: RefObject<DrawTool | null>,
  setTool: (t: DrawTool | null) => void,
  coreReady: boolean,
): {
  symbolsEnabled: boolean
  symbolCatalog: SymbolCatalog
  renderer: SymbolRenderer | null
  symbolsReady: boolean
  affiliation: string
  setAffiliation: (a: string) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  symbolShapes: ReturnType<CoreDrawLayer['symbolShapes']>
  moveSymbol: (id: string, at: LatLng) => void
} {
  const symbolsEnabled = symbols?.enabled ?? true
  const symbolCatalog = symbols?.catalog ?? MILSYM_CATALOG
  const providedRenderer = symbols?.renderer
  const lazyRenderer = useRef<SymbolRenderer | null>(null)
  const [symbolsReady, setSymbolsReady] = useState(false)
  const [affiliation, setAffiliation] = useState('friendly')
  // Palette ouverte, publiée par le bouton (cf. `paletteOpen`) : la barre en a
  // besoin pour son exclusivité visuelle, et c'est l'un des deux déclencheurs du
  // chargement de la symbologie.
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Même exclusivité que la loupe : ouvrir la palette abandonne l'outil de tracé.
  // On ne dessine pas un rectangle en posant un symbole, et deux boutons allumés
  // dans la barre ne diraient plus lequel des deux reçoit le prochain geste.
  useYieldsTool(paletteOpen, toolRef, setTool)
  // Le SDK, une fois chargé, le reste : refermer la palette ne doit pas démonter la
  // couche de symboles ni relancer un téléchargement à la réouverture.
  const graphicsWanted = useRef(false)
  if (paletteOpen) graphicsWanted.current = true

  // Symboles posés. La dépendance est la SIGNATURE des symboles, pas `rev` : ce
  // dernier bumpe à chaque frame d'un tracé en cours, ce qui reconstruisait la liste
  // (et re-diffait toute la couche marker) 60 fois par seconde sans qu'aucun symbole
  // ne bouge.
  const symbolsVersion = coreRef.current?.symbolsVersion() ?? ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const symbolShapes = useMemo(() => coreRef.current?.symbolShapes() ?? [], [symbolsVersion])

  // Callback STABLE : `<SymbolMarkers>` le transmet à `onReposition`, qui est dans les
  // deps du `useMemo` des portails. En flèche inline, chaque frame d'un tracé en cours
  // reconstruisait les portails de tous les symboles affichés.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const moveSymbol = useCallback((id: string, at: LatLng) => coreRef.current?.moveSymbol(id, at), [])

  /**
   * Y a-t-il quelque chose à dessiner en symboles ? Le renderer n'est instancié
   * qu'à cette condition, et c'est tout l'enjeu : `createMilSymRenderer()` lance
   * l'`import()` du SDK MIL-STD (~9 Mo) dans son constructeur. L'appeler depuis le
   * corps du composant — ou depuis un effet sans condition — le téléchargerait au
   * montage de <DrawLayer>, pour toute carte, y compris celles qui n'afficheront
   * jamais un symbole.
   *
   * Les deux déclencheurs légitimes : l'utilisateur ouvre la palette, ou la
   * collection contient déjà des symboles (import GeoJSON, restauration d'état).
   */
  const needsRenderer = symbolsEnabled && (graphicsWanted.current || symbolShapes.length > 0)
  // Le plafond du cache de vignettes vient de la config : sans l'argument, le
  // renderer retombait sur `defaultConfig`, donc `providers.symbols.cacheMaxEntries`
  // n'avait aucun effet sur le chemin par défaut — le seul emprunté en pratique.
  const renderer = needsRenderer
    ? (providedRenderer ?? (lazyRenderer.current ??= createMilSymRenderer({ cacheMaxEntries })))
    : null

  // Disponibilité du graphisme. L'abonnement porte sur le renderer EFFECTIF, celui
  // fourni compris : `SymbolRenderer.ready` est un contrat public, et un catalogue
  // custom asynchrone doit obtenir le rendu qui suit sa résolution comme le
  // catalogue par défaut. Sans lui, ses vignettes resteraient vides indéfiniment.
  useEffect(() => {
    if (!renderer) return
    if (!renderer.ready) {
      setSymbolsReady(true)
      return
    }
    let alive = true
    void renderer.ready.then(() => {
      if (alive) setSymbolsReady(true)
    })
    return () => {
      alive = false
    }
  }, [renderer])

  // Le core en a besoin dès qu'une forme `symbol` existe (import GeoJSON compris).
  useEffect(() => {
    if (coreRef.current) coreRef.current.symbolRenderer = renderer
    // `coreReady` couvre la première création du core, postérieure au premier rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, coreReady])

  // Dépôt d'une vignette de palette sur la carte → forme `kind: 'symbol'` posée à
  // la coordonnée visée. Le hook lit ses callbacks par ref : la zone n'est pas
  // ré-enregistrée à chaque rendu.
  const placeRef = useRef<(key: string, at: LatLng) => void>(() => {})
  placeRef.current = (key, at) => {
    if (symbolsEnabled) coreRef.current?.placeSymbol(key, at, affiliation)
  }
  useMapDropZone({
    accept: (p) => symbolsEnabled && p.type === SYMBOL_DRAG_TYPE,
    onDrop: (p, latLng) => {
      const key =
        typeof (p.data as { key?: unknown } | undefined)?.key === 'string'
          ? (p.data as { key: string }).key
          : typeof p.id === 'string'
            ? p.id
            : null
      if (key) placeRef.current(key, latLng)
    },
  })

  return {
    symbolsEnabled,
    symbolCatalog,
    renderer,
    symbolsReady,
    affiliation,
    setAffiliation,
    paletteOpen,
    setPaletteOpen,
    symbolShapes,
    moveSymbol,
  }
}
