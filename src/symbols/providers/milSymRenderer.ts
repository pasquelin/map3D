import { defaultConfig } from '../../config/defaultConfig'
import { LruMap } from '../../core/LruMap'
import type { SymbolRenderer, SymbolRenderOptions, RenderedSymbol } from '../types'
import type { MilSymAffiliation } from './milSymCatalog'
import { milSymSidc } from './milSymCatalog'

/**
 * Mécanique de rendu MIL-STD-2525D adossée au SDK officiel `@armyc2.c5isr.renderer`.
 *
 * Le SDK pèse ~9 Mo : il est chargé par **import dynamique**, donc dans un chunk
 * séparé qui ne part qu'à la première carte qui l'utilise — un consommateur de
 * map3d qui n'affiche pas de symboles ne le télécharge jamais. Les données du
 * catalogue (SIDC, libellés) vivent dans `milSymCatalog.ts`, sans dépendance au SDK.
 */

type MilSymModule = typeof import('@armyc2.c5isr.renderer/mil-sym-ts-web')

// Le SDK n'est PAS idempotent à l'initialisation : la promesse est mémoïsée au niveau
// du module pour que plusieurs cartes (ou plusieurs providers) n'appellent jamais
// `initialize()` deux fois.
let modulePromise: Promise<MilSymModule> | null = null

function loadMilSym(): Promise<MilSymModule> {
  modulePromise ??= import('@armyc2.c5isr.renderer/mil-sym-ts-web').then(async (mod) => {
    if (!mod.isReady()) await mod.initialize()
    return mod
  })
  return modulePromise
}

export type MilSymRendererOptions = {
  /** Affiliation par défaut quand `render` ne reçoit pas de `variant` (défaut `friendly`). */
  affiliation?: MilSymAffiliation
  /** Taille de rendu par défaut en px (défaut 40). */
  size?: number
  /** Notifiée si le SDK ne charge pas — sinon l'échec est silencieux (placeholders). */
  onError?: (error: unknown) => void
  /**
   * Plafond du cache de vignettes rendues (défaut `providers.symbols.cacheMaxEntries`).
   * `0` = illimité — l'ancien comportement, à n'utiliser que sur un catalogue borné
   * affiché à taille fixe.
   */
  cacheMaxEntries?: number
}

/**
 * Fournisseur de rendu MIL-STD pour `<DrawLayer symbols={{ renderer }}>`.
 *
 * `render` est synchrone par contrat : il renvoie `null` tant que le SDK n'est pas
 * chargé (la couche affiche un placeholder puis se re-rend sur `ready`), et sert
 * ensuite depuis un cache par SIDC+taille — le rendu SVG du SDK est coûteux et il est
 * appelé à chaque rendu React.
 */
export function createMilSymRenderer(opts: MilSymRendererOptions = {}): SymbolRenderer {
  const defaultAffiliation = opts.affiliation ?? 'friendly'
  const defaultSize = opts.size ?? 40
  const maxEntries = opts.cacheMaxEntries ?? defaultConfig.providers.symbols.cacheMaxEntries
  /**
   * La clé combine SIDC ET taille, or la taille varie avec le zoom pour les
   * vignettes : sans borne, la table croîtrait indéfiniment, chaque entrée
   * retenant un SVG rendu. `maxEntries <= 0` = illimité (cf. JSDoc de
   * `cacheMaxEntries`) — le `LruMap` traite déjà ce cas (pas d'éviction).
   */
  const cache = new LruMap<string, RenderedSymbol>(maxEntries)
  let mod: MilSymModule | null = null

  const ready = loadMilSym()
    .then((m) => {
      mod = m
    })
    .catch((error: unknown) => {
      opts.onError?.(error)
    })

  return {
    ready,
    render: (key, options?: SymbolRenderOptions): RenderedSymbol | null => {
      if (!mod) return null
      const affiliation = (options?.variant as MilSymAffiliation | undefined) ?? defaultAffiliation
      const size = options?.size ?? defaultSize
      const sidc = milSymSidc(key, affiliation)
      if (!sidc) return null

      const cacheKey = `${sidc}/${size}`
      // `LruMap.get` promeut déjà en fin d'ordre sur un hit — vrai LRU, pas un FIFO
      // qui jetterait l'entrée la plus ancienne même si c'est la plus consultée.
      const cached = cache.get(cacheKey)
      if (cached) return cached

      try {
        const attributes = new Map<string, string>([[mod.MilStdAttributes.PixelSize, String(size)]])
        const info = mod.MilStdIconRenderer.getInstance().RenderSVG(sidc, new Map(), attributes)
        if (!info) return null
        const rendered = anchorAtCenter(
          info.getSVG(),
          info.getSymbolCenterX(),
          info.getSymbolCenterY(),
          info.getImageBounds().getWidth(),
          info.getImageBounds().getHeight(),
        )
        cache.set(cacheKey, rendered)
        return rendered
      } catch (error) {
        opts.onError?.(error)
        return null
      }
    },
  }
}

/**
 * Réenveloppe le SVG du SDK dans un carré dont le CENTRE est le point d'ancrage du
 * symbole — le contrat de `RenderedSymbol`.
 *
 * Pourquoi ce n'est pas cosmétique : l'ancre MIL-STD n'est pas le centre de l'image
 * (un poste de commandement pend sous son mât, une flèche part de sa pointe). Poser
 * le centre de l'image sur la coordonnée décalerait le symbole de plusieurs pixels
 * par rapport au terrain, et l'erreur grandirait avec la taille de rendu.
 *
 * Le côté du carré est `2 × max(distance de l'ancre à chaque bord)` : c'est la plus
 * petite boîte centrée sur l'ancre qui contient encore tout le dessin. Le SVG
 * d'origine est imbriqué tel quel (SVG accepte un `<svg>` enfant positionné) plutôt
 * que réécrit : aucune analyse de son contenu, donc rien à casser.
 */
function anchorAtCenter(svg: string, cx: number, cy: number, w: number, h: number): RenderedSymbol {
  const side = 2 * Math.max(cx, w - cx, cy, h - cy)
  // Dimensions inexploitables (SDK en échec) : on rend le SVG tel quel plutôt que de
  // produire un viewBox dégénéré.
  if (!Number.isFinite(side) || side <= 0) return { svg, size: Math.max(w, h) || 40 }
  const x = side / 2 - cx
  const y = side / 2 - cy
  // La balise ouvrante est cherchée où qu'elle soit, et non ancrée au tout premier
  // caractère : le SDK peut préfixer une déclaration XML ou un espace, auquel cas un
  // motif ancré échouerait SANS ERREUR — le symbole serait alors rendu sans décalage
  // d'ancrage, donc discrètement décalé par rapport au terrain. La déclaration
  // éventuelle est retirée au passage : elle est invalide dans un SVG imbriqué.
  const openTag = svg.search(/<svg[\s>]/)
  if (openTag < 0) return { svg, size: Math.max(w, h) || 40 }
  const inner = `<svg x="${round(x)}" y="${round(y)}"${svg.slice(openTag + 4)}`
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(side)} ${round(side)}" width="${round(side)}" height="${round(side)}">${inner}</svg>`,
    size: Math.round(side),
  }
}

const round = (n: number): number => Math.round(n * 100) / 100
