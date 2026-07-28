import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaultConfig'
import type { Bounds } from '../shared'
import { lodLevels } from './TiledGlobeLayer'

const cfg = defaultConfig.providers.tiles

/** Vue à plat sur un quartier : quelques centaines de mètres de côté. */
const QUARTIER: Bounds = { west: 2.34, east: 2.36, south: 48.85, north: 48.87 }
/** Vue inclinée à 79° : l'emprise porte jusqu'à l'horizon, des centaines de kilomètres. */
const HORIZON: Bounds = { west: -2, east: 8, south: 45, north: 52 }

describe('lodLevels — cascade de détail du fond raster', () => {
  it('ne demande qu’un niveau quand il couvre déjà toute la vue', () => {
    // `finest === covering` : aucun anneau, un seul niveau demandé en plein.
    expect(lodLevels(QUARTIER, 16, cfg)).toEqual({ finest: 16, covering: 16 })
  })

  /**
   * Le défaut d'origine : le calque ne connaissait que la base et UN niveau cible, rabaissé
   * jusqu'à tenir sur l'emprise entière. Sur une vue inclinée, ce niveau s'effondrait vers
   * la base et le lointain tombait sur une tuile grande comme un quart de continent — un
   * aplat vert uniforme. Il faut donc plusieurs crans entre les deux bornes, pas zéro.
   */
  it('échelonne plusieurs crans quand la vue porte jusqu’à l’horizon', () => {
    const { finest, covering } = lodLevels(HORIZON, 16, cfg)
    expect(finest).toBe(16)
    expect(finest - covering).toBeGreaterThan(3)
  })

  it('ne descend jamais sous le niveau de base — il est chargé à part, en filet', () => {
    // Budget d'une tuile sur l'emprise mondiale : aucun niveau ne tient, la cascade va au
    // bout et s'arrête au plancher. Sans cette borne elle demanderait des zooms négatifs.
    const monde: Bounds = { west: -180, east: 180, south: -85, north: 85 }
    expect(lodLevels(monde, 20, { ...cfg, maxRequest: 1 }).covering).toBe(cfg.baseZoom)
  })

  it('s’arrête au premier niveau qui tient, sans descendre plus bas que nécessaire', () => {
    // Le monde entier tient au niveau 3 dans le budget par défaut : inutile d'aller à 2.
    const monde: Bounds = { west: -180, east: 180, south: -85, north: 85 }
    const { covering } = lodLevels(monde, 20, cfg)
    expect(covering).toBeGreaterThan(cfg.baseZoom)
  })

  it('borne le niveau le plus fin à `maxZoom`', () => {
    expect(lodLevels(QUARTIER, 30, { ...cfg, maxZoom: 14 }).finest).toBe(14)
  })

  it('rend un plan vide quand la vue est déjà au niveau de base', () => {
    expect(lodLevels(QUARTIER, cfg.baseZoom, cfg)).toEqual({ finest: cfg.baseZoom, covering: cfg.baseZoom })
  })

  it('resserre la cascade quand le budget grandit — un budget large couvre plus tôt', () => {
    const serre = lodLevels(HORIZON, 16, { ...cfg, maxRequest: 20 })
    const large = lodLevels(HORIZON, 16, { ...cfg, maxRequest: 2000 })
    expect(large.covering).toBeGreaterThan(serre.covering)
  })
})
