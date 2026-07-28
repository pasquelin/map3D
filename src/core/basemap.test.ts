import { describe, expect, it } from 'vitest'
import { type BasemapSupport, canEnterMode, deriveBasemapCapabilities } from './basemap'

/** Fournisseur externe (Google) avec sa clé : plan ET volume servables, trafic possible. */
const withKey: BasemapSupport = {
  hasBasemap2d: true,
  sourceSupportsTraffic: true,
  provider3d: 'external',
  has3dTileset: true,
  hasRelief: false,
  hasBuildings: false,
}

/** Fournisseur interne, phase raster seule : un fond plat, pas de volume, pas de trafic. */
const internalRaster: BasemapSupport = {
  hasBasemap2d: true,
  sourceSupportsTraffic: false,
  provider3d: 'internal',
  has3dTileset: false,
  hasRelief: false,
  hasBuildings: false,
}

describe('deriveBasemapCapabilities', () => {
  it('externe avec clé : les deux destinations et le trafic (comportement historique)', () => {
    const s = deriveBasemapCapabilities('plan', withKey, false)
    expect(s.canPlan).toBe(true)
    expect(s.can3d).toBe(true)
    expect(s.trafficAvailable).toBe(true)
  })

  it('le trafic est indisponible en 3D, même chez un fournisseur qui le sert', () => {
    expect(deriveBasemapCapabilities('3d', withKey, false).trafficAvailable).toBe(false)
  })

  it('token Ion seul : du volume, aucun fond plat', () => {
    const s = deriveBasemapCapabilities('3d', { ...withKey, hasBasemap2d: false }, false)
    expect(s.canPlan).toBe(false)
    expect(s.can3d).toBe(true)
    expect(s.trafficAvailable).toBe(false)
  })

  it('ni clé ni token : aucune capacité', () => {
    const s = deriveBasemapCapabilities('3d', { ...internalRaster, hasBasemap2d: false }, false)
    expect(s.canPlan).toBe(false)
    expect(s.can3d).toBe(false)
  })

  it('interne en raster seul : fond plat servable, pas de volume — donc pas de bascule', () => {
    const s = deriveBasemapCapabilities('plan', internalRaster, false)
    expect(s.canPlan).toBe(true)
    expect(s.can3d).toBe(false)
  })

  it("interne : jamais de trafic, c'est une propriété de la tuile Google", () => {
    expect(deriveBasemapCapabilities('plan', internalRaster, false).trafficAvailable).toBe(false)
  })

  it('interne avec relief : le volume redevient possible', () => {
    expect(deriveBasemapCapabilities('plan', { ...internalRaster, hasRelief: true }, false).can3d).toBe(true)
  })

  it('interne avec bâtiments : le volume redevient possible', () => {
    expect(deriveBasemapCapabilities('plan', { ...internalRaster, hasBuildings: true }, false).can3d).toBe(true)
  })

  // Les deux axes sont indépendants : le fond plat et le volume peuvent venir de
  // fournisseurs différents. Ce sont les combinaisons que l'UI doit gérer sans broncher.
  it('2D interne + 3D externe : les deux boutons restent, le trafic non', () => {
    const s = deriveBasemapCapabilities(
      'plan',
      { ...internalRaster, provider3d: 'external', has3dTileset: true },
      false,
    )
    expect(s.canPlan).toBe(true)
    expect(s.can3d).toBe(true)
    expect(s.trafficAvailable).toBe(false)
  })

  it('2D externe + 3D interne : un token photoréaliste ne compte plus pour le volume', () => {
    const s = deriveBasemapCapabilities('plan', { ...withKey, provider3d: 'internal' }, false)
    expect(s.canPlan).toBe(true)
    expect(s.can3d).toBe(false)
    // Le fond plat reste Google : le trafic, lui, reste proposable.
    expect(s.trafficAvailable).toBe(true)
  })

  it('recopie mode et trafic tels quels — ce sont des états, pas des capacités', () => {
    const s = deriveBasemapCapabilities('plan', withKey, true)
    expect(s.mode).toBe('plan')
    expect(s.traffic).toBe(true)
  })
})

describe('canEnterMode — la table de vérité de la bascule', () => {
  it('autorise chaque mode selon SA propre capacité, pas celle de l’autre', () => {
    const s = deriveBasemapCapabilities('plan', withKey, false)
    expect(canEnterMode(s, 'plan')).toBe(true)
    expect(canEnterMode(s, '3d')).toBe(true)
  })

  /**
   * ⚠️ Le cas qui laissait un bouton inerte : un fond plat servable ne dit RIEN du volume.
   * La barre proposait « 3D », et le clic masquait le fond pour ne rien mettre à la place.
   */
  it('refuse le volume quand rien ne l’alimente, même avec un fond plat servable', () => {
    const s = deriveBasemapCapabilities('plan', { ...withKey, has3dTileset: false }, false)
    expect(canEnterMode(s, 'plan')).toBe(true)
    expect(canEnterMode(s, '3d')).toBe(false)
  })

  it('refuse le plan sans fond servable, volume disponible ou non', () => {
    const s = deriveBasemapCapabilities('3d', { ...withKey, hasBasemap2d: false }, false)
    expect(canEnterMode(s, 'plan')).toBe(false)
    expect(canEnterMode(s, '3d')).toBe(true)
  })

  it('ouvre le volume interne dès que le relief OU les bâtiments répondent', () => {
    const relief = deriveBasemapCapabilities('plan', { ...internalRaster, hasRelief: true }, false)
    const bati = deriveBasemapCapabilities('plan', { ...internalRaster, hasBuildings: true }, false)
    expect(canEnterMode(relief, '3d')).toBe(true)
    expect(canEnterMode(bati, '3d')).toBe(true)
    // Raster interne seul : un fond, aucun volume.
    expect(canEnterMode(deriveBasemapCapabilities('plan', internalRaster, false), '3d')).toBe(false)
  })
})

describe('deriveBasemapCapabilities — cohérence du trafic', () => {
  /**
   * ⚠️ `traffic` était recopié tel quel. Plusieurs chemins changent le mode sans passer par
   * `setTrafficVisible` : l'état publié pouvait annoncer un calque allumé que l'UI n'avait
   * pas le droit d'afficher.
   */
  it('éteint le trafic hors mode plan, quoi que dise la couche', () => {
    const s = deriveBasemapCapabilities('3d', withKey, true)
    expect(s.trafficAvailable).toBe(false)
    expect(s.traffic).toBe(false)
  })

  it('éteint le trafic sur une source qui ne le sert pas', () => {
    const s = deriveBasemapCapabilities('plan', internalRaster, true)
    expect(s.traffic).toBe(false)
  })
})

/** Fournisseur interne AVEC ses bâtiments : le seul volume qui porte des emprises. */
const internalBuildings: BasemapSupport = { ...internalRaster, hasBuildings: true }

describe('canPickBuildings', () => {
  it('n’est vrai qu’en 3D interne avec des bâtiments', () => {
    expect(deriveBasemapCapabilities('3d', internalBuildings, false).canPickBuildings).toBe(true)
  })

  it('est faux en mode plan', () => {
    // Les volumes ne sont pas à l'écran : proposer l'outil offrirait un mode sans cible.
    expect(deriveBasemapCapabilities('plan', internalBuildings, false).canPickBuildings).toBe(false)
  })

  it('est faux en volume externe', () => {
    // Le photoréaliste est un maillage texturé fusionné : aucune identité de bâtiment.
    expect(deriveBasemapCapabilities('3d', withKey, false).canPickBuildings).toBe(false)
  })

  it('est faux sans source de bâtiments', () => {
    const relief: BasemapSupport = { ...internalRaster, hasRelief: true }
    expect(deriveBasemapCapabilities('3d', relief, false).canPickBuildings).toBe(false)
  })
})
