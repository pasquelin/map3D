import { describe, expect, it } from 'vitest'
import { approach, clampRange, smoothstep, volumeVisibility } from './math'

describe('smoothstep', () => {
  it('vaut 0 avant, 1 après', () => {
    expect(smoothstep(0.75, 0.95, 0.5)).toBe(0)
    expect(smoothstep(0.75, 0.95, 1)).toBe(1)
  })

  it('passe par 0,5 au milieu', () => {
    expect(smoothstep(0.75, 0.95, 0.85)).toBeCloseTo(0.5, 6)
  })

  it('est monotone croissante', () => {
    let prev = -1
    for (let x = 0.7; x <= 1; x += 0.01) {
      const v = smoothstep(0.75, 0.95, x)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})

describe('approach', () => {
  it('colle immédiatement à la cible sans lissage', () => {
    expect(approach(0, 10, 0, 0.016)).toBe(10)
  })

  it('est indépendante de la cadence : deux pas à 60 Hz = un pas à 30 Hz', () => {
    // C'est TOUTE la raison d'être d'une constante de temps plutôt qu'un facteur par frame.
    const deuxPas = approach(approach(0, 10, 0.25, 1 / 60), 10, 0.25, 1 / 60)
    expect(deuxPas).toBeCloseTo(approach(0, 10, 0.25, 1 / 30), 10)
  })

  it('converge sans jamais dépasser', () => {
    let v = 0
    for (let i = 0; i < 500; i++) v = approach(v, 10, 0.25, 1 / 60)
    expect(v).toBeCloseTo(10, 6)
    expect(v).toBeLessThanOrEqual(10)
  })
})

describe('clampRange — troncature de la portée d’un rayon', () => {
  it('laisse intact un impact plus proche que la portée', () => {
    expect(clampRange(1200, 6000)).toBe(1200)
  })

  it('ramène à la portée un impact plus lointain', () => {
    expect(clampRange(33_000, 6000)).toBe(6000)
  })

  /**
   * LE cas du bug : un rayon qui franchit l'horizon ne touche rien. Il valait « point
   * ignoré », et l'emprise s'effondrait d'un coup (mesuré : 33 km → 3,8 km entre 58° et
   * 59° d'inclinaison). Il vaut désormais la portée — c'est ce qui rend l'emprise continue.
   */
  it('rend la portée pour un rayon parti au ciel', () => {
    expect(clampRange(null, 6000)).toBe(6000)
  })

  it('reste dans [0, portée] et croît avec la distance d’impact', () => {
    let prev = -1
    for (const d of [0, 100, 1000, 5999, 6000, 6001, 20_000, 1e9]) {
      const r = clampRange(d, 6000)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(6000)
      expect(r).toBeGreaterThanOrEqual(prev)
      prev = r
    }
  })
})

describe('volumeVisibility — seuil d’altitude du volume interne', () => {
  it('affiche et demande sous le seuil', () => {
    expect(volumeVisibility(800, 1000, 1.5)).toEqual({ show: true, request: true })
  })

  /** Bande de préchargement : on télécharge sans montrer, pour être prêt à l'arrivée. */
  it('demande sans afficher entre le seuil et le seuil × facteur', () => {
    expect(volumeVisibility(1200, 1000, 1.5)).toEqual({ show: false, request: true })
  })

  it('ne fait rien au-dessus de la bande de préchargement', () => {
    expect(volumeVisibility(2000, 1000, 1.5)).toEqual({ show: false, request: false })
  })

  /** Demander sans afficher a un sens ; afficher sans demander en serait dépourvu. */
  it('demande partout où elle affiche', () => {
    for (let agl = 0; agl <= 3000; agl += 50) {
      const v = volumeVisibility(agl, 1000, 1.5)
      if (v.show) expect(v.request).toBe(true)
    }
  })

  /** Un facteur de 1 supprime la bande : les deux seuils se confondent. */
  it('confond les deux seuils quand le facteur vaut 1', () => {
    expect(volumeVisibility(1000, 1000, 1)).toEqual({ show: true, request: true })
    expect(volumeVisibility(1001, 1000, 1)).toEqual({ show: false, request: false })
  })
})
