import * as THREE from 'three'
import { EnuFrame } from '../core/enu'
import {
  circlePoints,
  type DashedMaterial,
  dashedStrokeMaterial,
  disposeObject3D,
  fillGeo,
  fillMaterial,
  ribbon,
  setDashColors,
  strokeMaterial,
} from '../core/geometry'
import { boundsOfLatLngs } from '../core/bounds'
import type { FrameContext } from '../core/Layer'
import type { Projection, ScreenPoint } from '../core/Projection'
import { segDistPx } from './draw/hitTest'
import type { Bounds, LatLng } from '../shared'
import { type Drape, DrapedLayer } from './DrapedLayer'

/**
 * Un lien à dessiner. Les points sont déjà échantillonnés par l'appelant
 * (`greatCirclePoints` ou polyligne d'itinéraire décodée) : la couche ne décide
 * pas de la géométrie, seulement de son drapage et de son style.
 */
export type LinkVisual = {
  /** Identité stable — clé du pool : c'est elle qui évite de tout reconstruire. */
  id: string
  /**
   * Disque plat drapé au sol au lieu d'un trait. Sert de socle à la base du marker
   * source : il matérialise la relation elle-même et porte sa commande de fermeture,
   * là où le regard part déjà. `points` est alors ignoré pour la géométrie.
   */
  disc?: { center: LatLng; radiusPx: number }
  points: LatLng[]
  color: string
  /**
   * Couleurs parcourues par les tirets successifs, quand PLUSIEURS sources se
   * partagent le même trait (deux relations qui relient le même couple de markers
   * dessinent exactement le même arc). Un seul trait est alors dessiné, et ses tirets
   * alternent les couleurs : on voit à qui il appartient sans superposer deux
   * maillages — c'est même un maillage de moins.
   *
   * Absent, ou d'un seul élément : trait uni de `color`. Exige un `dash` (c'est son
   * motif qui découpe les tirets à colorer) et plafonné à `MAX_DASH_COLORS`.
   */
  colors?: readonly string[]
  /** Porte le RANG (1 = le plus rapide), jamais la durée. */
  opacity: number
  /** Épaisseur en pixels écran, constante au zoom. */
  width: number
  /** Texte de l'étiquette, `null` = aucune (tronc d'éventail, socle). */
  label: string | null
  /** Badge de rang affiché devant l'étiquette. */
  rank?: number | null
  /**
   * Le visuel n'affiche pas de contenu propre : il expose un conteneur DOM ancré,
   * que l'hôte remplit lui-même (portail React). Même patron que les nœuds de
   * `MarkerLayer` — la couche positionne, l'hôte peuple.
   *
   * C'est ce qui permet au socle de porter une véritable surface interactive plutôt
   * qu'un bouton : la couche n'a alors rien à savoir de ce qu'elle transporte.
   */
  slot?: boolean
  /** Sous le pointeur : l'étiquette reçoit `m3d-hovered` pour se renforcer. */
  hovered?: boolean
  /** Itinéraire actif : son étiquette reçoit `m3d-traced` pour se distinguer. */
  traced?: boolean
  /**
   * Pointillé DÉFILANT (« marching ants »), en pixels écran comme `width` :
   * `length` = tiret, `gap` = espace, `speed` = vitesse de défilement du motif vers
   * la destination. Absent = trait plein.
   *
   * `gapOpacity` : ce qui reste dans l'espace entre deux tirets, en fraction de
   * l'opacité du trait. Le trait garde ainsi un corps continu — on voit toujours ce
   * qu'il relie — dans SA couleur : c'est elle qui porte le sens, un contour d'une
   * autre teinte le brouillerait.
   *
   * Un visuel pointillé ne reçoit PAS de contour (`casingWidth`) : ce liseré continu
   * d'une autre couleur redevenait, entre les tirets, la seule chose visible — le
   * trait se lisait alors dans la couleur du contour, pas dans la sienne.
   */
  dash?: DashStyle
}

/**
 * Motif pointillé d'un trait, en PIXELS ÉCRAN (comme `LinkVisual.width`) : `length` =
 * tiret, `gap` = espace, `speed` = défilement en px/s vers la destination,
 * `gapOpacity` = ce qui subsiste entre deux tirets, en fraction de l'opacité du trait.
 *
 * Type nommé plutôt que littéral recopié : il traverse la couche de rendu, la
 * traduction des visuels et les props React, et un champ renommé dans un seul des
 * trois passait inaperçu du typage structurel.
 */
export type DashStyle = { length: number; gap: number; speed: number; gapOpacity: number }

/** Réglages de la COUCHE. Couleur et épaisseur n'y figurent pas : elles sont
 *  portées par chaque `LinkVisual`, qui les rend obligatoires — un repli global
 *  ne serait jamais consulté. */
export type LinkLayerDefaults = {
  renderOrder: number
  /**
   * Contour sombre posé sous le trait. Sur de l'imagerie satellite, un trait de
   * couleur unie se noie dans le bruit du sol : le casing lui rend un bord franc
   * quel que soit le fond. Même technique que `PathLayer`. 0 pour le désactiver.
   */
  casingWidth: number
  casingColor: string
  /**
   * Facteur appliqué à la couleur d'un trait survolé (< 1 = plus sombre). On
   * ASSOMBRIT la teinte de la famille au lieu d'en imposer une autre : la couleur
   * porte le sens (quelle famille de tags), le survol ne doit pas le brouiller.
   */
  hoverDarken: number
}

type LinkDrape = Drape<LinkVisual> & {
  /** Matériau du trait, conservé pour muter couleur/opacité SANS rebuild. */
  material: THREE.MeshBasicMaterial
  /** Matériau du casing — son opacité suit celle du trait, sinon un lien estompé
   *  garderait un contour plein et paraîtrait plus présent que le rang ne le dit. */
  casing: THREE.MeshBasicMaterial | null
  /**
   * Motif défilant du trait, en unités MONDE (converties depuis les pixels écran à
   * la résolution du build, comme l'épaisseur). `null` = trait plein.
   */
  dash: { material: DashedMaterial; speed: number } | null
  label: HTMLDivElement | null
}

/** Le casing reste un peu plus discret que le trait qu'il détoure. */
const CASING_OPACITY_RATIO = 0.8

/**
 * Liens drapés entre markers (lignes directes ou itinéraires réels) avec leurs
 * étiquettes. Distincte de `ShapeLayer` pour deux raisons de fond :
 *
 * 1. `setShapes()` reconstruit TOUTE la collection ; ici le rang (donc l'opacité)
 *    change à chaque retour de matrice et ne doit coûter qu'une mutation de
 *    matériau — pas une reconstruction de géométrie.
 * 2. Une forme n'a pas d'étiquette attachée : le lien en porte une, positionnée
 *    par frame comme le label de la règle (`DrawLayer`).
 */
export class LinkLayer extends DrapedLayer<LinkVisual, LinkDrape> {
  protected readonly statKind = 'links' as const

  /**
   * Emprise d'un lien : ses points, ou le centre du disque quand il en porte un —
   * `points` est alors ignoré pour la géométrie (cf. `LinkVisual.disc`).
   */
  protected boundsOf(item: LinkVisual): Bounds | null {
    return item.disc ? boundsOfLatLngs([item.disc.center]) : boundsOfLatLngs(item.points)
  }

  private readonly scratch = new THREE.Vector3()
  /** Point écran réutilisé : `worldToScreen` alloue son résultat sans lui, et il est
   *  appelé une fois par SOMMET (jusqu'à 257 par lien) sur les chemins de survol et
   *  de projection par frame. Même patron que le scratch vectoriel au-dessus. */
  private readonly screen: ScreenPoint = { sx: 0, sy: 0, z: 0 }

  constructor(
    scene: THREE.Object3D,
    projection: Projection,
    /** Overlay HTML des étiquettes (même surface que les labels de la règle). */
    private readonly overlay: HTMLElement,
    private defaults: LinkLayerDefaults,
    /** Conteneur d'un visuel `slot` monté : cible de portail pour l'hôte. */
    private readonly onSlotMount?: (id: string, el: HTMLElement) => void,
    /** Le conteneur part (lien retiré, couche démontée) : l'hôte doit s'en détacher. */
    private readonly onSlotUnmount?: (id: string) => void,
    /**
     * Surface d'accueil des ancres `slot`, quand elle diffère de celle des étiquettes.
     *
     * Utile parce que `CSS2DRenderer` trie les markers en écrivant un `z-index` inline
     * de 1 à N (N = nombre de markers rendus) : au-delà de quelques markers à l'écran,
     * ils dépassent le `z-index` de l'overlay et recouvrent ce qui s'y trouve. Poser
     * l'ancre DANS leur conteneur la met dans leur contexte d'empilement, où un
     * `z-index` franc la place devant eux — sans toucher à l'ordre des autres couches.
     */
    private readonly slotHost?: HTMLElement,
  ) {
    super(scene, projection, 'm3d-links')
  }

  /** Étiquette DOM : hors scène, donc à retirer explicitement quand le drape part. */
  protected onDropDrape(drape: LinkDrape): void {
    this.dropLabel(drape)
  }

  /**
   * Applique un nouveau jeu de liens par DIFF : les liens inchangés gardent leurs
   * meshes, un simple changement de rang ne fait que muter l'opacité du matériau.
   */
  setLinks(next: readonly LinkVisual[]): void {
    // Index des deux côtés : le diff naïf (`some` dans une boucle, puis `findIndex`
    // dans l'autre) est quadratique sur le chemin le plus chaud de la couche.
    const wanted = new Set(next.map((v) => v.id))
    for (let i = this.drapes.length - 1; i >= 0; i--) {
      if (wanted.has(this.drapes[i]!.item.id)) continue
      this.removeDrape(i)
    }
    const byId = new Map(this.drapes.map((d, i) => [d.item.id, i]))
    /**
     * Rebuilds ratés, purgés APRÈS la passe. Retirer en cours de route décalerait les
     * index de `byId` — construits avant la boucle — de sorte que les visuels suivants
     * muteraient la couleur, l'opacité et l'étiquette d'un AUTRE lien, sans rien
     * signaler. Ordre décroissant : chaque `splice` ne déplace alors que des éléments
     * déjà traités.
     */
    const dead: number[] = []
    let added = false
    for (const visual of next) {
      const i = byId.get(visual.id) ?? -1
      if (i < 0) {
        const d = this.buildDrape(visual, this.projection.resolveAnchorHeight(this.anchorOf(visual)))
        if (!d) continue
        this.drapes.push(d)
        this.group.add(d.enu)
        added = true
        continue
      }
      const drape = this.drapes[i]!
      if (LinkLayer.geometryChanged(drape.item, visual)) {
        drape.item = visual
        if (!this.rebuildDrape(i)) dead.push(i)
        continue
      }
      // Chemin chaud : seuls le style et le texte bougent.
      this.applyColor(drape, visual)
      drape.material.opacity = visual.opacity
      if (drape.casing) drape.casing.opacity = visual.opacity * CASING_OPACITY_RATIO
      // Régler le motif ne demande PAS de rebuild : ses longueurs sont des uniformes,
      // l'abscisse curviligne du ruban ne dépend pas d'elles.
      if (drape.dash && visual.dash) this.applyDash(drape, visual.dash)
      drape.item = visual
      this.syncLabel(drape)
    }
    for (const i of dead.sort((a, b) => b - a)) this.removeDrape(i)
    // Uniquement sur AJOUT : un rebuild garde l'ancre, donc sa hauteur de drapage.
    // Rouvrir la fenêtre à chaque rebuild ferait tourner les raycasts de `DrapeSync`
    // en permanence, alors qu'elle est conçue pour un coût nul carte immobile.
    if (added) this.invalidateDrapes()
  }

  /**
   * Pose le motif d'un drape pointillé, pixels écran → unités monde à la résolution
   * de SON build (comme l'épaisseur). Point de conversion UNIQUE, partagé par la
   * construction et le chemin chaud : la formule s'y écrivait deux fois, sans rien
   * pour rappeler de corriger la seconde.
   */
  private applyDash(drape: LinkDrape, style: DashStyle): void {
    if (!drape.dash) return
    const { dash, gap, gapOpacity } = drape.dash.material.dash
    dash.value = style.length * drape.mpp
    gap.value = style.gap * drape.mpp
    gapOpacity.value = style.gapOpacity
    drape.dash.speed = style.speed * drape.mpp
  }

  /**
   * Couleur(s) effective(s) d'un visuel, assombries s'il est survolé.
   *
   * Un trait pointillé porte ses teintes dans un tableau d'uniformes, et son
   * `material.color` n'est plus qu'un MULTIPLICATEUR : le survol s'y applique en un
   * scalaire, sans avoir à réécrire les N couleurs à chaque entrée/sortie du pointeur.
   * On assombrit plutôt qu'on ne remplace : la teinte porte le sens (à qui appartient
   * ce trait), le survol ne doit pas le brouiller.
   */
  private applyColor(drape: LinkDrape, visual: LinkVisual): void {
    const darken = visual.hovered ? this.defaults.hoverDarken : 1
    if (drape.dash) {
      setDashColors(drape.dash.material, visual.colors?.length ? visual.colors : [visual.color])
      drape.material.color.setScalar(darken)
      return
    }
    drape.material.color.set(visual.color).multiplyScalar(darken)
  }

  /**
   * Seuls ces champs imposent de refaire la géométrie ; couleur et opacité non.
   *
   * Un disque est traité À PART, et EN PREMIER : sa géométrie ne dépend que de son
   * centre et de son rayon (`LinkVisual.disc` le dit : « `points` est alors ignoré
   * pour la géométrie »). Comparer `points` d'abord rompait ce contrat — l'appelant
   * y met un tableau littéral, donc jamais la même référence, et le socle était
   * reconstruit à chaque recalcul des visuels : survol, tick temps réel, palier de
   * zoom. Soit 48 segments retriangulés pour un disque qui n'avait pas bougé.
   *
   * L'APPARITION d'un pointillé en fait partie, alors que ses longueurs non : le
   * ruban ne porte l'abscisse curviligne (`aDist`) que s'il est construit pour, et
   * sans elle le shader du pointillé n'a rien à découper.
   */
  private static geometryChanged(a: LinkVisual, b: LinkVisual): boolean {
    if (a.disc || b.disc) {
      return a.disc?.center !== b.disc?.center || a.disc?.radiusPx !== b.disc?.radiusPx
    }
    return a.points !== b.points || a.width !== b.width || !a.dash !== !b.dash
  }

  /** Point d'ancrage d'un visuel : centre du disque, ou premier point du tracé. */
  protected anchorOf(visual: LinkVisual): LatLng {
    return visual.disc?.center ?? visual.points[0] ?? { lat: 0, lng: 0 }
  }

  protected buildDrape(visual: LinkVisual, height: number | null, previous?: LinkDrape): LinkDrape | null {
    // Étiquette du drape précédent REPRISE telle quelle (cf. `buildDrape` de la base).
    const reuseLabel = previous?.label ?? null
    const anchor = visual.disc ? visual.disc.center : visual.points[0]
    if (!anchor || (!visual.disc && visual.points.length < 2)) return null
    const h = this.heightOr(height)
    const frame = new EnuFrame(this.projection, anchor, h)
    // Épaisseur : px écran → mètres monde à la résolution courante (cf. PathLayer).
    const mpp = this.mpp(anchor, h)
    const order = this.defaults.renderOrder
    const enu = frame.group()
    let casing: THREE.MeshBasicMaterial | null = null

    if (visual.disc) {
      const geo = fillGeo(
        circlePoints(
          frame.local(visual.disc.center),
          visual.disc.radiusPx * mpp,
          this.config.performance.circleSegments,
        ),
      )
      if (!geo) return null
      const material = fillMaterial(visual.color, this.flatDepthTest, visual.opacity)
      const mesh = new THREE.Mesh(geo, material)
      mesh.renderOrder = order
      enu.add(mesh)
      const drape: LinkDrape = {
        enu,
        anchor,
        height,
        mpp,
        item: visual,
        material,
        casing,
        dash: null,
        label: reuseLabel,
      }
      this.applyColor(drape, visual)
      this.syncLabel(drape)
      return drape
    }

    const pts = visual.points.map((p) => frame.local(p))
    const width = visual.width * mpp
    // Seul le trait porte l'abscisse curviligne : le casing, toujours plein, n'en a
    // pas l'usage — et il est reconstruit aussi souvent que lui.
    const build = (w: number, withDistance = false): THREE.BufferGeometry | null => ribbon(pts, w, false, withDistance)
    const geometry = build(width, !!visual.dash)
    if (!geometry) return null

    // Pas de contour sous un pointillé : entre deux tirets il resterait seul visible,
    // et le trait se lirait dans la couleur du contour au lieu de la sienne. Ce que
    // le contour apporte — un corps continu, lisible sur imagerie satellite — est
    // repris par `gapOpacity`, dans la couleur du trait.
    if (this.defaults.casingWidth > 0 && !visual.dash) {
      const cg = build(width + this.defaults.casingWidth * mpp)
      if (cg) {
        casing = strokeMaterial(this.defaults.casingColor, this.flatDepthTest, visual.opacity * CASING_OPACITY_RATIO)
        const cm = new THREE.Mesh(cg, casing)
        cm.renderOrder = order
        enu.add(cm)
      }
    }

    let dash: LinkDrape['dash'] = null
    let material: THREE.MeshBasicMaterial
    if (visual.dash) {
      // Longueurs posées juste après par `applyDash` (point de conversion unique) ;
      // les couleurs le sont par `applyColor`.
      const dashed = dashedStrokeMaterial([visual.color], {
        depthTest: this.flatDepthTest,
        opacity: visual.opacity,
        dash: 0,
        gap: 0,
        gapOpacity: visual.dash.gapOpacity,
      })
      // Le motif reprend là où le précédent en était : sans ce report, chaque rebuild
      // (palier de zoom, hauteur de drapage résolue) ferait sauter le pointillé.
      if (previous?.dash) dashed.dash.offset.value = previous.dash.material.dash.offset.value
      dash = { material: dashed, speed: 0 }
      material = dashed
    } else {
      material = strokeMaterial(visual.color, this.flatDepthTest, visual.opacity)
    }
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = order + 1
    enu.add(mesh)

    const drape: LinkDrape = { enu, anchor, height, mpp, item: visual, material, casing, dash, label: reuseLabel }
    if (visual.dash) this.applyDash(drape, visual.dash)
    this.applyColor(drape, visual)
    this.syncLabel(drape)
    return drape
  }

  /**
   * Fait défiler les pointillés. Un simple décalage d'uniforme : aucune géométrie
   * n'est touchée, et les traits pleins ne coûtent rien du tout.
   */
  protected onUpdate(ctx: FrameContext): void {
    let marching = false
    for (const d of this.drapes) {
      if (!d.dash) continue
      const { dash, gap, offset, count } = d.dash.material.dash
      // Le cycle est la période fois le nombre de COULEURS : c'est au bout de N tirets
      // que le motif se répète vraiment. Reboucler sur une seule période ferait sauter
      // le trait d'une couleur à l'autre à chaque tour.
      const cycle = (dash.value + gap.value) * count.value
      if (!(cycle > 0)) continue
      marching = true
      // Remis dans le cycle à chaque tour : un décalage qui croît sans fin finit par
      // perdre sa précision en float 32 bits côté GPU, et le motif se met à saccader.
      offset.value = (offset.value + d.dash.speed * ctx.dt) % cycle
    }
    // Tirets qui défilent = image qui change, carte immobile comprise. Signalé une fois
    // pour la couche : le drapeau est global, le poser par lien ne l'est pas plus.
    if (marching) ctx.invalidate()
  }

  /** Crée, met à jour ou retire l'étiquette d'un lien selon son `label` courant. */
  private syncLabel(drape: LinkDrape): void {
    const { label, rank, slot } = drape.item
    // Conteneur nu, positionné par la couche et rempli par l'hôte : ni badge, ni
    // texte, ni croix. Créé UNE fois — le remonter à chaque passe détacherait le
    // portail de l'hôte et ferait perdre son état à ce qu'il contient.
    if (slot) {
      if (!drape.label) {
        const host = document.createElement('div')
        // PAS `m3d-link-label` : une ancre n'est pas une étiquette. Lui donner la
        // classe des étiquettes lui apportait fond, bordure, ombre et padding — un
        // rectangle sombre vide posé sur la carte — qu'il fallait ensuite annuler
        // propriété par propriété, et qui réapparaîtrait au moindre ajout de style
        // sur les étiquettes.
        host.className = 'm3d-link-anchor'
        ;(this.slotHost ?? this.overlay).appendChild(host)
        drape.label = host
        this.onSlotMount?.(drape.item.id, host)
      }
      drape.label.classList.toggle('m3d-hovered', !!drape.item.hovered)
      // Le rayon réel du socle : l'hôte s'en sert pour se poser hors de son emprise.
      if (drape.item.disc) {
        drape.label.style.setProperty('--m3d-hub-offset', `${Math.round(drape.item.disc.radiusPx)}px`)
      }
      return
    }
    if (label === null) {
      this.dropLabel(drape)
      return
    }
    // Structure créée UNE fois, puis seuls les contenus changent. Reconstruire les
    // enfants à chaque tick détacherait le bouton du DOM : il perdrait son `:hover`
    // natif et disparaîtrait sous le curseur en pleine intention de clic.
    let el = drape.label
    if (!el) {
      el = document.createElement('div')
      el.className = 'm3d-link-label'
      const badge = document.createElement('span')
      badge.className = 'm3d-link-rank'
      const text = document.createElement('span')
      text.className = 'm3d-link-text'
      el.append(badge, text)
      this.overlay.appendChild(el)
      drape.label = el
    }

    const badge = el.firstElementChild as HTMLElement
    const text = badge.nextElementSibling as HTMLElement
    badge.textContent = rank == null ? '' : String(rank)
    badge.style.display = rank == null ? 'none' : ''
    text.textContent = label
    el.classList.toggle('m3d-hovered', !!drape.item.hovered)
    el.classList.toggle('m3d-traced', !!drape.item.traced)
  }

  private dropLabel(drape: LinkDrape): void {
    if (!drape.label) return
    // L'hôte est prévenu AVANT le retrait du nœud : il doit pouvoir démonter son
    // portail proprement plutôt que de le découvrir détaché.
    if (drape.item.slot) this.onSlotUnmount?.(drape.item.id)
    drape.label.remove()
    drape.label = null
  }

  private removeDrape(i: number): void {
    const d = this.drapes[i]!
    this.dropLabel(d)
    disposeObject3D(d.enu)
    this.group.remove(d.enu)
    this.drapes.splice(i, 1)
  }

  /**
   * Lien le plus proche d'un point écran, ou `null`. Utilisé sur l'événement
   * `click` du moteur : la couche n'installe pas d'intercepteur pointeur, donc
   * elle ne peut pas voler le geste aux outils de dessin.
   */
  hitTest(screenX: number, screenY: number, tolPx: number): string | null {
    const camera = this.lastCamera
    if (this.drapes.length === 0 || !camera || !this.projection.isReady()) return null
    let bestId: string | null = null
    let bestDistance = tolPx
    for (const d of this.drapes) {
      // Un socle n'est pas un trait : il ne se sélectionne pas, il se commande.
      if (d.item.disc) continue
      const h = this.heightOf(d)
      // Sommet précédent tenu en SCALAIRES : un lien échantillonné porte jusqu'à
      // `MAX_STEPS + 1` points, et un couple `{x, y}` alloué par sommet mettait le GC
      // sous pression à la cadence du pointeur, pour une valeur lue une seule fois.
      let prevX = 0
      let prevY = 0
      let hasPrev = false
      for (const p of d.item.points) {
        const world = this.projection.latLngToWorld(p, this.scratch, h)
        const s = this.projection.worldToScreen(world, camera, this.screen)
        const visible = s.z <= 1
        if (hasPrev && visible) {
          const dist = segDistPx(screenX, screenY, prevX, prevY, s.sx, s.sy)
          if (dist < bestDistance) {
            bestDistance = dist
            bestId = d.item.id
          }
        }
        prevX = s.sx
        prevY = s.sy
        hasPrev = visible
      }
    }
    return bestId
  }

  /**
   * Socle sous un point écran, ou `null`. Séparé de `hitTest` : un socle n'est pas
   * un trait sélectionnable, il ne doit donc jamais répondre à la recherche
   * d'itinéraire — mais il doit savoir qu'on le survole.
   */
  hitTestHub(screenX: number, screenY: number): string | null {
    const camera = this.lastCamera
    if (this.drapes.length === 0 || !camera || !this.projection.isReady()) return null
    for (const d of this.drapes) {
      const disc = d.item.disc
      if (!disc) continue
      const world = this.projection.latLngToWorld(disc.center, this.scratch, this.heightOf(d))
      const s = this.projection.worldToScreen(world, camera, this.screen)
      if (s.z > 1) continue
      if (Math.hypot(screenX - s.sx, screenY - s.sy) <= disc.radiusPx + this.config.interaction.hubHitTolerancePx)
        return d.item.id
    }
    return null
  }

  setDefaults(d: Partial<LinkLayerDefaults>): void {
    this.defaults = { ...this.defaults, ...d }
  }

  /**
   * Positionne les étiquettes. Le test d'horizon les masque dès que le lien passe
   * derrière le globe — c'est ce qui tient lieu de condition d'affichage en
   * distance : au dézoom, plus rien ne s'empile sur le limbe.
   */
  project(ctx: FrameContext): void {
    this.lastCamera = ctx.camera
    for (const d of this.drapes) {
      const el = d.label
      if (!el) continue
      const pts = d.item.points
      const mid = d.item.disc ? d.item.disc.center : pts[Math.floor(pts.length / 2)]
      if (!mid) {
        el.style.display = 'none'
        continue
      }
      const world = this.projection.latLngToWorld(mid, this.scratch, this.heightOf(d))
      const visible = this.projection.isAboveHorizon(world, ctx.camera.position)
      const s = this.projection.worldToScreen(world, ctx.camera, this.screen)
      const show = visible && s.z <= 1
      // Rendu à la feuille de styles plutôt que forcé à `block` : un conteneur `slot`
      // est un flex (c'est ce qui centre son contenu sur le point du socle), et lui
      // imposer `block` en ligne le décentrerait à chaque frame visible.
      el.style.display = show ? '' : 'none'
      if (!show) continue
      // Une étiquette se CENTRE sur son point (le texte l'entoure) ; un conteneur
      // `slot`, non : il est l'ANCRE de ce que l'hôte y accroche, et ce contenu doit
      // se poser à CÔTÉ du marker, jamais par-dessus. Le recentrer le ramènerait de
      // la moitié de sa largeur sur l'ancre et la hampe, qu'il masquerait — c'est au
      // contenu de choisir son côté (padding de retrait, bascule contre les bords).
      el.style.transform = d.item.slot
        ? `translate3d(${s.sx}px, ${s.sy}px, 0)`
        : `translate3d(${s.sx}px, ${s.sy}px, 0) translate(-50%, -50%)`
    }
  }
}
