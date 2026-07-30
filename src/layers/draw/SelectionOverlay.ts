import { mdiLock } from '@mdi/js'
import type { PointerPhase } from '../../core/MapEngine'
import type { HandleId, HandleSpec } from './EditController'
import type { ScreenBBox, ScreenPt } from './hitTest'
import type { SelectMode } from './SelectionManager'

const SVG_NS = 'http://www.w3.org/2000/svg'
const HANDLE_SIZE = 9

export type OverlayShape = { pts: ScreenPt[]; closed: boolean }

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
  private readonly bboxRect: SVGRectElement
  /** Sous-trait du marquee (blanc plein + fond translucide) — même langage que les formes. */
  private readonly marqueeUnder: SVGPathElement
  private readonly marqueePath: SVGPathElement
  private readonly handlesG: SVGGElement
  private readonly antPool: Array<{ g: SVGGElement; under: SVGPathElement; over: SVGPathElement }> = []
  private readonly handlePool: SVGRectElement[] = []
  private currentHandles: readonly HandleSpec[] = []
  private dragHandle: HandleId | null = null

  constructor(overlay: HTMLElement) {
    this.svg = document.createElementNS(SVG_NS, 'svg')
    this.svg.classList.add('m3d-edit-svg')
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
    this.svg.append(this.antsG, this.bboxRect, this.marqueeUnder, this.marqueePath, this.handlesG)
    overlay.appendChild(this.svg)
  }

  /**
   * L'élément qui porte l'emprise écran de la sélection.
   *
   * Publié parce qu'il est la seule chose qui sache OÙ est la sélection à l'écran : le
   * panneau de style s'ancre dessus pour s'ouvrir au niveau de la forme, et non au
   * niveau du bouton de la barre — un panneau qui règle une forme doit se trouver près
   * d'elle. Rendu en lecture seule : personne d'autre n'écrit dedans.
   */
  get boxEl(): SVGRectElement {
    return this.bboxRect
  }

  /** Resynchronise contours + bbox + marquee + poignées (chaque frame, passe projection). */
  sync(
    shapes: readonly OverlayShape[],
    bbox: ScreenBBox | null,
    marquee: { pts: ScreenPt[]; kind: SelectMode } | null,
    handles: readonly HandleSpec[] = [],
  ): void {
    // Pool de contours : réutilisés d'une frame à l'autre, jamais recréés par frame.
    // Marching ants noir/blanc (2 paths superposés : blanc plein + tirets noirs
    // animés) — lisible sur N'IMPORTE QUEL fond, contrairement à une couleur fixe.
    while (this.antPool.length < shapes.length) {
      const g = document.createElementNS(SVG_NS, 'g')
      g.classList.add('m3d-ants')
      const under = document.createElementNS(SVG_NS, 'path')
      under.classList.add('m3d-ants-under')
      const over = document.createElementNS(SVG_NS, 'path')
      over.classList.add('m3d-ants-over')
      g.append(under, over)
      this.antsG.appendChild(g)
      this.antPool.push({ g, under, over })
    }
    for (let i = 0; i < this.antPool.length; i++) {
      const el = this.antPool[i]!
      const shape = shapes[i]
      if (shape && shape.pts.length > 1) {
        const d = pathD(shape.pts, shape.closed)
        el.under.setAttribute('d', d)
        el.over.setAttribute('d', d)
        el.g.style.display = ''
      } else {
        el.g.style.display = 'none'
      }
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
  flashLock(shape: OverlayShape | null, center: ScreenPt): void {
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
    window.setTimeout(() => g.remove(), 800)
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
