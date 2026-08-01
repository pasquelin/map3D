import * as THREE from 'three'
import { defaultConfig } from '../config/defaultConfig'
import type { MapConfig } from '../config/types'
import { clearGroup, disposeObject3D, edgeMaterial } from '../core/geometry'
import {
  bandFor,
  type GraticuleBand,
  type GraticuleLine,
  type GraticuleTexts,
  labelFor,
  linesFor,
  pickLevel,
  visibleSpanDeg,
} from '../core/graticule'
import { tiltFromNadir } from '../core/enu'
import type { FrameContext, Layer } from '../core/Layer'
import type { Projection, ScreenPoint } from '../core/Projection'
import { approach, RAD2DEG, smoothstep } from '../core/math'
import { defaultTheme } from '../theme/defaultTheme'
import { isInsideFrame } from './markerCull'
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
 * Couleurs de repli quand le thème hôte est antérieur à `colors.graticule` — LUES dans le
 * thème par défaut, jamais recopiées : deux jaunes à tenir synchrones à la main seraient un
 * défaut invisible en développement et voyant en production. Même patron que `BuildingsLayer`.
 */
const FALLBACK_COLORS: GraticuleColors = defaultTheme.colors.graticule ?? { line: '#ffffff', remarkable: '#ffffff' }

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

/**
 * Étendue angulaire maximale d'un segment de ligne (degrés). La flèche d'un arc de 0,25° au sol
 * vaut ~6 cm : très en deçà du pixel à toute altitude où la grille se lit.
 */
const MAX_SEG_DEG = 0.25

/**
 * Plafond du cache de tailles d'étiquettes. Une maille en produit au plus `maxLines`, mais une
 * session qui traverse les niveaux de zoom en accumule de nouvelles indéfiniment : au-delà, on
 * vide plutôt que d'entretenir un LRU pour quelques dizaines d'octets par entrée.
 */
const MAX_LABEL_SIZES = 512

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
  /**
   * Plafond d'inclinaison du mode courant (rad), poussé par le moteur.
   *
   * ⚠️ Ne PAS le redériver de `config.camera.maxTilt2d/3d` : `MapEngine.applyCameraLimits` en
   * est la source unique et le borne en plus par `controls.maxAltitude`. Une copie ignorait ce
   * second plafond, donc la bande de fondu se décalait en vue inclinée.
   */
  private maxTilt = defaultConfig.camera.maxTilt3d
  private colors: GraticuleColors = FALLBACK_COLORS
  private texts: GraticuleTexts

  private level: number | null = null
  private builtHeight = 0
  private builtLat = 0
  private builtLng = 0
  private lines: GraticuleLine[] = []
  /**
   * Texte de chaque ligne, calculé au REBUILD. Il ne dépend que de la ligne, de la maille et
   * des libellés — tous stables entre deux reconstructions. Le recalculer par frame allouait
   * une dizaine d'objets et de chaînes PAR ÉTIQUETTE, pour réécrire la même valeur.
   */
  private lineTexts: string[] = []
  /** Les deux jeux de segments, nommés : `setColors` et `applyOpacity` n'ont plus à fouiller. */
  private ordinary: THREE.LineSegments | null = null
  private remarkableSeg: THREE.LineSegments | null = null

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
  /**
   * Position écran de chaque étiquette affichée, et sa demi-taille mesurée. Le survol se
   * décide là-dessus plutôt qu'en CSS : garder `pointer-events: none` est ce qui empêche une
   * étiquette d'avaler un début de déplacement de carte.
   */
  private readonly labelHits: { x: number; y: number; hw: number; hh: number }[] = []
  /**
   * Nombre d'étiquettes affichées à la dernière passe — donc aussi la borne haute des slots
   * VISIBLES : `hideLabelsFrom` n'a rien à faire au-delà. Un second compteur pour cette borne
   * ne pouvait que valoir le même nombre, et se désynchroniser sur un chemin oublié.
   */
  private labelCount = 0
  /**
   * Demi-taille mesurée par TEXTE. La taille d'une pastille ne dépend que de son contenu :
   * mesurer par slot obligeait à relire le layout dès qu'une ligne entrait ou sortait du cadre,
   * ce qui décale l'affectation slot→ligne et donc tous les textes suivants. Ici chaque texte
   * n'est mesuré qu'une fois, et la mesure a lieu dans la passe de LECTURE.
   */
  private readonly labelSizes = new Map<string, { hw: number; hh: number }>()
  /**
   * Pastille hors flux dédiée à la mesure. Mesurer sur un slot du pool écraserait le texte que
   * `project` vient d'y écrire — et ferait dépendre la mesure de l'ordre des passes.
   */
  private measureEl: HTMLElement | null = null
  /** Dernière opacité écrite par slot : réécrire la même valeur est une écriture CSSOM pour rien. */
  private readonly labelOpacity: number[] = []
  /** Rect de l'overlay, mémoïsé par frame — `getBoundingClientRect` force une mise en page. */
  private overlayRect: DOMRect | null = null
  /** Index de l'étiquette sous le pointeur, `-1` si aucune. */
  private hovered = -1
  /** Position du pointeur dans le repère de l'overlay — préallouée (un événement, zéro alloc). */
  private readonly pointer = { x: 0, y: 0 }
  private hasPointer = false
  /** `invalidate` de la dernière frame — le survol change hors boucle et doit la réveiller. */
  private invalidate: (() => void) | null = null
  private readonly onPointerMove = (e: PointerEvent): void => {
    // Rect mémoïsé par frame (patron de `DrawLayer`) : le lire à chaque événement forçait une
    // mise en page jusqu'à 250 fois par seconde, et précisément pendant un glisser de carte —
    // le moment où le budget est le plus tendu.
    this.overlayRect ??= this.overlay.getBoundingClientRect()
    this.pointer.x = e.clientX - this.overlayRect.left
    this.pointer.y = e.clientY - this.overlayRect.top
    this.hasPointer = true
    this.refreshHover()
  }
  private readonly onPointerLeave = (): void => {
    this.hasPointer = false
    this.refreshHover()
  }

  // Scratch de la boucle de frame — aucune allocation par frame.
  private readonly scratch = new THREE.Vector3()
  private readonly scratchB = new THREE.Vector3()
  private readonly tiltScratch = new THREE.Vector3()
  private readonly enuOrigin = new THREE.Vector3()
  private readonly enuEast = new THREE.Vector3()
  private readonly enuNorth = new THREE.Vector3()
  private readonly enuUp = new THREE.Vector3()
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
    // `passive` : on ne fait que LIRE la position, jamais annuler le geste — le déplacement
    // de la carte n'en est pas affecté d'un pixel.
    this.overlay.addEventListener('pointermove', this.onPointerMove, { passive: true })
    this.overlay.addEventListener('pointerleave', this.onPointerLeave, { passive: true })
  }

  /**
   * Re-décide quelle étiquette est sous le pointeur. Appelé sur `pointermove` — donc à la
   * cadence de la souris, pas de la frame — et jamais depuis la boucle de rendu.
   *
   * Les demi-tailles sont celles MESURÉES à la passe précédente : aucune lecture de layout
   * ici, donc aucun reflux forcé sur un `pointermove` (qui peut arriver en plein glisser).
   */
  private refreshHover(): void {
    let next = -1
    if (this.hasPointer) {
      const pad = this.config.graticule.labels.hoverPaddingPx
      for (let i = 0; i < this.labelCount; i++) {
        const h = this.labelHits[i]!
        if (Math.abs(this.pointer.x - h.x) <= h.hw + pad && Math.abs(this.pointer.y - h.y) <= h.hh + pad) {
          next = i
          break
        }
      }
    }
    if (next === this.hovered) return
    this.hovered = next
    // Le survol change hors de la boucle : sans ce réveil, l'étiquette ne s'éclaircirait
    // qu'au prochain mouvement de carte (`performance.renderOnDemand`).
    this.invalidate?.()
  }

  setConfig(config: MapConfig): void {
    this.config = config
    // Les réglages de densité changent la géométrie : la prochaine frame la refait.
    this.level = null
  }

  /**
   * Change les teintes SANS reconstruire.
   *
   * `this.level = null` (le sentinel « géométrie invalide ») serait faux ici : une couleur ne
   * déplace aucun sommet, et le poser déclenchait en prime un fondu croisé complet — jusqu'à
   * des dizaines de milliers de sommets recalculés parce qu'un hôte a changé de charte.
   */
  setColors(colors: GraticuleColors | undefined): void {
    this.colors = colors ?? FALLBACK_COLORS
    if (this.ordinary) (this.ordinary.material as THREE.LineBasicMaterial).color.set(this.colors.line)
    if (this.remarkableSeg) {
      ;(this.remarkableSeg.material as THREE.LineBasicMaterial).color.set(this.colors.remarkable)
    }
  }

  setTexts(texts: GraticuleTexts): void {
    this.texts = texts
    // Les textes sont calculés au rebuild : sans ce sentinel, changer de langue ne se verrait
    // qu'au prochain changement de maille.
    this.level = null
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
    this.invalidate = ctx.invalidate
    // Le layout a pu changer depuis la frame précédente : le rect se remesure au plus une fois.
    this.overlayRect = null
    const g = this.config.graticule
    const { lat, lng, altitude } = ctx.cameraState
    const span = visibleSpanDeg(altitude, lat, ctx.size.height)
    this.lastSpan = span
    const level = pickLevel(span, g.targetLines, this.level, g.levelHysteresis, g.levelRangeDeg)
    const height = this.projection.surfaceFallbackHeight + g.heightOffsetMeters

    if (this.needsRebuild(level, lat, lng, height, span)) {
      const band = bandFor(lat, lng, span, g.bandScreens, g.latLimitDeg)
      this.lines = linesFor(band, level, {
        maxLines: g.maxLines,
        latLimitDeg: g.latLimitDeg,
        remarkable: g.remarkable.enabled ? g.remarkable : null,
      })
      // Textes calculés ICI, une fois par reconstruction : ils ne dépendent que de la ligne, de
      // la maille et des libellés. Les refaire dans `project()` était la première source
      // d'allocations de la couche — une dizaine par étiquette et par frame, aussitôt jetées.
      this.lineTexts = this.lines.map((l) => labelFor(l, level, g.labels.format, this.texts, g.labels.remarkableNames))
      this.level = level
      this.builtHeight = height
      this.builtLat = lat
      this.builtLng = lng
      this.rebuild(band, height)
      // Mesure ICI, dans la passe de LECTURE : les seules lectures de layout de la couche
      // tombent ainsi hors de `project`, qui doit rester une passe d'écriture pure. Et une
      // reconstruction est rare — quelques mesures par changement de maille, pas par frame.
      if (g.labels.enabled) this.measureLabels()
    }

    // L'inclinaison n'est PAS dans `ctx.cameraState` : `getState()` la rend toujours nulle,
    // seul `getPose()` la calcule et il ne s'appelle pas dans la boucle. On la relit donc
    // sur la matrice — une lecture, sur des scratch réutilisés.
    // `getENUAxes` écrit dans des scratch ; `new EnuFrame` allouait l'instance PLUS six
    // `Vector3` par frame, pour n'en lire qu'un seul (`up`).
    this.projection.getENUAxes(ctx.cameraState, this.enuOrigin, this.enuEast, this.enuNorth, this.enuUp)
    const tilt = tiltFromNadir(ctx.camera.matrixWorld, this.enuUp, this.tiltScratch)
    // Bande en FRACTIONS du plafond du mode : 79,2° en 3D contre 36° à plat, donc une bande
    // en degrés absolus ne se déclencherait jamais en mode plan.
    const ratio = tilt / Math.max(1e-6, this.maxTilt)
    const target = 1 - smoothstep(g.tiltFade.start, g.tiltFade.end, ratio)
    // Lissage exponentiel indépendant de la cadence — c'est lui, « la douceur ».
    this.fade = approach(this.fade, target, g.fadeMs / 1000, ctx.dt)
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
    this.applyFade(this.group, this.fade)
    this.group.visible = true
  }

  /** Les trois — et seuls — déclencheurs de reconstruction. */
  private needsRebuild(level: number, lat: number, lng: number, height: number, span: number): boolean {
    if (this.level !== level) return true
    if (Math.abs(height - this.builtHeight) > this.config.graticule.heightToleranceMeters) return true
    // Sorti de la bande : elle déborde de `bandScreens - 1` écran de chaque côté, et c'est
    // cette marge — pas la bande entière — qu'un pan peut consommer avant reconstruction.
    const half = (span * (this.config.graticule.bandScreens - 1)) / 2
    return Math.abs(lat - this.builtLat) > half || Math.abs(lng - this.builtLng) > half
  }

  private rebuild(band: GraticuleBand, height: number): void {
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
    // Les anciennes références sont cédées (jetées ou passées au sortant) : les oublier ici
    // évite qu'un `setColors` reteinte une géométrie qui n'est plus à l'écran.
    this.ordinary = this.buildSegments(band, false, height)
    this.remarkableSeg = this.buildSegments(band, true, height)
    if (this.ordinary) this.group.add(this.ordinary)
    if (this.remarkableSeg) this.group.add(this.remarkableSeg)
  }

  /** Un `LineSegments` pour les lignes ordinaires, un pour les remarquables (deux couleurs). */
  private buildSegments(band: GraticuleBand, remarkable: boolean, height: number): THREE.LineSegments | null {
    const g = this.config.graticule
    const wanted = this.lines.filter((l) => (l.remarkable !== null) === remarkable)
    if (wanted.length === 0) return null
    // UNE seule fois : ce plafond borne la densification par ligne.
    const maxSegs = Math.max(2, g.segmentsPerLine)
    // La densification ne dépend que de l'étendue de la bande dans l'axe de la ligne : deux
    // valeurs pour tout le jeu, pas une par ligne.
    const segsParallel = this.segsFor(band.east - band.west, maxSegs)
    const segsMeridian = this.segsFor(band.north - band.south, maxSegs)
    let total = 0
    for (const line of wanted) total += (line.kind === 'parallel' ? segsParallel : segsMeridian) - 1
    // Taille EXACTE. Dimensionner sur `maxSegs` réservait le pire cas — deux ordres de grandeur
    // de trop en vue rue, où 128 segments par ligne se réduisent à 2 — et le `subarray` final
    // laissait ce tampon vivant tant que la géométrie l'était.
    const positions = new Float32Array(total * 2 * 3)
    let o = 0
    const push = (p: LatLng) => {
      this.projection.latLngToWorld(p, this.scratch, height)
      positions[o++] = this.scratch.x
      positions[o++] = this.scratch.y
      positions[o++] = this.scratch.z
    }
    for (const line of wanted) {
      // La bande sort DÉJÀ bornée aux pôles de `bandFor` : re-borner ici ne pouvait jamais mordre.
      const from = line.kind === 'parallel' ? band.west : band.south
      const to = line.kind === 'parallel' ? band.east : band.north
      const segs = line.kind === 'parallel' ? segsParallel : segsMeridian
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
    // Le tampon est exactement rempli (`o === positions.length`) : plus rien à trancher, donc
    // plus de sommets non écrits restés à (0,0,0) — la ligne parasite partant du centre de la
    // Terre ne peut plus apparaître.
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
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
      : // `edgeMaterial` rend exactement ce matériau (1 px, `depthWrite: false`) et porte déjà
        // la note sur `linewidth` que WebGL ignore — ici c'est l'effet recherché, pas une limite.
        edgeMaterial(color, opacity)
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
   * Nombre de sommets d'une ligne couvrant `spanDeg`, plafonné par la config.
   *
   * Densification proportionnée à l'ÉTENDUE : à 128 segments fixes, un parallèle couvrant
   * 0,002° en vue rue produisait 126 sommets colinéaires — transformés par le vertex shader à
   * chaque frame peinte, pour une courbure nulle.
   */
  private segsFor(spanDeg: number, maxSegs: number): number {
    return Math.max(2, Math.min(maxSegs, Math.ceil(Math.abs(spanDeg) / MAX_SEG_DEG) + 1))
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

  /**
   * Reporte un facteur de fondu sur les matériaux d'un groupe — deux écritures de scalaire.
   *
   * Valeur ABSOLUE depuis l'opacité de base retenue au rebuild : un `*=` composerait
   * l'atténuation à chaque frame et le jeu concerné disparaîtrait en trois frames, pas en
   * `levelFadeMs`. Écrivain UNIQUE : le jeu courant et le jeu sortant ne diffèrent que par le
   * facteur, et une règle d'opacité écrite à deux endroits finit par diverger.
   */
  private applyFade(group: THREE.Group, factor: number): void {
    for (const child of group.children) {
      const seg = child as THREE.LineSegments
      ;(seg.material as THREE.LineBasicMaterial).opacity = (seg.userData.baseOpacity as number) * factor
    }
  }

  /** Fait décroître le jeu de la maille précédente, puis le détruit. */
  private updateOutgoing(ctx: FrameContext): void {
    const out = this.outgoing
    if (!out) return
    out.fade = approach(out.fade, 0, this.config.graticule.levelFadeMs / 1000, ctx.dt)
    if (out.fade < 0.01) {
      this.dropOutgoing()
      return
    }
    this.applyFade(out.group, this.fade * out.fade)
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
      // `hideLabelsFrom` remet `labelCount` à zéro, et avec lui la portée de `labelHits` :
      // sans ça, le pointeur entrant dans une boîte PÉRIMÉE faisait basculer `hovered`, donc
      // réveillait la boucle pour trois frames (`renderOnDemand.idleFrames`) — sur une carte
      // immobile, grille éteinte.
      this.hideLabelsFrom(0)
      this.hovered = -1
      return
    }
    // Exigé par `isBehindCamera` : une inversion de matrice pour la passe entière au lieu
    // d'une par étiquette.
    this.projection.setViewDirection(ctx.camera)
    const { lat: centerLat, lng: centerLng } = ctx.cameraState
    let used = 0
    let lastX = Number.NEGATIVE_INFINITY
    let lastY = Number.NEGATIVE_INFINITY
    for (let li = 0; li < this.lines.length; li++) {
      if (used >= g.labels.maxLabels) break
      const line = this.lines[li]!
      const anchor = this.labelAnchor(line, centerLat, centerLng)
      const world = this.projection.latLngToWorld(anchor, this.scratch, this.builtHeight)
      if (this.projection.isBehindCamera(world, ctx.camera.position)) continue
      if (!this.projection.isAboveHorizon(world, ctx.camera.position)) continue
      const s = this.projection.worldToScreen(world, ctx.camera, this.sp)
      // `isInsideFrame` : le cull d'écran partagé avec `MarkerLayer`, marge comprise.
      if (!isInsideFrame(s.sx, s.sy, ctx.size.width, ctx.size.height, 0)) continue
      // Espacement minimal : deux étiquettes d'une même chaîne se chevauchent dès que la
      // maille se resserre à l'écran.
      if (Math.hypot(s.sx - lastX, s.sy - lastY) < g.labels.spacingPx) continue
      lastX = s.sx
      lastY = s.sy
      const i = used++
      const el = this.labelAt(i)
      const text = this.lineTexts[li] ?? ''
      const hit = (this.labelHits[i] ??= { x: 0, y: 0, hw: 0, hh: 0 })
      hit.x = s.sx
      hit.y = s.sy
      // Taille lue au cache, jamais mesurée ici : `project` est une passe d'ÉCRITURE, et une
      // lecture de layout entrelacée avec les écritures des autres couches est le cas d'école
      // du layout thrashing. Le cache est amorcé au rebuild, donc ce `sizeOf` ne mesure pas.
      const size = this.sizeOf(text)
      hit.hw = size.hw
      hit.hh = size.hh
      // Écriture CONDITIONNELLE : réécrire le même texte est une écriture DOM pour rien.
      const title = el.firstElementChild as HTMLElement
      if (title.textContent !== text) title.textContent = text
      // `display` n'est posé qu'à l'apparition : au-delà de `labelCount`, qui porte encore le
      // compte de la passe précédente, le slot était caché.
      if (i >= this.labelCount) el.style.display = 'block'
      const opacity = this.fade * (i === this.hovered ? 1 : g.labels.idleOpacity)
      if (this.labelOpacity[i] !== opacity) {
        el.style.opacity = String(opacity)
        this.labelOpacity[i] = opacity
      }
      // `screenAngle` reçoit le point DÉJÀ projeté : le recalculer doublait le coût de la
      // rotation pour un résultat bit-à-bit identique.
      const rot = g.labels.rotate ? this.screenAngle(line, anchor, s, ctx) : 0
      el.style.transform = `translate3d(${s.sx}px, ${s.sy}px, 0) translate(-50%, -50%) rotate(${rot}deg)`
    }
    // `hideLabelsFrom` a besoin de l'ANCIEN `labelCount` pour savoir jusqu'où cacher, et pose
    // le nouveau lui-même : l'écrire avant l'appel laisserait des slots visibles.
    this.hideLabelsFrom(used)
    // Le pointeur n'a pas bougé mais les étiquettes, si : ce qui est sous lui a changé.
    if (this.hovered >= used) this.hovered = -1
    this.refreshHover()
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
  private screenAngle(line: GraticuleLine, anchor: LatLng, s1: ScreenPoint, ctx: FrameContext): number {
    // Un second point légèrement plus loin le long de la même ligne : leur différence à
    // l'écran donne la direction, courbure comprise.
    const delta = Math.max(this.level ?? 0, 1e-4) * 0.25
    const v = (line.kind === 'parallel' ? anchor.lng : anchor.lat) + delta
    // `anchor` est `this.anchor` : le second point s'écrit donc dans `anchorB`, sinon il
    // écraserait le premier — que l'appelant a déjà projeté et nous passe en `s1`.
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
    const el = this.createLabel(false)
    this.labelPool.push(el)
    return el
  }

  /**
   * Pastille montée dans l'overlay. `measuring` la rend invisible SANS la sortir de la mise en
   * page : `display: none` rendrait des dimensions nulles, `visibility: hidden` non. Le châssis
   * étant `position: absolute; pointer-events: none`, elle ne déplace ni n'intercepte rien.
   */
  private createLabel(measuring: boolean): HTMLElement {
    const el = document.createElement('div')
    el.className = LABEL_CLASS
    if (measuring) el.style.visibility = 'hidden'
    const title = document.createElement('div')
    title.className = LABEL_TITLE_CLASS
    el.appendChild(title)
    this.overlay.appendChild(el)
    return el
  }

  /**
   * Cache les slots au-delà de `i`, et fait de `i` le nouveau compte affiché. Borné par
   * `labelCount` et non par la taille du pool : grille éteinte, réécrire `display: none` sur
   * quarante éléments déjà cachés coûtait quarante écritures CSSOM par frame, indéfiniment —
   * la couche restant montée en permanence.
   */
  private hideLabelsFrom(i: number): void {
    for (let k = i; k < this.labelCount; k++) this.labelPool[k]!.style.display = 'none'
    this.labelCount = i
  }

  /**
   * Amorce le cache de tailles pour la maille qui vient d'être construite. Appelé depuis
   * `update` — la passe de LECTURE — pour que `project` n'ait plus qu'à consulter.
   */
  private measureLabels(): void {
    for (const text of this.lineTexts) this.sizeOf(text)
  }

  /**
   * Demi-taille d'une pastille portant `text`, mesurée au plus une fois.
   *
   * ⚠️ En cas d'absence du cache, la mesure force une mise en page. C'est pourquoi
   * `measureLabels` l'amorce hors de `project` : tout texte que la passe d'écriture rencontre
   * y est déjà.
   */
  private sizeOf(text: string): { hw: number; hh: number } {
    const cached = this.labelSizes.get(text)
    if (cached) return cached
    // Le cache ne peut pas grossir sans fin : au plafond, on repart de zéro plutôt que
    // d'entretenir un LRU pour des entrées de quelques octets.
    if (this.labelSizes.size >= MAX_LABEL_SIZES) this.labelSizes.clear()
    const el = (this.measureEl ??= this.createLabel(true))
    const title = el.firstElementChild as HTMLElement
    title.textContent = text
    const size = { hw: el.offsetWidth / 2, hh: el.offsetHeight / 2 }
    this.labelSizes.set(text, size)
    return size
  }

  dispose(): void {
    this.overlay.removeEventListener('pointermove', this.onPointerMove)
    this.overlay.removeEventListener('pointerleave', this.onPointerLeave)
    this.dropOutgoing()
    disposeObject3D(this.group)
    this.scene.remove(this.group)
    for (const el of this.labelPool) el.remove()
    this.labelPool.length = 0
    this.measureEl?.remove()
    this.measureEl = null
    this.labelSizes.clear()
  }
}
