import { beforeEach, describe, expect, it } from 'vitest'
import type { SelectableGeometry } from '../../core/Selectables'
import { SelectionOverlay } from './SelectionOverlay'

/**
 * Union des silhouettes de sélection : quand plusieurs se recouvrent, l'overlay masque
 * la portion de chaque contour qui tombe dans l'AIRE d'une voisine → il ne subsiste que
 * le pourtour du groupe. On vérifie le câblage réel (attribut `mask` + fills noirs
 * visibles), pas le pixel.
 */

const circle = (cx: number, cy: number, r: number): SelectableGeometry => ({ kind: 'circle', cx, cy, r })
const openLine = (pts: { x: number; y: number }[]): SelectableGeometry => ({ kind: 'poly', pts, closed: false })
const closedPoly = (pts: { x: number; y: number }[]): SelectableGeometry => ({ kind: 'poly', pts, closed: true })

function makeOverlay() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const overlay = new SelectionOverlay(host)
  const svg = host.querySelector('svg')!
  return { overlay, svg }
}

/** Groupes ants réellement affichés, dans l'ordre = ordre des silhouettes passées. */
function visibleGroups(svg: SVGSVGElement): SVGGElement[] {
  return [...svg.querySelectorAll<SVGGElement>('g.m3d-ants')].filter((g) => g.style.display !== 'none')
}

/** Nombre de fills noirs VISIBLES dans le masque référencé par un groupe (0 si aucun masque). */
function maskFillCount(g: SVGGElement): number {
  const ref = g.getAttribute('mask')
  if (!ref) return 0
  const id = ref.slice(ref.indexOf('#') + 1, ref.length - 1)
  const mask = document.getElementById(id)
  if (!mask) return 0
  return [...mask.querySelectorAll<SVGPathElement>('path')].filter((p) => p.style.display !== 'none').length
}

describe('SelectionOverlay — silhouette d’union', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('deux cercles distants : aucune n’est masquée (elles ne se touchent pas)', () => {
    const { overlay, svg } = makeOverlay()
    overlay.sync([circle(0, 0, 10), circle(100, 100, 10)], null, null, [])
    const groups = visibleGroups(svg)
    expect(groups).toHaveLength(2)
    for (const g of groups) expect(g.hasAttribute('mask')).toBe(false)
  })

  it('deux cercles qui se recouvrent : chacun masqué par l’autre (un fill visible chacun)', () => {
    const { overlay, svg } = makeOverlay()
    overlay.sync([circle(0, 0, 10), circle(12, 0, 10)], null, null, [])
    const groups = visibleGroups(svg)
    expect(groups).toHaveLength(2)
    for (const g of groups) {
      expect(g.hasAttribute('mask')).toBe(true)
      expect(maskFillCount(g)).toBe(1)
    }
  })

  it('un tracé OUVERT ne masque pas un cercle (pas d’aire), mais le cercle masque le tracé', () => {
    const { overlay, svg } = makeOverlay()
    // Silhouette 0 = cercle ; silhouette 1 = ligne qui traverse le cercle.
    overlay.sync(
      [
        circle(0, 0, 10),
        openLine([
          { x: -20, y: 0 },
          { x: 20, y: 0 },
        ]),
      ],
      null,
      null,
      [],
    )
    const [gCircle, gLine] = visibleGroups(svg)
    expect(gCircle!.hasAttribute('mask')).toBe(false) // la ligne n’a pas d’intérieur
    expect(gLine!.hasAttribute('mask')).toBe(true) // le cercle, si
    expect(maskFillCount(gLine!)).toBe(1)
  })

  it('une forme FERMÉE qui recouvre un cercle masque des deux côtés', () => {
    const { overlay, svg } = makeOverlay()
    const box = closedPoly([
      { x: -5, y: -5 },
      { x: 15, y: -5 },
      { x: 15, y: 15 },
      { x: -5, y: 15 },
    ])
    overlay.sync([circle(0, 0, 10), box], null, null, [])
    const groups = visibleGroups(svg)
    for (const g of groups) {
      expect(g.hasAttribute('mask')).toBe(true)
      expect(maskFillCount(g)).toBe(1)
    }
  })

  it('un cercle isolé au milieu de plusieurs recouvrements ne prend que ses voisins réels', () => {
    const { overlay, svg } = makeOverlay()
    // 0 recouvre 1 ; 2 est loin.
    overlay.sync([circle(0, 0, 10), circle(12, 0, 10), circle(200, 200, 10)], null, null, [])
    const [g0, g1, g2] = visibleGroups(svg)
    expect(maskFillCount(g0!)).toBe(1)
    expect(maskFillCount(g1!)).toBe(1)
    expect(g2!.hasAttribute('mask')).toBe(false)
  })

  it('recycle le pool : une sélection plus courte éteint les groupes en trop', () => {
    const { overlay, svg } = makeOverlay()
    overlay.sync([circle(0, 0, 10), circle(12, 0, 10)], null, null, [])
    expect(visibleGroups(svg)).toHaveLength(2)
    overlay.sync([circle(0, 0, 10)], null, null, [])
    expect(visibleGroups(svg)).toHaveLength(1)
    // Le groupe restant n’a plus de voisin → plus de masque.
    expect(visibleGroups(svg)[0]!.hasAttribute('mask')).toBe(false)
  })
})
