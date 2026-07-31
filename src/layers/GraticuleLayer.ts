import * as THREE from 'three'
import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig } from '../config/types'
import { clearGroup, disposeObject3D } from '../core/geometry'
import {
  bandFor,
  type GraticuleBand,
  type GraticuleLine,
  type GraticuleTexts,
  labelFor,
  linesFor,
  pickLevel,
  smoothstep,
  visibleSpanDeg,
} from '../core/graticule'
import { EnuFrame, tiltFromNadir } from '../core/enu'
import type { FrameContext, Layer } from '../core/Layer'
import type { Projection, ScreenPoint } from '../core/Projection'
import { RAD2DEG } from '../core/math'
import type { LatLng } from '../shared'

/**
 * Classes de l'étiquette.
 *
 * Le composant React `MarkerTip` n'est PAS monté : la couche vit hors React, et publier
 * quarante positions par frame vers un `setState` serait le contre-patron que ce projet
 * évite. Seul le CSS est mutualisé — d'où cette constante, qui est le seul endroit où le
 * lien avec `MarkerTip` est écrit, donc le seul à corriger s'il change.
 */
const LABEL_CLASS = 'm3d-markertip m3d-graticule-label'
const LABEL_TITLE_CLASS = 'm3d-markertip-title'

/**
 * Couleurs de repli quand le thème hôte est antérieur à `colors.graticule`. Doivent rester
 * ALIGNÉES sur `defaultTheme.colors.graticule` : deux jaunes différents selon l'ancienneté du
 * thème seraient un défaut invisible en développement et voyant en production.
 */
const FALLBACK_COLORS = { line: '#ffd54a', remarkable: '#ff8f00' } as const

/**
 * Écart au centre du placement `'edges'`, en fraction de la hauteur visible. 0,45 et non 0,5 :
 * une étiquette pile sur le bord serait à demi coupée par le cull de viewport.
 */
const EDGE_OFFSET = 0.45

/**
 * Inclinaison maximale d'une étiquette (degrés) avant qu'elle ne bascule d'un quart de tour.
 * 45° : la moitié de l'angle droit, donc le point où « le long de la ligne » cesse d'être
 * plus lisible que « en travers ».
 */
const LABEL_TILT_MAX = 45

export type GraticuleColors = { line: string; remarkable: string }

/**
 * Grille de coordonnées géographiques drapée sur le globe.
 *
 * Coût par frame : une lecture d'inclinaison, une écriture d'opacité, et le repositionnement
 * de quelques dizaines d'étiquettes. La géométrie n'est reconstruite que sur TROIS
 * événements — maille changée, centre sorti de la bande, hauteur de drapage dérivée — jamais
 * sur la frame.
 *
 * ⚠️ Ne lit JAMAIS `ctx.view` : ce getter déclenche `viewportBounds()`, une grille de 25
 * raycasts d'ellipsoïde que le moteur réserve aux consommateurs hors boucle de frame. Tout
 * ce dont la couche a besoin se dérive de `ctx.cameraState.altitude`.
 */
export class GraticuleLayer implements Layer {
  readonly group = new THREE.Group()
  private config: MapConfig = defaultConfig
  private visible = false
  /** Plafond d'inclinaison du mode courant (rad) — poussé par le wrapper React. */
  private maxTilt = defaultConfig.camera.maxTilt3d
  private colors: GraticuleColors = FALLBACK_COLORS
  private texts: GraticuleTexts

  private level: number | null = null
  private band: GraticuleBand | null = null
  private builtHeight = 0
  private builtLat = 0
  private builtLng = 0
  private lines: GraticuleLine[] = []

  /** Opacité du fondu (0–1), multipliée par les opacités de config. */
  private fade = 1
  /**
   * Jeu de la maille PRÉCÉDENTE, en cours d'effacement. Deux jeux coexistent le temps du
   * fondu croisé, jamais au-delà : sans lui, la maille saute d'un cran en une frame, au
   * moment même où l'œil suit le zoom.
   */
  private outgoing: { group: THREE.Group; fade: number } | null = null

  /** Pool d'étiquettes : créées UNE fois, recyclées — jamais recréées par frame. */
  private readonly labelPool: HTMLElement[] = []

  // Scratch de la boucle de frame — aucune allocation par frame.
  private readonly scratch = new THREE.Vector3()
  private readonly scratchB = new THREE.Vector3()
  private readonly tiltScratch = new THREE.Vector3()
  // Deux ancres DISTINCTES : `screenAngle` a besoin du point d'ancrage ET d'un second point
  // le long de la ligne en même temps. Les partager ferait s'écraser le premier par le
  // second, et l'angle mesuré serait nul.
  private readonly anchor: LatLng = { lat: 0, lng: 0 }
  private readonly anchorB: LatLng = { lat: 0, lng: 0 }
  /** Hauteur visible (degrés) de la dernière frame — sert le placement aux bords. */
  private lastSpan = 0
  // `worldToScreen` ALLOUE son résultat quand on ne lui donne pas de cible : trois points
  // par étiquette et par frame, sinon.
  private readonly sp: ScreenPoint = { sx: 0, sy: 0, z: 0 }
  private readonly spA: ScreenPoint = { sx: 0, sy: 0, z: 0 }
  private readonly spB: ScreenPoint = { sx: 0, sy: 0, z: 0 }

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly projection: Projection,
    private readonly overlay: HTMLElement,
    texts: GraticuleTexts,
  ) {
    this.texts = texts
    this.group.name = 'graticule'
    this.group.visible = false
    this.scene.add(this.group)
  }

  setConfig(config: MapConfig): void {
    this.config = config
    // Les réglages de densité changent la géométrie : la prochaine frame la refait.
    this.level = null
  }

  setColors(colors: GraticuleColors | undefined): void {
    this.colors = colors ?? FALLBACK_COLORS
    this.level = null
  }

  setTexts(texts: GraticuleTexts): void {
    this.texts = texts
  }

  setVisible(on: boolean): void {
    if (on === this.visible) return
    this.visible = on
    // Un fondu croisé laissé en plan derrière une grille éteinte se rallumerait au retour.
    if (!on) this.dropOutgoing()
  }

  setMaxTilt(rad: number): void {
    this.maxTilt = rad
  }

  update(ctx: FrameContext): void {
    if (!this.visible || !this.projection.isReady()) {
      this.group.visible = false
      return
    }
    const g = this.config.graticule
    const { lat, lng, altitude } = ctx.cameraState
    const span = visibleSpanDeg(altitude, lat, ctx.size.height)
    this.lastSpan = span
    const level = pickLevel(span, g.targetLines, this.level, g.levelHysteresis, g.levelRangeDeg)
    const height = this.projection.surfaceFallbackHeight + g.heightOffsetMeters

    if (this.needsRebuild(level, lat, lng, height, span)) {
      this.band = bandFor(lat, lng, span, g.bandScreens, g.latLimitDeg)
      this.lines = linesFor(this.band, level, {
        maxLines: g.maxLines,
        latLimitDeg: g.latLimitDeg,
        remarkable: g.remarkable.enabled ? g.remarkable : null,
      })
      this.level = level
      this.builtHeight = height
      this.builtLat = lat
      this.builtLng = lng
      this.rebuild(height)
    }

    // L'inclinaison n'est PAS dans `ctx.cameraState` : `getState()` la rend toujours nulle,
    // seul `getPose()` la calcule et il ne s'appelle pas dans la boucle. On la relit donc
    // sur la matrice — une lecture, sur des scratch réutilisés.
    const frame = new EnuFrame(this.projection, ctx.cameraState)
    const tilt = tiltFromNadir(ctx.camera.matrixWorld, frame.up, this.tiltScratch)
    // Bande en FRACTIONS du plafond du mode : 79,2° en 3D contre 36° à plat, donc une bande
    // en degrés absolus ne se déclencherait jamais en mode plan.
    const ratio = tilt / Math.max(1e-6, this.maxTilt)
    const target = 1 - smoothstep(g.tiltFade.start, g.tiltFade.end, ratio)
    // Lissage exponentiel indépendant de la cadence — c'est lui, « la douceur ».
    const k = g.fadeMs > 0 ? 1 - Math.exp((-ctx.dt * 1000) / g.fadeMs) : 1
    this.fade += (target - this.fade) * k
    // ⚠️ `invalidate()` UNIQUEMENT tant que ça converge : sinon la grille tiendrait la boucle
    // de rendu à la demande éveillée en permanence, carte immobile.
    if (Math.abs(target - this.fade) < 1e-3) this.fade = target
    else ctx.invalidate()

    this.updateOutgoing(ctx)

    if (this.fade <= 0) {
      // Rien à peindre : ni draw call, ni écriture DOM (cf. la garde de `project`).
      this.group.visible = false
      return
    }
    this.applyOpacity()
    this.group.visible = true
  }

  /** Les trois — et seuls — déclencheurs de reconstruction. */
  private needsRebuild(level: number, lat: number, lng: number, height: number, span: number): boolean {
    if (this.level !== level || !this.band) return true
    if (Math.abs(height - this.builtHeight) > this.config.graticule.heightToleranceMeters) return true
    // Sorti de la bande : elle déborde de `bandScreens - 1` écran de chaque côté, et c'est
    // cette marge — pas la bande entière — qu'un pan peut consommer avant reconstruction.
    const half = (span * (this.config.graticule.bandScreens - 1)) / 2
    return Math.abs(lat - this.builtLat) > half || Math.abs(lng - this.builtLng) > half
  }

  private rebuild(height: number): void {
    const fadeMs = this.config.graticule.levelFadeMs
    if (fadeMs <= 0 || this.outgoing) {
      // Fondu coupé, ou un fondu déjà en cours : on jette, sinon les jeux s'empileraient.
      this.dropOutgoing()
      clearGroup(this.group)
    } else {
      // Les objets courants passent dans un groupe SORTANT — on ne les reconstruit pas, on
      // les laisse s'éteindre pendant que le nouveau jeu apparaît.
      const sortant = new THREE.Group()
      for (const child of [...this.group.children]) sortant.add(child)
      this.scene.add(sortant)
      this.outgoing = { group: sortant, fade: 1 }
    }
    const ordinary = this.buildSegments(false, height)
    const remarkable = this.buildSegments(true, height)
    if (ordinary) this.group.add(ordinary)
    if (remarkable) this.group.add(remarkable)
  }

  /** Un `LineSegments` pour les lignes ordinaires, un pour les remarquables (deux couleurs). */
  private buildSegments(remarkable: boolean, height: number): THREE.LineSegments | null {
    const g = this.config.graticule
    const band = this.band
    if (!band) return null
    const wanted = this.lines.filter((l) => (l.remarkable !== null) === remarkable)
    if (wanted.length === 0) return null
    const segs = Math.max(2, g.segmentsPerLine)
    const positions = new Float32Array(wanted.length * (segs - 1) * 2 * 3)
    let o = 0
    const push = (p: LatLng) => {
      this.projection.latLngToWorld(p, this.scratch, height)
      positions[o++] = this.scratch.x
      positions[o++] = this.scratch.y
      positions[o++] = this.scratch.z
    }
    for (const line of wanted) {
      const from = line.kind === 'parallel' ? band.west : Math.max(band.south, -g.latLimitDeg)
      const to = line.kind === 'parallel' ? band.east : Math.min(band.north, g.latLimitDeg)
      const step = (to - from) / (segs - 1)
      for (let i = 0; i < segs - 1; i++) {
        const a = from + i * step
        const b = from + (i + 1) * step
        // Deux sommets par segment : `LineSegments` (et non `Line`) pour que toutes les
        // lignes tiennent dans UN objet — donc un seul draw call par couleur.
        push(this.at(line, a))
        push(this.at(line, b))
      }
    }
    const geo = new THREE.BufferGeometry()
    // Tranché à `o` : des sommets non écrits resteraient à (0,0,0), donc une ligne parasite
    // partant du centre de la Terre.
    geo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, o), 3))
    const color = new THREE.Color(remarkable ? this.colors.remarkable : this.colors.line)
    const opacity = remarkable ? g.remarkableOpacity : g.opacity
    // `LineDashedMaterial` est écarté partout ailleurs dans la lib parce qu'il « rend un
    // trait d'un pixel et ne sait pas s'épaissir en mètres monde » (cf. `dashedStrokeMaterial`).
    // Ici c'est exactement ce qu'on veut : la grille est à 1 px par choix.
    const mat = g.dash
      ? new THREE.LineDashedMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          dashSize: g.dash.dash,
          gapSize: g.dash.gap,
        })
      : new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          // La grille est un repère : elle se lit par-dessus le relief, pas sous lui.
          depthWrite: false,
        })
    const seg = new THREE.LineSegments(geo, mat)
    // Sans abscisse curviligne, le shader n'a rien à découper et le pointillé sort plein.
    // Une passe sur les sommets, au rebuild seul.
    if (g.dash) seg.computeLineDistances()
    // Retenue pour le fondu croisé : le jeu sortant a besoin de son opacité de DÉPART, sans
    // quoi l'atténuation se composerait d'une frame à l'autre et s'effondrerait en trois.
    seg.userData.baseOpacity = opacity
    seg.renderOrder = 1
    return seg
  }

  /**
   * Point de la ligne à l'abscisse `v` (longitude sur un parallèle, latitude sur un
   * méridien), écrit dans `out` — jamais alloué : appelé par ligne, par segment et par frame.
   */
  private at(line: GraticuleLine, v: number, out: LatLng = this.anchor): LatLng {
    if (line.kind === 'parallel') {
      out.lat = line.value
      out.lng = v
    } else {
      out.lat = v
      out.lng = line.value
    }
    return out
  }

  /** Reporte le fondu sur les matériaux — deux écritures de scalaire par frame. */
  private applyOpacity(): void {
    for (const child of this.group.children) {
      const seg = child as THREE.LineSegments
      const mat = seg.material as THREE.LineBasicMaterial
      mat.opacity = (seg.userData.baseOpacity as number) * this.fade
    }
  }

  /** Fait décroître le jeu de la maille précédente, puis le détruit. */
  private updateOutgoing(ctx: FrameContext): void {
    const out = this.outgoing
    if (!out) return
    const k = 1 - Math.exp((-ctx.dt * 1000) / Math.max(1, this.config.graticule.levelFadeMs))
    out.fade -= out.fade * k
    if (out.fade < 0.01) {
      this.dropOutgoing()
      return
    }
    for (const child of out.group.children) {
      const seg = child as THREE.LineSegments
      const mat = seg.material as THREE.LineBasicMaterial
      // Valeur ABSOLUE depuis l'opacité de base : un `*=` composerait l'atténuation à chaque
      // frame et le jeu sortant disparaîtrait en trois, pas en `levelFadeMs`.
      mat.opacity = (seg.userData.baseOpacity as number) * this.fade * out.fade
    }
    // La maille sortante s'efface encore : l'image change sans que rien d'autre ne bouge.
    ctx.invalidate()
  }

  /** Détruit le jeu sortant — géométries ET matériaux, sinon la mémoire GPU fuit par cran de zoom. */
  private dropOutgoing(): void {
    if (!this.outgoing) return
    disposeObject3D(this.outgoing.group)
    this.scene.remove(this.outgoing.group)
    this.outgoing = null
  }

  project(ctx: FrameContext): void {
    const g = this.config.graticule
    if (!this.group.visible || !g.labels.enabled || this.level === null) {
      this.hideLabelsFrom(0)
      return
    }
    // Exigé par `isBehindCamera` : une inversion de matrice pour la passe entière au lieu
    // d'une par étiquette.
    this.projection.setViewDirection(ctx.camera)
    const { lat: centerLat, lng: centerLng } = ctx.cameraState
    let used = 0
    let lastX = Number.NEGATIVE_INFINITY
    let lastY = Number.NEGATIVE_INFINITY
    for (const line of this.lines) {
      if (used >= g.labels.maxLabels) break
      const anchor = this.labelAnchor(line, centerLat, centerLng)
      const world = this.projection.latLngToWorld(anchor, this.scratch, this.builtHeight)
      if (this.projection.isBehindCamera(world, ctx.camera.position)) continue
      if (!this.projection.isAboveHorizon(world, ctx.camera.position)) continue
      const s = this.projection.worldToScreen(world, ctx.camera, this.sp)
      if (s.sx < 0 || s.sy < 0 || s.sx > ctx.size.width || s.sy > ctx.size.height) continue
      // Espacement minimal : deux étiquettes d'une même chaîne se chevauchent dès que la
      // maille se resserre à l'écran.
      if (Math.hypot(s.sx - lastX, s.sy - lastY) < g.labels.spacingPx) continue
      lastX = s.sx
      lastY = s.sy
      const el = this.labelAt(used++)
      const text = labelFor(line, this.level, g.labels.format, this.texts, g.labels.remarkableNames)
      // Écriture CONDITIONNELLE : réécrire un `textContent` identique invalide la mise en
      // page du nœud, quarante fois par frame.
      const title = el.firstElementChild as HTMLElement
      if (title.textContent !== text) title.textContent = text
      const rot = g.labels.rotate ? this.screenAngle(line, anchor, ctx) : 0
      el.style.display = 'block'
      el.style.opacity = String(this.fade)
      el.style.transform = `translate3d(${s.sx}px, ${s.sy}px, 0) translate(-50%, -50%) rotate(${rot}deg)`
    }
    this.hideLabelsFrom(used)
  }

  /**
   * Point d'ancrage d'une étiquette.
   *
   * En `'center-cross'`, les latitudes se posent sur le méridien le plus proche du centre
   * écran et les longitudes sur le parallèle le plus proche : c'est ce qui plafonne
   * naturellement leur nombre, et ce qui leur donne les deux chaînes diagonales des cartes.
   */
  private labelAnchor(line: GraticuleLine, centerLat: number, centerLng: number): LatLng {
    const base = line.kind === 'parallel' ? centerLng : centerLat
    if (this.config.graticule.labels.placement === 'edges') {
      // Aux bords : on s'écarte du centre de presque un demi-écran, pas jusqu'au bord de la
      // BANDE — celle-ci fait deux écrans de large, et son bord est donc hors champ.
      return this.at(line, base - this.lastSpan * EDGE_OFFSET)
    }
    return this.at(line, base)
  }

  /** Angle écran de la ligne au point d'ancrage (degrés), borné pour ne jamais écrire à l'envers. */
  private screenAngle(line: GraticuleLine, anchor: LatLng, ctx: FrameContext): number {
    // Un second point légèrement plus loin le long de la même ligne : leur différence à
    // l'écran donne la direction, courbure comprise.
    const delta = Math.max(this.level ?? 0, 1e-4) * 0.25
    const v = (line.kind === 'parallel' ? anchor.lng : anchor.lat) + delta
    // `anchor` est `this.anchor` : le second point s'écrit donc dans `anchorB`, sinon il
    // écraserait le premier avant qu'on l'ait projeté.
    const w1 = this.projection.latLngToWorld(anchor, this.scratch, this.builtHeight)
    const s1 = this.projection.worldToScreen(w1, ctx.camera, this.spA)
    const w2 = this.projection.latLngToWorld(this.at(line, v, this.anchorB), this.scratchB, this.builtHeight)
    const s2 = this.projection.worldToScreen(w2, ctx.camera, this.spB)
    let deg = Math.atan2(s2.sy - s1.sy, s2.sx - s1.sx) * RAD2DEG
    // Texte à l'endroit : au-delà du quart de tour, on lit la direction opposée.
    if (deg > 90) deg -= 180
    if (deg < -90) deg += 180
    // ⚠️ Le texte ne suit la ligne que tant qu'il reste LISIBLE. Un méridien en vue
    // nord-en-haut est vertical : suivi à la lettre, l'étiquette s'écrivait de bas en haut,
    // illisible sans pencher la tête. Au-delà de 45°, on bascule d'un quart de tour — le
    // texte se pose alors EN TRAVERS de la ligne plutôt que le long, et redevient horizontal.
    if (deg > LABEL_TILT_MAX) deg -= 90
    else if (deg < -LABEL_TILT_MAX) deg += 90
    return deg
  }

  /** Étiquette `i` du pool, créée à la volée si elle manque. */
  private labelAt(i: number): HTMLElement {
    const existing = this.labelPool[i]
    if (existing) return existing
    const el = document.createElement('div')
    el.className = LABEL_CLASS
    const title = document.createElement('div')
    title.className = LABEL_TITLE_CLASS
    el.appendChild(title)
    this.overlay.appendChild(el)
    this.labelPool.push(el)
    return el
  }

  private hideLabelsFrom(i: number): void {
    for (let k = i; k < this.labelPool.length; k++) this.labelPool[k]!.style.display = 'none'
  }

  dispose(): void {
    this.dropOutgoing()
    disposeObject3D(this.group)
    this.scene.remove(this.group)
    for (const el of this.labelPool) el.remove()
    this.labelPool.length = 0
  }
}
