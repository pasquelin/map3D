import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../config/defaultConfig'
import { Projection } from './Projection'

/**
 * Le niveau de rue du fournisseur INTERNE ne se lance pas au rayon : la nappe raster est
 * plate et délibérément non raycastable (cf. `makeUnraycastable`), seul le bâti extrudé est
 * un volume. `sampleGroundHeight` n'y ramenait donc que des TOITS — mesuré sur l'exemple,
 * des markers posés à 33, 42 et 81 m au-dessus d'une rue parisienne, qui flottaient au
 * sommet des immeubles dès qu'on marchait dessous.
 *
 * Le moteur connaissait déjà ce sol analytique (`flatGroundElevation`, lu par le placement
 * piéton, la gravité et le suivi de terrain). Il le pousse maintenant à la projection, ce
 * qui en fait la source unique de TOUS les consommateurs du niveau de rue.
 */
describe('Projection — niveau de rue analytique', () => {
  it('rend le plan de sol sans lancer le moindre rayon', () => {
    const projection = new Projection()
    // Sans ellipsoïde ni groupe, tout raycast rendrait `null` : la réponse ne peut venir
    // que du court-circuit.
    expect(projection.sampleGroundHeight({ lat: 48.86, lng: 2.34 })).toBeNull()
    projection.setGroundPlane(35)
    expect(projection.sampleGroundHeight({ lat: 48.86, lng: 2.34 })).toBe(35)
  })

  /** Un sol à zéro reste un sol : c'est `null` qui dit « il faut un rayon », pas `0`. */
  it('distingue un sol au niveau de l’ellipsoïde d’une absence de plan', () => {
    const projection = new Projection()
    projection.setGroundPlane(0)
    expect(projection.sampleGroundHeight({ lat: 48.86, lng: 2.34 })).toBe(0)
    projection.setGroundPlane(null)
    expect(projection.sampleGroundHeight({ lat: 48.86, lng: 2.34 })).toBeNull()
  })

  /**
   * L'inverse de ce que font `setFlatHeight` et `setRaycastRoot`, et c'est délibéré : le
   * drapage résout ses ancres par `resolveAnchorHeight`, qui ne consulte jamais ce plan. Le
   * niveau de rue, lui, suit l'élévation du terrain et bouge donc en cours de route — faire
   * tourner l'époque remettait à `null` toutes les hauteurs drapées et rouvrait une fenêtre
   * de raycasts à chaque fois (cf. `DrapeSync.update`). Mesuré : 120 fps tombés à 30.
   */
  it('ne fait PAS tourner l’époque des hauteurs', () => {
    const projection = new Projection()
    const before = projection.heightEpoch
    projection.setGroundPlane(35)
    projection.setGroundPlane(60)
    expect(projection.heightEpoch).toBe(before)
  })
})

/**
 * Un appel exact coûte `1 + groundSample.samples` raycasts BVH (9 au défaut), et la pose
 * des markers en réclame un par marker et par frame tant qu'ils bougent. La mémoïsation
 * par cellule est donc ce qui rend un flux temps réel tenable — d'où ces garanties.
 *
 * Le double compte les appels réellement calculés en substituant `sampleGroundHeight` :
 * c'est la seule chose qu'on veut observer, et elle n'est pas mesurable autrement sans
 * monter un vrai tileset.
 */
describe('Projection — mémoïsation du niveau de rue', () => {
  /** `Projection` avec un `sampleGroundHeight` instrumenté ; `calls` compte les calculs. */
  function counting(height: number | null = 12) {
    const projection = new Projection()
    const state = { calls: 0 }
    projection.sampleGroundHeight = () => {
      state.calls++
      return height
    }
    return { projection, state }
  }

  it('ne calcule qu’une fois par cellule', () => {
    const { projection, state } = counting()
    // Deux points distants de ~1 m : bien à l'intérieur de la même cellule de 1e-4°.
    expect(projection.sampleGroundHeightCached({ lat: 48.86, lng: 2.34 })).toBe(12)
    expect(projection.sampleGroundHeightCached({ lat: 48.860005, lng: 2.340005 })).toBe(12)
    expect(state.calls).toBe(1)
  })

  it('recalcule dans une cellule voisine', () => {
    const { projection, state } = counting()
    projection.sampleGroundHeightCached({ lat: 48.86, lng: 2.34 })
    // ~55 m plus loin : cinq cellules d'écart, donc un autre morceau de terrain.
    projection.sampleGroundHeightCached({ lat: 48.8605, lng: 2.34 })
    expect(state.calls).toBe(2)
  })

  /**
   * `null` (aucune tuile sous le point) se mémoïse comme le reste : c'est un verdict aussi
   * coûteux à obtenir, et le TTL suffit à le reconsidérer quand les tuiles arrivent. Sans
   * ça, un marker en zone non chargée relançait neuf rayons à CHAQUE frame — précisément le
   * cas que la mémoïsation doit couvrir.
   */
  it('mémoïse aussi l’absence de réponse', () => {
    const { projection, state } = counting(null)
    expect(projection.sampleGroundHeightCached({ lat: 48.86, lng: 2.34 })).toBeNull()
    expect(projection.sampleGroundHeightCached({ lat: 48.86, lng: 2.34 })).toBeNull()
    expect(state.calls).toBe(1)
  })

  /** Bascule 2D/3D : la surface de référence change, toute hauteur retenue est périmée. */
  it('oublie tout au changement d’époque', () => {
    const { projection, state } = counting()
    projection.sampleGroundHeightCached({ lat: 48.86, lng: 2.34 })
    projection.setFlatHeight(0)
    projection.setFlatHeight(null)
    projection.sampleGroundHeightCached({ lat: 48.86, lng: 2.34 })
    expect(state.calls).toBe(2)
  })

  /** `cellDeg: 0` retire la mémoïsation — l'échappatoire de qui veut la hauteur exacte. */
  it('se désactive sur une maille nulle', () => {
    const { projection, state } = counting()
    projection.setConfig({
      ...defaultConfig,
      performance: {
        ...defaultConfig.performance,
        groundSample: { ...defaultConfig.performance.groundSample, cellDeg: 0 },
      },
    })
    projection.sampleGroundHeightCached({ lat: 48.86, lng: 2.34 })
    projection.sampleGroundHeightCached({ lat: 48.86, lng: 2.34 })
    expect(state.calls).toBe(2)
  })
  /**
   * La clé empaquette les deux index dans un entier : `latIdx × LNG_CELL_SPAN + lngIdx`.
   * L'empaquetage n'est injectif que si la plage de longitudes (`360 / cellDeg + 1` valeurs)
   * tient dans `LNG_CELL_SPAN` — sinon un report de longitude retombe sur la latitude
   * voisine, et deux points sans rapport se partagent une hauteur de sol SANS BRUIT.
   *
   * Ces deux points sont le contre-exemple exact à la maille minimale : leurs index sont
   * (0 ; 36 000 000) et (1 ; −31 108 864), qui donnaient la MÊME clé tant que la portée
   * valait 2²⁶ — un marker du Pacifique se posait à la hauteur d'un autre à 2 500 km de là.
   */
  it('n’empaquette pas deux cellules distinctes sur la même clé, à la maille minimale', () => {
    const { projection, state } = counting()
    projection.setConfig({
      ...defaultConfig,
      performance: {
        ...defaultConfig.performance,
        groundSample: { ...defaultConfig.performance.groundSample, cellDeg: 5e-6 },
      },
    })
    projection.sampleGroundHeightCached({ lat: 0, lng: 180 })
    projection.sampleGroundHeightCached({ lat: 5e-6, lng: -155.54432 })
    expect(state.calls).toBe(2)
  })

  /**
   * Sous la maille minimale, la clé collisionnerait quoi qu'on fasse : le repli est le
   * calcul direct, jamais une mémoïsation qui rendrait des hauteurs fausses.
   */
  it('se désactive sous la maille minimale plutôt que de collisionner', () => {
    const { projection, state } = counting()
    projection.setConfig({
      ...defaultConfig,
      performance: {
        ...defaultConfig.performance,
        groundSample: { ...defaultConfig.performance.groundSample, cellDeg: 1e-7 },
      },
    })
    projection.sampleGroundHeightCached({ lat: 48.86, lng: 2.34 })
    projection.sampleGroundHeightCached({ lat: 48.86, lng: 2.34 })
    expect(state.calls).toBe(2)
  })

  /** Le sol analytique se rend par un test de champ : le mémoïser coûterait plus que lui. */
  it('court-circuite le cache quand le sol est analytique', () => {
    const { projection, state } = counting()
    projection.setGroundPlane(35)
    expect(projection.sampleGroundHeightCached({ lat: 48.86, lng: 2.34 })).toBe(35)
    expect(state.calls).toBe(0)
  })
})
