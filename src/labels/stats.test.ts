import { describe, expect, it } from 'vitest'
import { defaultLabels } from './defaultLabels'
import { makeStatFormatter, statLabel } from './stats'
import type { MapLabels } from './types'

/**
 * Locale FIXÉE pour les assertions.
 *
 * Le défaut est `'auto'` (la locale du navigateur) — c'est le comportement voulu, mais il
 * rend les séparateurs dépendants de la machine : ces mêmes tests passeraient en France et
 * échoueraient sur une CI en `en-US`. On fixe donc ce qu'on affirme.
 */
function frenchFormatter(over: Partial<MapLabels['stats']> = {}) {
  return makeStatFormatter({
    ...defaultLabels,
    measure: { ...defaultLabels.measure, numberLocale: 'fr-FR' },
    stats: { ...defaultLabels.stats, ...over },
  })
}

const fmt = frenchFormatter()

describe('makeStatFormatter', () => {
  it('rend les octets dans l’unité qui se lit, et pas au-delà de ce que l’hôte déclare', () => {
    expect(fmt.bytes(512)).toBe('512 o')
    expect(fmt.bytes(1024)).toBe('1,0 Ko')
    expect(fmt.bytes(80 * 1024 * 1024)).toBe('80,0 Mo')
    // Deux unités seulement : on doit voir des milliers de Ko, jamais une unité inventée.
    expect(frenchFormatter({ byteUnits: ['o', 'Ko'] }).bytes(80 * 1024 * 1024)).toContain('Ko')
  })

  it('n’écrit pas de décimale sur des octets bruts — ils n’en ont pas', () => {
    expect(fmt.bytes(0)).toBe('0 o')
    expect(fmt.bytes(999)).toBe('999 o')
  })

  it('rend un ratio en pourcentage, via le gabarit des libellés', () => {
    expect(fmt.percent(1)).toBe('100 %')
    expect(fmt.percent(0.6)).toBe('60 %')
  })

  it('rend « — » plutôt qu’un NaN affiché à l’écran', () => {
    // Une grandeur pas encore mesurée (première frame) ne doit pas écrire « NaN » : le
    // panneau serait lu comme cassé alors qu'il attend simplement sa première valeur.
    expect(fmt.count(Number.NaN)).toBe('—')
    expect(fmt.bytes(Number.NaN)).toBe('—')
    expect(fmt.percent(Number.POSITIVE_INFINITY)).toBe('—')
    expect(fmt.scale(Number.NaN)).toBe('—')
  })

  it('choisit la mise en forme d’après la GRANDEUR, pas d’après l’appelant', () => {
    // C'est ce qui permet à `StatsLayer` d'écrire toutes ses cellules dans une seule
    // boucle, sans savoir ce que chacune représente.
    expect(fmt.field('tileBytes', 1024 * 1024)).toBe('1,0 Mo')
    expect(fmt.field('paintedRatio', 0.9)).toBe('90 %')
    expect(fmt.field('resolutionScale', 0.75)).toBe('0,75')
    // La cadence porte UNE décimale : à l'entier près elle danse entre 59 et 60.
    expect(fmt.field('fps', 59.94)).toBe('59,9')
    // Un compte est un entier, séparateurs de milliers compris.
    expect(fmt.field('markersVisible', 1234)).toMatch(/^1\s?234$/)
  })

  it('donne une largeur STABLE aux décimales — sinon la colonne tressaute', () => {
    // Minimum = maximum : une décimale nulle qui disparaît change la largeur du nombre, et
    // la colonne qu'on suit du regard bouge à chaque rafraîchissement.
    expect(fmt.scale(1)).toBe('1,00')
    expect(fmt.field('fps', 60)).toBe('60,0')
  })

  it('suit la locale des MESURES, pas celle des coordonnées', () => {
    // Une coordonnée se recopie ailleurs et garde le point décimal ; un compte de markers
    // se lit comme une distance. Cf. le JSDoc de `readout.numberLocale`.
    const us = makeStatFormatter({
      ...defaultLabels,
      measure: { ...defaultLabels.measure, numberLocale: 'en-US' },
    })
    expect(us.scale(1)).toBe('1.00')
    expect(fmt.scale(1)).toBe('1,00')
  })
})

describe('statLabel', () => {
  it('nomme les grandeurs propres au panneau', () => {
    expect(statLabel(defaultLabels, 'markersVisible')).toBe('markers affichés')
    expect(statLabel(defaultLabels, 'workers')).toBe('workers d’extrusion')
  })

  it('emprunte le nom des grandeurs de CAMÉRA au bloc de lecture', () => {
    // `readout` les nommait déjà ; les redire dans `stats` créerait deux libellés pour la
    // même grandeur, qu'un hôte pourrait traduire différemment.
    expect(statLabel(defaultLabels, 'altitude')).toBe(defaultLabels.readout.altitude)
    expect(statLabel(defaultLabels, 'latitude')).toBe(defaultLabels.readout.latitude)
  })
})
