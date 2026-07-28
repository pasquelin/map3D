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
