// Signature « map3D » PEINTE DANS LE CANVAS WebGL, en bas à droite.
//
// Pourquoi dans les pixels et pas en DOM : un overlay HTML se masque en une ligne de
// CSS (`display:none`) ou se retire du DOM à l'exécution. Peinte ici, la marque fait
// partie de l'image rendue — insensible au CSS de l'hôte, aux classes d'état
// (`.m3d-intro`, `.m3d-immersive`, `.m3d-inert`) et à toute manipulation du DOM. La
// casser impose d'éditer puis recompiler la source du moteur, ce qui reste une
// violation traçable de la licence PolyForm-Noncommercial. Le lien cliquable, lui, est
// un doublon DOM transparent posé par-dessus (`WatermarkLink`) : le retirer n'enlève
// que l'affordance de clic, jamais ces pixels.
//
// Style FIXE (blanc + halo sombre, comme `.m3d-reticle`), volontairement hors thème :
// une couleur surchargeable serait un vecteur de suppression (transparent = invisible).
// Lisible sur globe clair comme sur tuiles sombres.
//
// Coût par frame : un seul quad texturé, `depthTest:false`, aucune allocation (texture,
// géométrie, matériau et caméra créés une fois). La texte n'est peinte qu'au montage.

import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  type WebGLRenderer,
} from 'three'
import { BAR_INSET } from '../style/panelGeometry'
import { WATERMARK_TEXT } from './watermark/constants'

/** Retrait par rapport aux bords (px) — aligné sur les barres/lecture de la vue. */
const MARGIN = BAR_INSET
/** Corps du texte (px logiques) — même petite taille que le bloc de lecture de la vue. */
const FONT_PX = 13
/** Marge interne autour du texte, pour ne pas rogner le halo (px logiques). */
const PAD = 3

export class Watermark {
  private readonly scene = new Scene()
  // Ortho en coordonnées ÉCRAN (origine bas-gauche) : recadrée à chaque `setSize`, elle
  // laisse positionner le quad en pixels sans conversion NDC.
  private readonly camera = new OrthographicCamera(0, 1, 1, 0, -1, 1)
  private readonly geometry = new PlaneGeometry(1, 1)
  private readonly texture: CanvasTexture
  private readonly material: MeshBasicMaterial
  private readonly mesh: Mesh
  // Taille logique de la marque (px), figée à la peinture de la texture.
  private markW = 0
  private markH = 0

  constructor(text: string = WATERMARK_TEXT) {
    this.texture = this.paint(text)
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      // Composite par-dessus la carte déjà peinte, sans être occulté par le depth.
      depthTest: false,
      depthWrite: false,
      // Sans ça, le tone mapping du renderer assombrit le blanc de la marque.
      toneMapped: false,
    })
    this.mesh = new Mesh(this.geometry, this.material)
    this.scene.add(this.mesh)
  }

  /**
   * Peint « map3D » sur un canvas 2D et en fait une texture. Fait UNE fois.
   * Robuste à l'absence de contexte 2D (jsdom en test) : la texture reste vide mais
   * l'objet se construit et se rend sans lever.
   */
  private paint(text: string): CanvasTexture {
    const canvas = document.createElement('canvas')
    const dpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2)
    const ctx = canvas.getContext('2d')
    const font = `600 ${FONT_PX}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
    if (ctx) {
      ctx.font = font
      const textW = ctx.measureText(text).width
      this.markW = Math.ceil(textW + PAD * 2)
      this.markH = Math.ceil(FONT_PX * 1.4 + PAD * 2)
      canvas.width = Math.max(1, Math.round(this.markW * dpr))
      canvas.height = Math.max(1, Math.round(this.markH * dpr))
      // Le redimensionnement du canvas remet le contexte à zéro : re-régler après.
      ctx.scale(dpr, dpr)
      ctx.font = font
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      // Halo sombre : garde le texte lisible sur un décor clair comme sombre.
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 2
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillText(text, PAD, this.markH / 2)
    } else {
      // Pas de contexte 2D (environnement de test) : dimensions de repli, canvas 1×1.
      this.markW = Math.ceil(text.length * FONT_PX * 0.6 + PAD * 2)
      this.markH = Math.ceil(FONT_PX * 1.4 + PAD * 2)
      canvas.width = 1
      canvas.height = 1
    }
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    // HUD : ni mipmaps ni filtrage mip (canvas NPOT), juste un filtrage linéaire net.
    texture.minFilter = LinearFilter
    texture.generateMipmaps = false
    return texture
  }

  /** Recadre l'ortho et repositionne la marque en bas à droite (appelé à chaque resize). */
  setSize(width: number, height: number): void {
    this.camera.right = width
    this.camera.top = height
    this.camera.updateProjectionMatrix()
    this.mesh.scale.set(this.markW, this.markH, 1)
    // Centre du quad : collé au coin bas-droit, à MARGIN des deux bords.
    this.mesh.position.set(width - MARGIN - this.markW / 2, MARGIN + this.markH / 2, 0)
  }

  /**
   * Peint la marque par-dessus la frame courante. `autoClear` est coupé le temps du
   * rendu (sinon three effacerait la carte déjà peinte) puis restauré — l'appelant garde
   * son réglage habituel pour la frame suivante.
   */
  render(renderer: WebGLRenderer): void {
    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.render(this.scene, this.camera)
    renderer.autoClear = prevAutoClear
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
  }
}
