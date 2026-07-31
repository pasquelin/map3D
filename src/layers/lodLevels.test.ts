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
    expect(lodLevels(QUARTIER, QUARTIER, 16, cfg)).toEqual({ finest: 16, covering: 16, cascade: false })
  })

  /**
   * Le défaut d'origine : le calque ne connaissait que la base et UN niveau cible, rabaissé
   * jusqu'à tenir sur l'emprise entière. Sur une vue inclinée, ce niveau s'effondrait vers
   * la base et le lointain tombait sur une tuile grande comme un quart de continent — un
   * aplat vert uniforme. Il faut donc plusieurs crans entre les deux bornes, pas zéro.
   */
  it('échelonne plusieurs crans quand la vue porte jusqu’à l’horizon', () => {
    const { finest, covering } = lodLevels(HORIZON, HORIZON, 16, cfg)
    expect(finest).toBe(16)
    expect(finest - covering).toBeGreaterThan(3)
  })

  it('ne descend jamais sous le niveau de base — il est chargé à part, en filet', () => {
    // Budget d'une tuile sur l'emprise mondiale : aucun niveau ne tient, la cascade va au
    // bout et s'arrête au plancher. Sans cette borne elle demanderait des zooms négatifs.
    const monde: Bounds = { west: -180, east: 180, south: -85, north: 85 }
    expect(lodLevels(monde, monde, 20, { ...cfg, maxRequest: 1 }).covering).toBe(cfg.baseZoom)
  })

  it('s’arrête au premier niveau qui tient, sans descendre plus bas que nécessaire', () => {
    // Le monde entier tient au niveau 3 dans le budget par défaut : inutile d'aller à 2.
    const monde: Bounds = { west: -180, east: 180, south: -85, north: 85 }
    const { covering } = lodLevels(monde, monde, 20, cfg)
    expect(covering).toBeGreaterThan(cfg.baseZoom)
  })

  it('borne le niveau le plus fin à `maxZoom`', () => {
    expect(lodLevels(QUARTIER, QUARTIER, 30, { ...cfg, maxZoom: 14 }).finest).toBe(14)
  })

  it('rend un plan vide quand la vue est déjà au niveau de base', () => {
    expect(lodLevels(QUARTIER, QUARTIER, cfg.baseZoom, cfg)).toEqual({
      finest: cfg.baseZoom,
      covering: cfg.baseZoom,
      cascade: false,
    })
  })

  it('resserre la cascade quand le budget grandit — un budget large couvre plus tôt', () => {
    const serre = lodLevels(HORIZON, HORIZON, 16, { ...cfg, maxRequest: 20 })
    const large = lodLevels(HORIZON, HORIZON, 16, { ...cfg, maxRequest: 2000 })
    expect(large.covering).toBeGreaterThan(serre.covering)
  })
})

/**
 * Les deux emprises ne jouent pas le même rôle : `steady` (un disque centré sous la caméra)
 * DÉCIDE de la finesse, `bounds` (le trapèze de vue) ne fait que la borner en volume.
 */
describe('lodLevels — finesse décidée sur le disque, budget borné par la vue', () => {
  /**
   * LE cas du bug : à 78° d'inclinaison, `bounds` porte jusqu'à l'horizon. Décider la finesse
   * dessus faisait tomber `covering` au niveau de base, dont un texel couvre un quart de
   * continent — d'où les traînées floues au ras du ciel, jusque tout près de l'observateur.
   */
  it('ne s’effondre plus au niveau de base quand la vue porte à l’horizon', () => {
    const surLaVue = lodLevels(HORIZON, HORIZON, 16, cfg).covering
    const surLeDisque = lodLevels(QUARTIER, HORIZON, 16, cfg).covering
    expect(surLeDisque).toBeGreaterThan(surLaVue)
  })

  /**
   * L'aire de la bbox alignée croît d'un facteur ~2 entre un cap nord et un cap à 45°, et un
   * facteur 2 vaut un cran entier : c'est ce qui faisait changer la netteté du fond quand on
   * tournait la caméra. Le disque, lui, ne dépend d'aucun angle.
   *
   * ⚠️ L'invariance vaut TANT QUE le budget n'est pas saturé — au-delà, le second critère
   * reprend la main et la finesse redevient fonction de l'étendue (cf. le test suivant).
   * C'est l'ordre de priorité voulu : mieux vaut un fond un cran moins net qu'un cache qui
   * évince ce qu'il vient de charger.
   */
  it('rend la même finesse quel que soit le cap, à disque égal et budget non saturé', () => {
    // Une même vue de ~6 km, cadrée nord-sud puis en diagonale : deux bbox d'aires très
    // différentes pour le même contenu à l'écran. Au zoom 14 les deux tiennent dans le cache.
    const capNord: Bounds = { west: 2.3, east: 2.36, south: 48.82, north: 48.9 }
    const capDiagonale: Bounds = { west: 2.28, east: 2.4, south: 48.8, north: 48.92 }
    expect(lodLevels(QUARTIER, capNord, 14, cfg).covering).toBe(lodLevels(QUARTIER, capDiagonale, 14, cfg).covering)
  })

  /**
   * `covering` est demandé en PLEIN sur `bounds` : une finesse décidée sur un petit disque
   * réclamerait sinon des milliers de tuiles sur une vue étalée (mesuré : 800 au seul niveau
   * `covering` à 5 000 m et 70°), et le cache évincerait ce qu'il vient de charger.
   */
  it('redescend malgré le disque quand la vue réclamerait plus que le cache', () => {
    const petitCache = { ...cfg, maxTiles: 8 }
    expect(lodLevels(QUARTIER, HORIZON, 16, petitCache).covering).toBeLessThan(
      lodLevels(QUARTIER, HORIZON, 16, cfg).covering,
    )
  })
})

/**
 * Un niveau uniforme prend celui qu'impose le point le plus LOINTAIN, et le premier plan en
 * hérite. À plat les deux sont du même ordre ; en vue rasante le rapport explose, et le sol
 * sous les pieds se retrouve peint par des tuiles calibrées pour l'horizon.
 */
describe('lodLevels — bascule du niveau unique vers la cascade', () => {
  it('reste en niveau unique quand la vue tient dans l’écart toléré', () => {
    expect(lodLevels(QUARTIER, QUARTIER, 16, cfg).cascade).toBe(false)
  })

  /**
   * Le cas mesuré : 73 m d'altitude, 73° d'inclinaison. L'emprise s'étale sur 6,3 × 12,5 km
   * quand le sol regardé est à 73 m — le niveau tombait à des tuiles de 805 m, onze fois la
   * hauteur de l'œil, d'où un sol flou et des étiquettes géantes.
   */
  it('bascule en cascade quand la vue est trop étalée pour un seul niveau', () => {
    expect(lodLevels(QUARTIER, HORIZON, 18, cfg).cascade).toBe(true)
  })

  /** Le seuil est un réglage : très haut, il rend l'ancien comportement (uniforme quoi qu'il arrive). */
  it('ne bascule jamais avec un écart toléré très large', () => {
    expect(lodLevels(QUARTIER, HORIZON, 18, { ...cfg, uniformMaxSpread: 99 }).cascade).toBe(false)
  })

  /** À zéro, le moindre cran d'écart suffit — utile pour privilégier toujours le premier plan. */
  it('bascule au moindre écart quand la tolérance est nulle', () => {
    const auRas = lodLevels(QUARTIER, HORIZON, 18, { ...cfg, uniformMaxSpread: 0 })
    expect(auRas.cascade).toBe(true)
  })
})
