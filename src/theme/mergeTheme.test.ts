import { describe, expect, it } from 'vitest'
import { defaultTheme } from './defaultTheme'
import { deepMerge, mergeTheme } from './mergeTheme'

describe('deepMerge', () => {
  // CE test est celui que cite `mergeTheme` pour justifier sa copie défensive. Le
  // retour par référence n'est pas un détail d'implémentation : c'est le contrat sur
  // lequel repose l'invariant « pas d'override, pas de nouvel objet », donc la
  // stabilité d'identité dont dépendent les mémoïsations en aval.
  it('renvoie la base PAR RÉFÉRENCE quand il n’y a pas d’override', () => {
    const base = { a: 1, nested: { b: 2 } }
    expect(deepMerge(base, undefined)).toBe(base)
  })

  it('ne mute jamais la base', () => {
    const base = { a: 1, nested: { b: 2, c: 3 } }
    const merged = deepMerge(base, { nested: { b: 99 } })
    expect(base.nested.b).toBe(2)
    expect(merged).toEqual({ a: 1, nested: { b: 99, c: 3 } })
  })

  it('remplace les tableaux en bloc au lieu de les fusionner', () => {
    // Un tableau à moitié fusionné (index par index) n'aurait aucun sens : une liste
    // de trois paliers écrasée par une de deux en laisserait un troisième fantôme.
    expect(deepMerge({ widths: [1, 2, 3] }, { widths: [9] })).toEqual({ widths: [9] })
  })

  it('remplace les fonctions en bloc', () => {
    const next = () => 2
    expect(deepMerge({ easing: () => 1 }, { easing: next }).easing).toBe(next)
  })
})

describe('mergeTheme', () => {
  it('coupe les animations sous prefers-reduced-motion', () => {
    expect(mergeTheme(defaultTheme, undefined, { prefersReducedMotion: true }).animations.enabled).toBe(false)
  })

  it('n’écrit PAS dans la base quand il coupe les animations', () => {
    // La régression que ce test verrouille : sans override, `deepMerge` renvoie la
    // base par référence (cf. plus haut), si bien qu'une affectation sur le résultat
    // atteignait `defaultTheme` lui-même — un singleton exporté publiquement. Un seul
    // utilisateur en `prefers-reduced-motion: reduce` figeait donc les animations pour
    // TOUTE l'application, y compris les cartes montées ensuite.
    const before = defaultTheme.animations.enabled
    mergeTheme(defaultTheme, undefined, { prefersReducedMotion: true })
    expect(defaultTheme.animations.enabled).toBe(before)
  })

  it('laisse la main à un override explicite', () => {
    const merged = mergeTheme(defaultTheme, { animations: { enabled: true } }, { prefersReducedMotion: true })
    expect(merged.animations.enabled).toBe(true)
  })
})

describe('teintes de sélection des bâtiments', () => {
  it('distingue survol et sélection', () => {
    // Deux teintes distinctes : le bâtiment sous le menu ouvert ne doit pas se lire
    // comme celui qu'on survole en passant.
    expect(defaultTheme.globe.buildingHoverColor).not.toBe(defaultTheme.globe.buildingSelectColor)
  })
})

describe('tailles du catalogue', () => {
  it('garde les tailles voisines à la surcharge partielle', () => {
    const merged = mergeTheme(defaultTheme, { sizing: { catalogRowHeight: 44 } })
    expect(merged.sizing.catalogRowHeight).toBe(44)
    expect(merged.sizing.catalogIndent).toBe(defaultTheme.sizing.catalogIndent)
    expect(merged.sizing.panelMaxHeight.catalog).toBe(defaultTheme.sizing.panelMaxHeight.catalog)
  })

  it('donne une hauteur de ligne strictement positive', () => {
    // `visibleWindow` retombe sur une fenêtre VIDE si elle ne l'est pas : un défaut à 0
    // rendrait la liste blanche sans la moindre erreur.
    expect(defaultTheme.sizing.catalogRowHeight).toBeGreaterThan(0)
  })
})
