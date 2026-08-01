import { describe, expect, it } from 'vitest'
import { foldLayerStats, type StatContribution, statLevel } from './viewStats'

describe('statLevel', () => {
  it('juge une grandeur qui PÈSE : petit = bon', () => {
    const t = { ok: 100, warn: 500 }
    expect(statLevel(50, t)).toBe('ok')
    expect(statLevel(100, t)).toBe('ok')
    expect(statLevel(101, t)).toBe('warn')
    expect(statLevel(500, t)).toBe('warn')
    expect(statLevel(501, t)).toBe('bad')
  })

  it('juge une grandeur qui PORTE : grand = bon, sans drapeau à déclarer', () => {
    // Le sens vient de l'ORDRE des bornes. Un `higherIsBetter` séparé aurait pu les
    // contredire ; ici c'est structurellement impossible.
    const t = { ok: 60, warn: 30 }
    expect(statLevel(120, t)).toBe('ok')
    expect(statLevel(60, t)).toBe('ok')
    expect(statLevel(59, t)).toBe('warn')
    expect(statLevel(30, t)).toBe('warn')
    expect(statLevel(29, t)).toBe('bad')
  })

  it('ne peint pas en rouge ce qu’on ne sait pas mesurer', () => {
    // Une grandeur indisponible (première frame, fournisseur absent) n'est pas une
    // alerte : la signaler en rouge apprendrait au lecteur à ignorer le rouge.
    expect(statLevel(Number.NaN, { ok: 10, warn: 20 })).toBe('ok')
    expect(statLevel(Number.POSITIVE_INFINITY, { ok: 10, warn: 20 })).toBe('ok')
    expect(statLevel(999, undefined)).toBe('ok')
  })

  it('accepte des bornes égales — tout ce qui les dépasse est mauvais, sans zone jaune', () => {
    const t = { ok: 10, warn: 10 }
    expect(statLevel(10, t)).toBe('ok')
    expect(statLevel(11, t)).toBe('bad')
  })
})

describe('foldLayerStats', () => {
  it('additionne les couches d’un même genre — c’est ce que la frame paie', () => {
    // Deux couches de markers montées côte à côte (alertes et agents) : le coût est leur
    // somme, pas le maximum. C'est aussi pourquoi le regroupement est commun.
    const contributions: StatContribution[] = [
      { kind: 'markers', visible: 12, total: 2000 },
      { kind: 'markers', visible: 30, total: 500 },
      { kind: 'clusters', visible: 7, total: 7 },
      { kind: 'shapes', visible: 3, total: 9 },
    ]
    expect(foldLayerStats({}, contributions)).toEqual({
      markersVisible: 42,
      markersTotal: 2500,
      clusters: 7,
      shapes: 3,
      paths: 0,
      links: 0,
      drawings: 0,
    })
  })

  it('écrit des zéros plutôt que de laisser des trous', () => {
    // Une grandeur absente et une grandeur nulle ne se lisent pas pareil dans un panneau :
    // la première laisse la valeur précédente à l'écran, ce qui ment.
    expect(foldLayerStats({}, [])).toEqual({
      markersVisible: 0,
      markersTotal: 0,
      clusters: 0,
      shapes: 0,
      paths: 0,
      links: 0,
      drawings: 0,
    })
  })

  it('réutilise l’objet fourni — le panneau se rafraîchit sans allouer', () => {
    // `StatsLayer` appelle ceci à chaque rafraîchissement : allouer un instantané par
    // passage ferait du panneau de diagnostic un poste de diagnostic à lui seul.
    const out = { fps: 120 }
    const same = foldLayerStats(out, [{ kind: 'paths', visible: 2, total: 2 }])
    expect(same).toBe(out)
    expect(same.fps).toBe(120)
    expect(same.paths).toBe(2)
  })
})
