import { describe, expect, it } from 'vitest'
import { defaultLabels } from './defaultLabels'
import { formatCount, formatLabel, mergeLabels, symbolText } from './mergeLabels'

// Ces helpers portent des décisions de LANGUE (interpolation, pluriel, traduction du
// catalogue) qu'aucun composant ne doit reprendre à la main — c'est tout l'intérêt de les
// centraliser. Les tests figent le contrat pour que la règle reste unique.

describe('formatLabel', () => {
  it('interpole les variables {nom} présentes dans les params', () => {
    expect(formatLabel('Bordure {width} px', { width: 4 })).toBe('Bordure 4 px')
    expect(formatLabel('{a} et {b}', { a: 'x', b: 'y' })).toBe('x et y')
  })

  it('laisse intact un placeholder sans valeur (jamais de "undefined" affiché)', () => {
    expect(formatLabel('Bonjour {nom}', {})).toBe('Bonjour {nom}')
  })
})

describe('formatCount', () => {
  const plural = defaultLabels.plural

  it('applique la règle française : 0 et 1 au singulier, 2+ au pluriel', () => {
    // En français, zéro est singulier — c'est la règle des labels, pas des composants.
    expect(formatCount('{count} forme', '{count} formes', 0, plural)).toBe('0 forme')
    expect(formatCount('{count} forme', '{count} formes', 1, plural)).toBe('1 forme')
    expect(formatCount('{count} forme', '{count} formes', 2, plural)).toBe('2 formes')
  })

  it('délègue le choix de la forme à la fonction plural fournie', () => {
    // Règle anglaise (1 = singulier, 0 = pluriel) : le helper ne présume rien.
    const en = (n: number): 'one' | 'other' => (n === 1 ? 'one' : 'other')
    expect(formatCount('{count} shape', '{count} shapes', 0, en)).toBe('0 shapes')
    expect(formatCount('{count} shape', '{count} shapes', 1, en)).toBe('1 shape')
  })
})

describe('symbolText', () => {
  const withTranslation = mergeLabels(defaultLabels, {
    symbols: { catalog: { unit: { label: 'Unit', description: 'A unit' } } },
  })

  it('utilise la traduction du catalogue quand la locale couvre la clé', () => {
    const out = symbolText(withTranslation, { key: 'unit', label: 'Unité', description: 'Une unité' })
    expect(out).toEqual({ label: 'Unit', description: 'A unit' })
  })

  it("retombe sur les textes de l'entrée quand la clé n'est pas traduite", () => {
    const out = symbolText(defaultLabels, { key: 'depot', label: 'Dépôt', description: 'Un dépôt' })
    expect(out).toEqual({ label: 'Dépôt', description: 'Un dépôt' })
  })

  it('recouvre partiellement : label traduit, description repliée sur la source', () => {
    const partial = mergeLabels(defaultLabels, { symbols: { catalog: { unit: { label: 'Unit' } } } })
    const out = symbolText(partial, { key: 'unit', label: 'Unité', description: 'Une unité' })
    expect(out).toEqual({ label: 'Unit', description: 'Une unité' })
  })
})

describe('mergeLabels', () => {
  it('fusionne en profondeur un override partiel sans muter la base', () => {
    const before = structuredClone(defaultLabels.symbols.catalog)
    const merged = mergeLabels(defaultLabels, { symbols: { catalog: { x: { label: 'X' } } } })
    expect(merged.symbols.catalog.x).toEqual({ label: 'X' })
    // Base inchangée — comparée à son propre état d'avant merge, pas au fait qu'elle soit vide.
    expect(defaultLabels.symbols.catalog).toEqual(before)
  })
})
