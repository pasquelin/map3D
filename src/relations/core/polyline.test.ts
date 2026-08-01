import { describe, expect, it } from 'vitest'
import { decodePolyline } from './polyline'

// Décodeur du format « Encoded Polyline » de Google : c'est ce que renvoie le provider de
// routage réel. Deux garanties à tenir : la conformité exacte à l'algorithme (zigzag +
// base64, deltas cumulés, précision 1e-5) et la RÉSILIENCE — une chaîne tronquée doit
// rendre le tracé partiel plutôt que lever, sinon une réponse coupée fait disparaître tout
// l'itinéraire.

// Exemple canonique de la documentation Google.
const CANONICAL = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'
const CANONICAL_POINTS = [
  { lat: 38.5, lng: -120.2 },
  { lat: 40.7, lng: -120.95 },
  { lat: 43.252, lng: -126.453 },
]

describe('decodePolyline', () => {
  it("décode l'exemple canonique (deltas cumulés, longitudes négatives)", () => {
    const pts = decodePolyline(CANONICAL)
    expect(pts).toHaveLength(3)
    pts.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(CANONICAL_POINTS[i]!.lat, 5)
      expect(p.lng).toBeCloseTo(CANONICAL_POINTS[i]!.lng, 5)
    })
  })

  it('rend une liste vide pour une chaîne vide', () => {
    expect(decodePolyline('')).toEqual([])
  })

  it('ignore un dernier groupe incomplet plutôt que de lever', () => {
    // '~' porte le bit de continuation ; sans octet suivant, le groupe est tronqué.
    const partial = decodePolyline(CANONICAL + '~')
    expect(partial).toHaveLength(3)
    expect(partial[2]!.lat).toBeCloseTo(43.252, 5)
  })

  it('rend une liste vide (sans exception) quand la première valeur est déjà tronquée', () => {
    expect(decodePolyline('~')).toEqual([])
  })
})
