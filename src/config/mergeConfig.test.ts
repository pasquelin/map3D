import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAW_PRESETS, maxRadiusOf } from '../react/components/drawPresets'
import { defaultConfig } from './defaultConfig'
import { mergeConfig, resolveLocale, resolveRegion } from './mergeConfig'

describe('mergeConfig', () => {
  it('ne garde que ce qui est surchargé, le reste vient des défauts', () => {
    const merged = mergeConfig(defaultConfig, { interaction: { dragSlopPx: 16 } })
    expect(merged.interaction.dragSlopPx).toBe(16)
    expect(merged.interaction.longPressMs).toBe(defaultConfig.interaction.longPressMs)
    expect(merged.providers.routing.matrixUrl).toBe(defaultConfig.providers.routing.matrixUrl)
  })

  it('ne mute pas les défauts', () => {
    // `defaultConfig` est exporté publiquement : le muter contaminerait toutes les
    // cartes de l'application, y compris celles montées ensuite.
    const before = defaultConfig.interaction.dragSlopPx
    mergeConfig(defaultConfig, { interaction: { dragSlopPx: 999 } })
    expect(defaultConfig.interaction.dragSlopPx).toBe(before)
  })

  it('renvoie la base par référence sans override', () => {
    expect(mergeConfig(defaultConfig, undefined)).toBe(defaultConfig)
  })

  it('fusionne un sous-arbre piéton partiel sans vider ses voisins', () => {
    const merged = mergeConfig(defaultConfig, { pedestrian: { collision: { feelers: 8 } } })
    expect(merged.pedestrian.collision.feelers).toBe(8)
    // Les frères du champ touché survivent — c'est tout l'intérêt du merge profond.
    expect(merged.pedestrian.collision.radiusMeters).toBe(0.3)
    expect(merged.pedestrian.eyeHeightMeters).toBe(1.7)
    expect(merged.interaction.shortcuts.controls.pedestrian).toBe('w')
  })

  it('remplace un tableau de paliers en bloc', () => {
    const merged = mergeConfig(defaultConfig, { providers: { routing: { presets: { fastest: [2] } } } })
    expect(merged.providers.routing.presets.fastest).toEqual([2])
  })

  it('expose les réglages du pick de bâtiment et les laisse surcharger', () => {
    expect(defaultConfig.providers.buildings.pickFields).toEqual([])
    expect(defaultConfig.interaction.buildingPick.cursor).toBe('crosshair')
    const merged = mergeConfig(defaultConfig, {
      providers: { buildings: { pickFields: ['name'] } },
      interaction: { buildingPick: { cursor: 'pointer' } },
    })
    expect(merged.providers.buildings.pickFields).toEqual(['name'])
    expect(merged.interaction.buildingPick.cursor).toBe('pointer')
    // Le voisin du même bloc n'est pas emporté par la surcharge.
    expect(merged.providers.buildings.zoom).toBe(defaultConfig.providers.buildings.zoom)
  })
})

describe('resolveLocale / resolveRegion', () => {
  it('laisse passer une langue explicite', () => {
    expect(resolveLocale('en-GB')).toBe('en-GB')
  })

  it('traduit "auto" en langue du navigateur', () => {
    expect(resolveLocale('auto')).toBe(navigator.language)
  })

  it('traduit "auto" en ABSENCE de région, pas en région devinée', () => {
    // Une région choisie à la place du fournisseur biaiserait silencieusement les
    // résultats ; l'omettre le laisse déduire.
    expect(resolveRegion('auto')).toBeUndefined()
  })
})

describe('maxRadiusOf', () => {
  it('suit les presets au lieu de les redire', () => {
    // La régression visée : l'aperçu divisait par un `50` littéral emprunté à cette
    // table, si bien que changer `radii` faussait silencieusement son dessin.
    expect(maxRadiusOf({ ...DEFAULT_DRAW_PRESETS, radii: [0, 10, 80] })).toBe(80)
  })

  it('retombe sur 50 si la liste est vide', () => {
    expect(maxRadiusOf({ ...DEFAULT_DRAW_PRESETS, radii: [] })).toBe(50)
  })
})

describe('config.graticule', () => {
  it('merge un sous-arbre partiel sans perdre les autres réglages', () => {
    const merged = mergeConfig(defaultConfig, { graticule: { labels: { maxLabels: 12 } } })
    expect(merged.graticule.labels.maxLabels).toBe(12)
    expect(merged.graticule.labels.placement).toBe('center-cross')
    expect(merged.graticule.targetLines).toBe(8)
    expect(merged.graticule.enabled).toBe(false)
  })

  it('exprime la bande de fondu en fractions du plafond d’inclinaison', () => {
    // Des fractions et non des degrés : le plafond est réglable par mode (`maxTilt2d` /
    // `maxTilt3d`) ; resserrer `maxTilt2d` (p. ex. à 36°) ferait qu'une bande absolue ne se
    // déclencherait jamais en mode plan, là où une fraction s'adapte.
    const { start, end } = defaultConfig.graticule.tiltFade
    expect(start).toBeGreaterThan(0)
    expect(start).toBeLessThan(end)
    expect(end).toBeLessThanOrEqual(1)
  })

  it('écrit l’antiméridien en −180, la convention de `normalizeLng`', () => {
    // À 180, la ligne engendrée (normalisée en −180) ne se reconnaîtrait jamais elle-même
    // et l'antiméridien resterait sans nom.
    const anti = defaultConfig.graticule.remarkable.meridians.find((m) => m.labelKey === 'antimeridian')
    expect(anti?.lng).toBe(-180)
  })
})
