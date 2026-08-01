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
import { detectDeviceCaps } from '../config/qualityPresets'
import { BAR_INSET } from '../style/panelGeometry'
import {
  WATERMARK_FONT_PX,
  WATERMARK_FONT_STACK,
  WATERMARK_FONT_WEIGHT,
  WATERMARK_LINE_HEIGHT,
  WATERMARK_TEXT,
} from './watermark/constants'

/** Retrait par rapport aux bords (px) — aligné sur les barres/lecture de la vue. */
const MARGIN = BAR_INSET
/** Marge interne autour du texte, pour ne pas rogner le halo (px logiques). */
const PAD = 3
/** Police du canvas — mêmes métriques que le CSS de la zone de clic (cf. constants). */
const FONT = `${WATERMARK_FONT_WEIGHT} ${WATERMARK_FONT_PX}px ${WATERMARK_FONT_STACK}`
/** Hauteur de la marque (px) : fixe (ne dépend ni du texte ni du runtime). */
const MARK_H = Math.ceil(WATERMARK_FONT_PX * WATERMARK_LINE_HEIGHT + PAD * 2)

export class Watermark {
  private readonly scene = new Scene()
  // Ortho en coordonnées ÉCRAN (origine bas-gauche) : recadrée à chaque `setSize`, elle
  // laisse positionner le quad en pixels sans conversion NDC.
  private readonly camera = new OrthographicCamera(0, 1, 1, 0, -1, 1)
  private readonly geometry = new PlaneGeometry(1, 1)
  private readonly texture: CanvasTexture
  private readonly material: MeshBasicMaterial
  private readonly mesh: Mesh
  // Largeur logique de la marque (px), figée à la peinture de la texture (dépend de
  // `measureText`). La hauteur, elle, est fixe (`MARK_H`).
  private markW = 0

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
    // Objet statique piloté par `setSize` : convention du repo — matrice recomposée à la
    // main (`updateMatrix` dans `setSize`), pas à chaque frame par three.
    this.mesh.matrixAutoUpdate = false
    this.scene.add(this.mesh)
  }

  /**
   * Peint « map3D » sur un canvas 2D et en fait une texture. Fait UNE fois.
   * Robuste à l'absence de contexte 2D (jsdom en test) : la texture reste vide mais
   * l'objet se construit et se rend sans lever.
   */
  private paint(text: string): CanvasTexture {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.font = FONT
      this.markW = Math.ceil(ctx.measureText(text).width + PAD * 2)
      const dpr = Math.min(detectDeviceCaps().dpr, 2)
      canvas.width = Math.max(1, Math.round(this.markW * dpr))
      canvas.height = Math.max(1, Math.round(MARK_H * dpr))
      // Le redimensionnement du canvas remet le contexte à zéro : re-régler après.
      ctx.scale(dpr, dpr)
      ctx.font = FONT
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      // Halo sombre : garde le texte lisible sur un décor clair comme sombre.
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 2
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillText(text, PAD, MARK_H / 2)
    } else {
      // Pas de contexte 2D (environnement de test) : quad non nul, texture vide — la
      // marque peinte n'est jamais observée dans ce cas.
      this.markW = MARK_H
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
    this.mesh.scale.set(this.markW, MARK_H, 1)
    // Centre du quad : collé au coin bas-droit, à MARGIN des deux bords.
    this.mesh.position.set(width - MARGIN - this.markW / 2, MARGIN + MARK_H / 2, 0)
    // `matrixAutoUpdate=false` : la transform ne serait sinon jamais appliquée.
    this.mesh.updateMatrix()
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
