import { describe, expect, it } from 'vitest'
import { defaultConfig } from './defaultConfig'
import { mergeConfig } from './mergeConfig'
import { type DeviceCaps, detectQuality, qualityPreset } from './qualityPresets'

const caps = (over: Partial<DeviceCaps> = {}): DeviceCaps => ({ cores: 8, memory: 8, dpr: 1, ...over })

describe('detectQuality', () => {
  it('classe une machine costaude en high', () => {
    expect(detectQuality(caps({ cores: 8, memory: 16 }))).toBe('high')
  })
  it('classe une machine modeste en low', () => {
    expect(detectQuality(caps({ cores: 2, memory: 4 }))).toBe('low')
  })
  it('ne rétrograde pas sur `memory` inconnu (0) hors Chromium', () => {
    expect(detectQuality(caps({ cores: 8, memory: 0 }))).toBe('high')
  })
  it('4 cœurs → medium', () => {
    expect(detectQuality(caps({ cores: 4, memory: 0 }))).toBe('medium')
  })
})

describe('qualityPreset', () => {
  it('high borne le pixelRatio par le dpr (jamais au-dessus de 2)', () => {
    expect(qualityPreset('high', caps({ dpr: 3 })).performance?.pixelRatio).toBe(2)
    expect(qualityPreset('high', caps({ dpr: 1 })).performance?.pixelRatio).toBe(1)
  })
  it('low coupe le ciel et resserre le budget des bâtiments', () => {
    const low = qualityPreset('low', caps())
    expect(low.sky?.enabled).toBe(false)
    expect(low.providers?.buildings?.maxViewDistance).toBeLessThan(
      qualityPreset('high', caps()).providers!.buildings!.maxViewDistance!,
    )
  })
  it('produit un PartialConfig mergeable qui ne casse pas la config complète', () => {
    const merged = mergeConfig(defaultConfig, qualityPreset('medium', caps()))
    expect(merged.performance.pixelRatio).toBe(1)
    expect(merged.providers.buildings.maxTiles).toBe(48)
    // Les feuilles non touchées de adaptiveResolution restent celles du défaut.
    expect(merged.performance.adaptiveResolution.step).toBe(defaultConfig.performance.adaptiveResolution.step)
  })
})
