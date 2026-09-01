import { mdiLock } from '@mdi/js'
import type { PointerPhase } from '../../core/pointer'
import type { SelectableGeometry } from '../../core/Selectables'
import type { HandleId, HandleSpec } from './EditController'
import type { ScreenBBox, ScreenPt } from './hitTest'
import type { SelectMode } from './SelectionManager'

const SVG_NS = 'http://www.w3.org/2000/svg'
const HANDLE_SIZE = 9
/** Marge (px) autour de la bbox d'une silhouette pour la région de son masque — couvre
 *  la demi-largeur du trait qui déborde du contour exact. */
const MASK_PAD = 4
/** Suffixe d'id de masque unique PAR overlay : deux cartes montent deux SVG dans le même
 *  document, les ids de `<mask>` doivent y rester distincts. */
let overlaySeq = 0

export type OverlayShape = { pts: ScreenPt[]; closed: boolean }

/**
 * Une silhouette rendue : ses deux traits ants (blanc plein + tirets noirs) et son masque
 * d'union. Le masque = un voile blanc (tout visible) percé par les *fills* NOIRS des
 * silhouettes voisines qui la recouvrent → seul le pourtour de l'union subsiste. Poolé,
 * jamais recréé par frame.
 */
type AntEntry = {
  g: SVGGElement
  under: SVGPathElement
  over: SVGPathElement
  mask: SVGMaskElement
  maskRect: SVGRectElement
  /** Fills noirs des voisins recouvrants (poolés, `display:none` quand inutilisés). */
  maskFills: SVGPathElement[]
}

/**
 * Couche SVG plein écran de l'outil sélection : contours « marching ants » des
 * formes sélectionnées, bbox englobante, tracé du marquee/lasso, flash cadenas
 * des formes verrouillées. Tout est en **px écran** (resynchronisé chaque frame
 * par `DrawLayer.project`) — jamais de géométrie monde ici.
 */
export class SelectionOverlay {
  /** Drag d'une poignée (down/move/up, pointer capture sur la poignée elle-même). */
  onHandle?: (id: HandleId, phase: PointerPhase, e: PointerEvent) => void

  private readonly svg: SVGSVGElement
  private readonly antsG: SVGGElement
  /** Réceptacle des `<mask>` d'union (hors flux de peinture). */
  private readonly defs: SVGDefsElement
  /** Id unique de cet overlay dans le document — préfixe des ids de masque. */
  private readonly uid = overlaySeq++
  private readonly bboxRect: SVGRectElement
  /** Sous-trait du marquee (blanc plein + fond translucide) — même langage que les formes. */
  private readonly marqueeUnder: SVGPathElement
  private readonly marqueePath: SVGPathElement
  private readonly handlesG: SVGGElement
  private readonly antPool: AntEntry[] = []
  /** Scratch poolé : bbox + attribut `d` de chaque silhouette, calculés UNE fois par sync
   *  (réutilisés par le broad-phase ET les fills de masque) — zéro alloc par frame. */
  private readonly boxScratch: ScreenBBox[] = []
  private readonly dScratch: string[] = []
  private readonly handlePool: SVGRectElement[] = []
  private currentHandles: readonly HandleSpec[] = []
  private dragHandle: HandleId | null = null

  constructor(overlay: HTMLElement) {
    this.svg = document.createElementNS(SVG_NS, 'svg')
    this.svg.classList.add('m3d-edit-svg')
    this.defs = document.createElementNS(SVG_NS, 'defs')
    this.antsG = document.createElementNS(SVG_NS, 'g')
    this.bboxRect = document.createElementNS(SVG_NS, 'rect')
    this.bboxRect.classList.add('m3d-selbox')
    this.bboxRect.style.display = 'none'
    this.marqueeUnder = document.createElementNS(SVG_NS, 'path')
    this.marqueeUnder.classList.add('m3d-marquee-under')
    this.marqueeUnder.style.display = 'none'
    this.marqueePath = document.createElementNS(SVG_NS, 'path')
    this.marqueePath.classList.add('m3d-marquee')
    this.marqueePath.style.display = 'none'
    this.handlesG = document.createElementNS(SVG_NS, 'g')
    this.svg.append(this.defs, this.antsG, this.bboxRect, this.marqueeUnder, this.marqueePath, this.handlesG)
    overlay.appendChild(this.svg)
  }

  /**
   * L'élément qui porte l'emprise écran de la sélection.
   *
   * Publié parce qu'il est la seule chose qui sache OÙ est la sélection à l'écran : une
   * surface qui traite la forme sélectionnée peut ainsi s'ouvrir près d'elle, et non au
   * niveau d'un bouton de barre. Rendu en lecture seule : personne d'autre n'écrit dedans.
   */
  get boxEl(): SVGRectElement {
    return this.bboxRect
  }

  /** Resynchronise contours + bbox + marquee + poignées (chaque frame, passe projection). */
  sync(
    shapes: readonly SelectableGeometry[],
    bbox: ScreenBBox | null,
    marquee: { pts: ScreenPt[]; kind: SelectMode } | null,
    handles: readonly HandleSpec[] = [],
  ): void {
    // Pool de silhouettes : réutilisées d'une frame à l'autre, jamais recréées par frame.
    // Marching ants noir/blanc (2 paths superposés : blanc plein + tirets noirs animés) —
    // lisible sur N'IMPORTE QUEL fond, contrairement à une couleur fixe. Markers, clusters
    // et tracés y peignent le MÊME langage — d'où l'union quand ils se recouvrent.
    while (this.antPool.length < shapes.length) this.antPool.push(this.createAntEntry(this.antPool.length))
    // bbox + `d` de chaque silhouette calculés UNE fois (scratch poolé) : le broad-phase et
    // les fills de masque les relisent sans reconstruire la string du voisin à chaque paire.
    while (this.boxScratch.length < shapes.length) this.boxScratch.push({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i]!
      boxInto(shape, this.boxScratch[i]!)
      this.dScratch[i] = hasContour(shape) ? geometryD(shape) : ''
    }
    this.dScratch.length = shapes.length
    for (let i = 0; i < this.antPool.length; i++) {
      const el = this.antPool[i]!
      const shape = shapes[i]
      if (!shape || !hasContour(shape)) {
        el.g.style.display = 'none'
        continue
      }
      const d = this.dScratch[i]!
      el.under.setAttribute('d', d)
      el.over.setAttribute('d', d)
      // UNION : masquer la portion de CE contour tombant dans l'aire d'une silhouette
      // VOISINE (broad-phase par bbox) → ne subsiste que le pourtour du groupe. Seules
      // les silhouettes qui ont une AIRE masquent (cercle, forme fermée) : une polyligne
      // ouverte (tracé) n'a pas d'intérieur, elle ne cache rien. Sans voisin recouvrant,
      // aucun masque (chemin le plus courant, le moins cher).
      const box = this.boxScratch[i]!
      let fills = 0
      for (let j = 0; j < shapes.length; j++) {
        const other = shapes[j]
        if (j === i || !other || !isFillable(other)) continue
        if (!boxesOverlap(box, this.boxScratch[j]!)) continue
        const mf = this.ensureMaskFill(el, fills++)
        mf.setAttribute('d', this.dScratch[j]!)
        mf.style.display = ''
      }
      for (let k = fills; k < el.maskFills.length; k++) el.maskFills[k]!.style.display = 'none'
      if (fills > 0) {
        // Région du masque (unités écran) = bbox du contour élargie du trait : le voile
        // blanc n'a pas à couvrir tout le canvas, seulement l'emprise utile.
        setRegion(el.mask, box, MASK_PAD)
        setRegion(el.maskRect, box, MASK_PAD)
        el.g.setAttribute('mask', `url(#${this.maskId(i)})`)
      } else {
        el.g.removeAttribute('mask')
      }
      el.g.style.display = ''
    }
    if (bbox) {
      this.bboxRect.setAttribute('x', String(bbox.minX))
      this.bboxRect.setAttribute('y', String(bbox.minY))
      this.bboxRect.setAttribute('width', String(bbox.maxX - bbox.minX))
      this.bboxRect.setAttribute('height', String(bbox.maxY - bbox.minY))
      this.bboxRect.style.display = ''
    } else {
      this.bboxRect.style.display = 'none'
    }
    if (marquee) {
      const d = pathD(marquee.pts, marquee.kind !== 'poly')
      this.marqueeUnder.setAttribute('d', d)
      this.marqueePath.setAttribute('d', d)
      this.marqueeUnder.style.display = ''
      this.marqueePath.style.display = ''
    } else {
      this.marqueeUnder.style.display = 'none'
      this.marqueePath.style.display = 'none'
    }
    this.syncHandles(handles)
  }

  /** Crée une entrée de pool (deux traits ants + son masque d'union vide). */
  private createAntEntry(index: number): AntEntry {
    const g = document.createElementNS(SVG_NS, 'g')
    g.classList.add('m3d-ants')
    const under = document.createElementNS(SVG_NS, 'path')
    under.classList.add('m3d-ants-under')
    const over = document.createElementNS(SVG_NS, 'path')
    over.classList.add('m3d-ants-over')
    g.append(under, over)
    this.antsG.appendChild(g)
    const mask = document.createElementNS(SVG_NS, 'mask')
    mask.setAttribute('id', this.maskId(index))
    // Coordonnées écran (et non bbox relative) pour le voile et les fills.
    mask.setAttribute('maskUnits', 'userSpaceOnUse')
    const maskRect = document.createElementNS(SVG_NS, 'rect')
    maskRect.setAttribute('fill', '#fff')
    mask.appendChild(maskRect)
    this.defs.appendChild(mask)
    return { g, under, over, mask, maskRect, maskFills: [] }
  }

  /** Fill noir poolé d'un masque (voisin recouvrant), créé à la demande. */
  private ensureMaskFill(entry: AntEntry, idx: number): SVGPathElement {
    let mf = entry.maskFills[idx]
    if (!mf) {
      mf = document.createElementNS(SVG_NS, 'path')
      mf.setAttribute('fill', '#000')
      entry.mask.appendChild(mf)
      entry.maskFills[idx] = mf
    }
    return mf
  }

  private maskId(i: number): string {
    return `m3d-selmask-${this.uid}-${i}`
  }

  private syncHandles(handles: readonly HandleSpec[]): void {
    this.currentHandles = handles
    while (this.handlePool.length < handles.length) this.handlePool.push(this.createHandle(this.handlePool.length))
    for (let i = 0; i < this.handlePool.length; i++) {
      const el = this.handlePool[i]!
      const spec = handles[i]
      if (!spec) {
        el.style.display = 'none'
        continue
      }
      const size = spec.kind === 'vertex' ? HANDLE_SIZE - 1 : HANDLE_SIZE
      el.setAttribute('x', String(spec.x - size / 2))
      el.setAttribute('y', String(spec.y - size / 2))
      el.setAttribute('width', String(size))
      el.setAttribute('height', String(size))
      el.setAttribute('rx', spec.kind === 'vertex' ? String(size / 2) : '2')
      el.classList.toggle('m3d-vhandle', spec.kind === 'vertex')
      el.style.cursor = spec.cursor
      el.style.display = ''
    }
  }

  /** Poignée poolée : les listeners lisent la spec courante via l'index — jamais recréés. */
  private createHandle(index: number): SVGRectElement {
    const el = document.createElementNS(SVG_NS, 'rect')
    el.classList.add('m3d-handle')
    el.addEventListener('pointerdown', (e) => {
      const spec = this.currentHandles[index]
      if (!spec || !this.onHandle) return
      e.stopPropagation()
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      this.dragHandle = spec.id
      this.onHandle(spec.id, 'down', e)
    })
    el.addEventListener('pointermove', (e) => {
      if (this.dragHandle && this.onHandle) this.onHandle(this.dragHandle, 'move', e)
    })
    const endDrag = (e: PointerEvent) => {
      if (this.dragHandle && this.onHandle) {
        this.onHandle(this.dragHandle, 'up', e)
        this.dragHandle = null
      }
    }
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    this.handlesG.appendChild(el)
    return el
  }

  /** Flash bref (contour gris + cadenas) : « cette forme est protégée ». */
  flashLock(shape: OverlayShape | null, center: ScreenPt, durationMs: number): void {

    const g = document.createElementNS(SVG_NS, 'g')
    g.classList.add('m3d-lockflash')
    if (shape && shape.pts.length > 1) {
      const p = document.createElementNS(SVG_NS, 'path')
      p.setAttribute('d', pathD(shape.pts, shape.closed))
      g.appendChild(p)
    }
    const icon = document.createElementNS(SVG_NS, 'path')
    icon.setAttribute('d', mdiLock)
    icon.setAttribute('transform', `translate(${center.x - 11}, ${center.y - 11}) scale(0.92)`)
    icon.classList.add('m3d-lockflash-icon')
    g.appendChild(icon)
    this.svg.appendChild(g)
    window.setTimeout(() => g.remove(), durationMs)

  }

  dispose(): void {
    this.svg.remove()
  }
}

function pathD(pts: readonly ScreenPt[], closed: boolean): string {
  let d = `M${pts[0]!.x} ${pts[0]!.y}`
  for (let i = 1; i < pts.length; i++) d += `L${pts[i]!.x} ${pts[i]!.y}`
  return closed ? `${d}Z` : d
}

/** Attribut `d` d'une silhouette — polyligne ou cercle. */
function geometryD(geo: SelectableGeometry): string {
  return geo.kind === 'circle' ? circleD(geo.cx, geo.cy, geo.r) : pathD(geo.pts, geo.closed)
}

/** Cercle complet en `path` (deux demi-arcs) : masquable et animable au `stroke-dashoffset`
 *  comme les tracés — un `<circle>` ne pourrait pas cohabiter dans le pool de `<path>`. */
function circleD(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`
}

/** Une silhouette a-t-elle de quoi être tracée ? (une polyligne d'un seul point n'a pas de contour) */
function hasContour(geo: SelectableGeometry): boolean {
  return geo.kind === 'circle' ? geo.r > 0 : geo.pts.length > 1
}

/** Une silhouette a-t-elle une AIRE ? Seules celles-ci masquent (union). Une polyligne
 *  ouverte (tracé) n'a pas d'intérieur : elle ne cache rien. */
function isFillable(geo: SelectableGeometry): boolean {
  return geo.kind === 'circle' || geo.closed
}

/** Remplit une bbox poolée (`ScreenBBox`, cf. hitTest) — mutation en place, zéro alloc.
 *  La branche polyligne inline le balayage min/max (plutôt que `screenBBox`, qui alloue)
 *  pour rester dans le budget par frame. */
function boxInto(geo: SelectableGeometry, out: ScreenBBox): void {
  if (geo.kind === 'circle') {
    out.minX = geo.cx - geo.r
    out.minY = geo.cy - geo.r
    out.maxX = geo.cx + geo.r
    out.maxY = geo.cy + geo.r
    return
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of geo.pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  out.minX = minX
  out.minY = minY
  out.maxX = maxX
  out.maxY = maxY
}

function boxesOverlap(a: ScreenBBox, b: ScreenBBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

/** Pose x/y/width/height (unités écran) sur un élément à partir d'une bbox élargie. */
function setRegion(el: Element, box: ScreenBBox, pad: number): void {
  el.setAttribute('x', String(box.minX - pad))
  el.setAttribute('y', String(box.minY - pad))
  el.setAttribute('width', String(box.maxX - box.minX + 2 * pad))
  el.setAttribute('height', String(box.maxY - box.minY + 2 * pad))
}
