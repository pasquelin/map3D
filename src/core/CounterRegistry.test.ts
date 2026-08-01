import { describe, expect, it } from 'vitest'
import { CounterRegistry } from './CounterRegistry'
import type { Bounds } from '../shared'
import type { StatContribution } from './viewStats'

/** Cadre passé aux compteurs — sans effet ici, les contributeurs simulés l'ignorent. */
const WORLD: Bounds = { north: 90, south: -90, east: 180, west: -180 }

const counter = (kind: StatContribution['kind'], visible: number, total: number) => ({
  stats: (): StatContribution => ({ kind, visible, total }),
})

describe('CounterRegistry', () => {
  it('agrège les contributeurs inscrits', () => {
    const reg = new CounterRegistry()
    reg.register(counter('markers', 8, 26))
    reg.register(counter('markers', 2, 12))
    reg.register(counter('clusters', 4, 4))
    reg.register(counter('shapes', 7, 22))
    expect(reg.collect({}, WORLD)).toMatchObject({
      markersVisible: 10,
      markersTotal: 38,
      clusters: 4,
      shapes: 7,
    })
  })

  it('cesse de compter un contributeur désinscrit', () => {
    // Une couche démontée qui continuerait de compter afficherait un chiffre figé — pire
    // qu'un zéro, parce que rien ne le signale.
    const reg = new CounterRegistry()
    const off = reg.register(counter('shapes', 5, 5))
    expect(reg.collect({}, WORLD).shapes).toBe(5)
    off()
    expect(reg.collect({}, WORLD).shapes).toBe(0)
  })

  it('réutilise l’objet de sortie — le panneau ne doit pas allouer par rafraîchissement', () => {
    const reg = new CounterRegistry()
    reg.register(counter('paths', 3, 3))
    const out = { fps: 120 }
    const first = reg.collect(out, WORLD)
    const second = reg.collect(out, WORLD)
    expect(first).toBe(out)
    expect(second).toBe(out)
    // Les grandeurs qui ne viennent pas des couches sont préservées.
    expect(out.fps).toBe(120)
  })

  it('n’accumule pas d’un appel à l’autre', () => {
    // Le tableau de travail est réutilisé : s'il n'était pas vidé, chaque rafraîchissement
    // ajouterait les contributions de tous les précédents et les compteurs exploseraient.
    const reg = new CounterRegistry()
    reg.register(counter('links', 2, 2))
    expect(reg.collect({}, WORLD).links).toBe(2)
    expect(reg.collect({}, WORLD).links).toBe(2)
    expect(reg.collect({}, WORLD).links).toBe(2)
  })

  it('rend des zéros sans aucun contributeur, plutôt que des trous', () => {
    // Une grandeur absente laisserait la valeur précédente à l'écran, ce qui ment.
    expect(new CounterRegistry().collect({}, WORLD)).toMatchObject({
      markersVisible: 0,
      markersTotal: 0,
      clusters: 0,
      shapes: 0,
      paths: 0,
      links: 0,
      drawings: 0,
    })
  })
})
