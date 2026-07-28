// Fabrique de tuiles MVT pour les tests de `mvt.ts`.
//
// Hors des fichiers `*.test.ts` parce que DEUX suites s'en servent (décodage et
// extrusion) : importer un fichier de test depuis un autre y ferait rejouer ses `describe`.
// Rien n'y mène depuis `src/index.ts`, donc rien n'en arrive dans le bundle publié.

type Props = Record<string, number | string | boolean>
export type Point = { x: number; y: number }

/**
 * Encode une tuile MVT minimale avec `pbf` — le même encodeur que celui du décodage,
 * plutôt qu'un fichier binaire figé dans le dépôt.
 *
 * Les anneaux sont donnés en coordonnées de tuile ; le signe de leur aire décide contour
 * ou trou, exactement comme dans les données réelles (vérifié : 2237 contours et 27 trous
 * sur une tuile de Monaco).
 */
export async function encodeTile(features: { rings: Point[][]; props: Props; id?: number }[]): Promise<ArrayBuffer> {
  // pbf 5 sépare lecture et écriture : le décodage prend `PbfReader`, ce banc `PbfWriter`.
  const { PbfWriter: Pbf } = await import('pbf')
  type P = InstanceType<typeof Pbf>
  const pbf = new Pbf()

  const keys: string[] = []
  const values: (number | string | boolean)[] = []
  for (const f of features) {
    for (const [k, v] of Object.entries(f.props)) {
      if (!keys.includes(k)) keys.push(k)
      if (!values.includes(v)) values.push(v)
    }
  }

  /** Commandes de géométrie d'un polygone : MoveTo, LineTo ×n, ClosePath par anneau. */
  const geometry = (rings: Point[][]): number[] => {
    const geom: number[] = []
    let cx = 0
    let cy = 0
    for (const ring of rings) {
      const first = ring[0]!
      geom.push(9, zig(first.x - cx), zig(first.y - cy))
      cx = first.x
      cy = first.y
      const rest = ring.slice(1)
      geom.push((rest.length << 3) | 2)
      for (const p of rest) {
        geom.push(zig(p.x - cx), zig(p.y - cy))
        cx = p.x
        cy = p.y
      }
      geom.push(15)
    }
    return geom
  }

  // Un `Pbf` s'écrit champ par champ ; on suit le schéma vector_tile.proto.
  const writeLayer = (_: unknown, p: P): void => {
    p.writeStringField(1, 'building')
    p.writeVarintField(5, 4096) // extent
    p.writeVarintField(15, 2) // version
    for (const f of features) {
      p.writeMessage(
        2,
        (__: unknown, fp: P) => {
          // Champ 1 de la Feature : l'identifiant, optionnel dans le format.
          if (f.id !== undefined) fp.writeVarintField(1, f.id)
          const tags: number[] = []
          for (const [k, v] of Object.entries(f.props)) tags.push(keys.indexOf(k), values.indexOf(v))
          fp.writePackedVarint(2, tags)
          fp.writeVarintField(3, 3) // POLYGON
          fp.writePackedVarint(4, geometry(f.rings))
        },
        {},
      )
    }
    for (const k of keys) p.writeStringField(3, k)
    for (const v of values) {
      p.writeMessage(
        4,
        (__: unknown, vp: P) => {
          if (typeof v === 'number') vp.writeDoubleField(3, v)
          else if (typeof v === 'boolean') vp.writeBooleanField(7, v)
          else vp.writeStringField(1, v)
        },
        {},
      )
    }
  }

  pbf.writeMessage(3, writeLayer, {})
  return pbf.finish().buffer as ArrayBuffer
}

/** Zigzag : encodage des entiers signés des commandes de géométrie MVT. */
function zig(n: number): number {
  return (n << 1) ^ (n >> 31)
}

/** Carré horaire (aire signée positive) = contour extérieur. */
export const square = (x: number, y: number, c: number): Point[] => [
  { x, y },
  { x: x + c, y },
  { x: x + c, y: y + c },
  { x, y: y + c },
]

/** Même carré en sens inverse = trou. */
export const hole = (x: number, y: number, c: number): Point[] => square(x, y, c).slice().reverse()
