import * as THREE from 'three'
import type { SkyConfig } from '../config/types'
import type { LatLng } from '../shared'
import type { CameraState } from './Camera'
import { clamp, easeInOutCubic, TAU } from './math'
import type { Projection } from './Projection'
import { Sky } from './Sky'
import { subsolarPoint } from './sun'

// Rayon de la sphère d'étoiles (repère local, avant mise à l'échelle par frame). La valeur
// exacte importe peu : le rayon monde est recalé chaque frame sous le far courant.
const STAR_RADIUS = 1e7

/**
 * Sous-système « ciel » du moteur : fond étoilé (`THREE.Points`) et skydome atmosphérique
 * procédural (`Sky`). Détient son propre état (étoiles, dome, point subsolaire figé,
 * instant de montage) ; le moteur l'instancie, l'appelle aux mêmes moments qu'avant et lit
 * `active` pour savoir si le dome existe. Ses dépendances (scène, caméra, projection) sont
 * injectées ; la config est passée à l'appel (le moteur reste la source de vérité).
 */
export class SkyController {
  private stars: THREE.Points | null = null
  /** Ciel atmosphérique procédural (null quand `config.sky.enabled` est faux). */
  private sky: Sky | null = null
  /** Point subsolaire figé (dépend de la seule date) — recalculé à `applySky`, pas par frame. */
  private subsolar: LatLng = { lat: 0, lng: 0 }
  /** Instant du soleil résolu (ms epoch) ; capturé une fois quand `config.sky.date` vaut 0. */
  private skyEpoch = 0

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly projection: Projection,
  ) {}

  /** Le dome atmosphérique existe-t-il ? (le fond dépend de sa présence, cf. brouillard piéton). */
  get active(): boolean {
    return this.sky !== null
  }

  /**
   * Fond étoilé : ajouté à la scène, rendu en premier (renderOrder -1, sans écrire le depth)
   * → toujours derrière la carte, sans altérer le pipeline. Monté une fois.
   */
  mountStars(): void {
    this.stars = this.buildStars()
    this.scene.add(this.stars)
  }

  private buildStars(): THREE.Points {
    const count = 2600
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const R = STAR_RADIUS
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1
      const theta = Math.random() * TAU
      const s = Math.sqrt(1 - u * u)
      pos[i * 3] = R * s * Math.cos(theta)
      pos[i * 3 + 1] = R * s * Math.sin(theta)
      pos[i * 3 + 2] = R * u
      const b = 0.55 + Math.random() * 0.45
      col[i * 3] = b
      col[i * 3 + 1] = b
      col[i * 3 + 2] = Math.min(1, b + 0.06) // léger bleuté
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mat = new THREE.PointsMaterial({
      size: 2,
      sizeAttenuation: false,
      vertexColors: true,
      depthTest: false,
      depthWrite: false,
    })
    const stars = new THREE.Points(geo, mat)
    stars.renderOrder = -1
    stars.frustumCulled = false
    return stars
  }

  /**
   * (Re)configure le ciel depuis `config.sky` : le crée/le détruit selon `enabled`, pousse
   * les uniforms statiques (atmosphère + nuages) et fige le point subsolaire depuis la date.
   * Appelée au montage et à chaque `setConfig` — jamais par frame.
   */
  applySky(cfg: SkyConfig): void {
    if (!cfg.enabled) {
      if (this.sky) {
        this.scene.remove(this.sky)
        this.sky.dispose()
        this.sky = null
      }
      return
    }
    if (!this.sky) {
      this.sky = new Sky()
      this.scene.add(this.sky)
    }
    const u = this.sky.uniforms
    u.turbidity.value = cfg.turbidity
    u.rayleigh.value = cfg.rayleigh
    u.mieCoefficient.value = cfg.mieCoefficient
    u.mieDirectionalG.value = cfg.mieDirectionalG
    u.cloudCoverage.value = cfg.clouds.coverage
    u.cloudDensity.value = cfg.clouds.density
    u.cloudScale.value = cfg.clouds.scale
    u.cloudElevation.value = cfg.clouds.elevation
    // `date` explicite (> 0) : instant fixe. Sinon on fige l'heure de montage, capturée
    // une seule fois puis conservée (jour/nuit stable au fil des `setConfig`).
    if (cfg.date > 0) {
      this.subsolar = subsolarPoint(new Date(cfg.date))
    } else {
      if (this.skyEpoch === 0) this.skyEpoch = Date.now()
      this.subsolar = subsolarPoint(new Date(this.skyEpoch))
    }
  }

  /**
   * Passe par frame : d'abord recaler les étoiles sous le far courant, puis fondre/orienter
   * le dome. L'ordre (étoiles → ciel) et les gardes internes reproduisent la séquence que
   * `MapEngine.tick()` exécutait en ligne.
   */
  update(cfg: SkyConfig, state: CameraState): void {
    this.updateStars()
    this.updateSky(cfg, state)
  }

  private updateStars(): void {
    // Étoiles en skybox : collées à la caméra, et surtout RECALÉES sous le far courant.
    // GlobeControls resserre le far à ~distance-horizon (bien < STAR_RADIUS) en vue posée :
    // à rayon fixe, les étoiles étaient clippées, d'où la grande bande noire entre l'espace
    // (haut) et le ciel (bas). On garde donc leur rayon monde à 0.9·far — toujours dans le
    // frustum. `sizeAttenuation:false` fige la taille écran et `depthTest:false` les tient
    // derrière la carte : ni la distance ni l'échelle ne se voient, seule la visibilité change.
    if (this.stars) {
      this.stars.position.copy(this.camera.position)
      this.stars.scale.setScalar((this.camera.far * 0.9) / STAR_RADIUS)
    }
  }

  /**
   * Fondu et orientation du ciel, par frame. Opacité déduite de l'altitude (invisible au-
   * dessus de `fade.start` → plein sous `fade.end`) : au-delà, on sort tôt et le ciel ne
   * coûte rien en vue globe. Sinon on oriente `up` (verticale locale) et `sunPosition`
   * (normale au point subsolaire) en repère monde, et on colle le dome à la caméra.
   */
  private updateSky(cfg: SkyConfig, state: CameraState): void {
    const sky = this.sky
    if (!sky) return
    const { start, end } = cfg.fade
    const opacity = easeInOutCubic(clamp((start - state.altitude) / Math.max(1, start - end), 0, 1))
    if (opacity <= 0) {
      sky.visible = false
      return
    }
    sky.visible = true
    const u = sky.uniforms
    u.opacity.value = opacity
    // Écrit droit dans les Vector3 des uniforms (déjà alloués) — pas de scratch ni de
    // copie, et `state` sert de `LatLng` sans littéral intermédiaire. Zéro-alloc par frame.
    this.projection.worldNormal(state, u.up.value)
    this.projection.worldNormal(this.subsolar, u.sunPosition.value)
    sky.position.copy(this.camera.position)
    /**
     * Grand devant la caméra pour remplir l'écran sans être rogné par le near ; la
     * profondeur est de toute façon forcée au far par le shader.
     *
     * ⚠️ Le plancher était ABSOLU (100 km). En mode piéton le far tombe à la distance de
     * vue (~1 km) : le dôme se retrouvait entièrement au-delà du plan lointain, donc éliminé
     * par le frustum culling — ciel noir. Le plancher est désormais relatif au near, ce qui
     * garde le dôme DANS le frustum quelle que soit la profondeur de vue.
     */
    sky.scale.setScalar(Math.max(this.camera.far * 0.5, this.camera.near * 100))
  }

  /** Libère les ressources GPU des étoiles et du dome. */
  dispose(): void {
    if (this.stars) {
      this.stars.geometry.dispose()
      ;(this.stars.material as THREE.Material).dispose()
    }
    if (this.sky) this.sky.dispose()
  }
}
