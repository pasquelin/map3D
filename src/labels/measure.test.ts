import { describe, expect, it } from 'vitest'
import { defaultLabels } from './defaultLabels'
import { mergeLabels } from './mergeLabels'
import { makeDistanceFormatter, makeDurationFormatter } from './measure'

const distance = (over?: Parameters<typeof mergeLabels>[1]) =>
  makeDistanceFormatter(mergeLabels(defaultLabels, over).measure)

describe('makeDistanceFormatter', () => {
  it('bascule sur la grande unité au seuil', () => {
    const f = distance()
    expect(f(999)).toContain('999')
    // Séparateur laissé libre : `numberLocale` vaut `'auto'` par défaut, donc suit
    // l'environnement — c'est précisément ce que ce défaut promet.
    expect(f(2400)).toMatch(/2[.,]4/)
  })

  it('respecte la locale au lieu d’imposer le point décimal', () => {
    // La régression que ce test verrouille : `toFixed` écrivait « 2.40 km » sous des
    // libellés français qui promettent « 2,4 km », et gardait le zéro de fin.
    const f = distance({ measure: { numberLocale: 'fr-FR' } })
    expect(f(2400)).toContain('2,4')
    expect(f(2400)).not.toContain('2.40')
  })

  it('supprime les décimales d’un compte rond', () => {
    expect(distance({ measure: { numberLocale: 'fr-FR' } })(2000)).not.toContain(',00')
  })

  it('sait rendre un système impérial sans toucher au code', () => {
    // Tout l'objet du passage de `kilometers`/`meters` à `major`/`minor` : le système
    // métrique était câblé en dur (bascule à 1000, division par 1000), si bien qu'aucune
    // traduction ne pouvait produire des miles.
    const f = distance({
      measure: {
        numberLocale: 'en-US',
        major: '{value} mi',
        minor: '{value} ft',
        majorThreshold: 1609.344,
        majorFactor: 1609.344,
        minorFactor: 0.3048,
        majorDecimals: 1,
        minorDecimals: 0,
      },
    })
    expect(f(1609.344)).toBe('1 mi')
    expect(f(30.48)).toBe('100 ft')
  })
})

describe('makeDurationFormatter', () => {
  const f = makeDurationFormatter(defaultLabels.duration)

  it('rend les secondes sous la minute', () => {
    expect(f(45)).toContain('45')
  })

  it('rend les minutes sous l’heure', () => {
    expect(f(600)).toContain('10')
  })

  it('omet les minutes d’une heure pile', () => {
    expect(f(3600)).not.toContain('0 min')
  })

  it('n’affiche jamais de durée négative', () => {
    expect(f(-10)).toContain('0')
  })
})
