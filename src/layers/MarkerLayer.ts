import * as THREE from 'three'
import type { Ellipsoid } from '3d-tiles-renderer'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { FrameContext, Layer } from '../core/Layer'
import type { Projection } from '../core/Projection'
import type { SelectableScreenItem } from '../core/Selectables'
import { clamp, DEG2RAD, shortestLngDelta } from '../core/math'
import type { LatLng } from '../shared'

export type OverlayItem = {
  id: string | number
  position: LatLng
  animateEnter?: boolean
  /** Priorité entre markers superposés (défaut 0) — cf. `MarkerData.zIndex`. */
  zIndex?: number
  /** Couleur de l'anneau quand ce marker est le sélectionné. */
  selectedColor?: string
}

export type MoveTween = { durationMs: number; easing: (t: number) => number }

type Node = {
  id: string | number
  /** Nœud interne `.m3d-marker-node` : cible du portail React + animations. */
  el: HTMLDivElement
  /** Enveloppe ancrée à `tiles.group`, positionnée par le `CSS2DRenderer`. */
  obj: CSS2DObject
  from: LatLng
  to: LatLng
  cur: LatLng
  t: number
  seen: number
  visible: boolean
  /** Hauteur du sol réel (m au-dessus ellipsoïde) échantillonnée sous le point. */
  groundHeight: number
  /** Priorité d'affichage demandée par la donnée (cf. `applyOrder`). */
  zIndex: number
  /** Dernière couleur d'anneau écrite — évite de réécrire le style à l'identique. */
  selColor: string | undefined
}

/**
 * Positionne des markers DOM par **clé stable**. Chaque marker est un `CSS2DObject`
 * enfant de `tiles.group` : sa position ECEF est fixée via
 * `ellipsoid.getCartographicToPosition`, puis c'est le `CSS2DRenderer` (piloté par
 * la même caméra que le rendu WebGL) qui le projette à l'écran chaque frame.
 * Héritant de la transformée exacte du tileset, le marker reste **rigoureusement
 * collé** à sa coordonnée — aucun calcul d'écran manuel, donc zéro dérive. Le
 * contenu (icône SVG, popup) est rendu par React via portail dans `el`.
 */
export class MarkerLayer implements Layer {
  moveTween: MoveTween = { durationMs: 500, easing: (t) => t }
  /** Masque les markers passés derrière le globe (test d'horizon ellipsoïde). */
  occlude = true
  /**
   * Pose les markers sur la **vraie surface des tuiles 3D** (sol/bâti) au lieu de
   * l'ellipsoïde WGS84 : élimine la parallaxe qui les fait « glisser » vers la rue
   * parallèle au pan. Passer à `false` pour revenir à l'ancrage ellipsoïde (hauteur 0).
   */
  settleToGround = true
  /**
   * Relève le badge de quelques px et le relie au sol par un fil + point d'ancrage
   * (leader line). Lève l'ambiguïté de position en vue rasante sans jamais masquer
   * l'alerte. `false` → badge centré directement sur le point.
   */
  leaderLine = true

  private readonly nodes = new Map<string | number, Node>()

  /**
   * Markers dont la position est pilotée par un geste en cours (repositionnement).
   * `setItems` ne les déplace pas : l'hôte n'a pas encore reçu la nouvelle position,
   * il rejouerait donc l'ancienne à chaque rendu et le marker sauterait sous le doigt.
   */
  private readonly pinned = new Set<string | number>()
  private readonly worldScratch = new THREE.Vector3()
  private selected: string | number | null = null
  /** Multi-sélection (outil sélection) — canal parallèle à `selected` (popup/follow). */
  private readonly multiSel = new Set<string | number>()
  /** Diamètre (px) de l'anneau de multi-sélection — CSS var posée par nœud. */
  private ringPx: number | null = null
  /** Diamètre de l'anneau pour un marker à AVATAR (cf. `setSelectionRing`). */
  private avatarRingPx: number | null = null
  /** Marker relevé au sommet du tri z (menu/popup ouvert). */
  private raised: string | number | null = null
  private frame = 0
  /** Curseur tournant + compteur pour re-échantillonner les markers fixes par lots. */
  private settleCursor = 0
  private settleTick = 0
  /**
   * Fenêtre (en frames) pendant laquelle on re-échantillonne le sol des markers
   * fixes. Ouverte à l'ajout de markers ou au mouvement caméra (les tuiles arrivent
   * en streaming juste après) ; au repos elle se ferme → aucun raycast inutile.
   */
  private resettleFrames = 0
  private readonly lastCam = { lat: 0, lng: 0, alt: 0 }

  constructor(
    private readonly group: THREE.Object3D,
    private readonly ellipsoid: Ellipsoid,
    private readonly projection: Projection,
    private readonly onMount: (id: string | number, el: HTMLDivElement) => void,
    private readonly onUnmount: (id: string | number) => void,
  ) {}

  /** Écrit la position ECEF **locale** (repère de `tiles.group`) à une hauteur donnée. */
  private writePosition(obj: CSS2DObject, p: LatLng, height: number): void {
    this.ellipsoid.getCartographicToPosition(p.lat * DEG2RAD, p.lng * DEG2RAD, height, obj.position)
  }

  /**
   * Échantillonne la hauteur du sol réel (tuiles) sous le point courant du nœud et
   * l'y repositionne. Sans tuile chargée à cet endroit, conserve la dernière
   * hauteur connue (le marker reste posé, puis se recale au streaming des tuiles).
   */
  private settle(node: Node): void {
    if (this.settleToGround) {
      // Niveau de la rue (min local), pas le toit : sinon parallaxe → rue parallèle.
      const h = this.projection.sampleGroundHeight(node.cur)
      if (h !== null) node.groundHeight = h
    }
    this.writePosition(node.obj, node.cur, node.groundHeight)
  }

  /**
   * Re-échantillonne un petit lot de markers **fixes** par frame (curseur tournant,
   * throttlé) pour suivre l'affinage des tuiles qui arrivent en streaming, sans
   * coûter un raycast par marker et par frame.
   */
  private settleStatic(): void {
    if (!this.settleToGround || this.resettleFrames <= 0) return
    this.resettleFrames--
    if (++this.settleTick % 3 !== 0) return
    const list: Node[] = []
    for (const n of this.nodes.values()) if (n.t >= 1) list.push(n)
    if (list.length === 0) return
    const k = Math.min(6, list.length)
    for (let i = 0; i < k; i++) this.settle(list[(this.settleCursor + i) % list.length]!)
    this.settleCursor = (this.settleCursor + k) % list.length
  }

  /** Ouvre la fenêtre de re-échantillonnage si la caméra a bougé (streaming imminent). */
  private noteCamera(cam: { lat: number; lng: number; altitude: number }): void {
    const moved =
      Math.abs(cam.lat - this.lastCam.lat) > 1e-6 ||
      Math.abs(cam.lng - this.lastCam.lng) > 1e-6 ||
      Math.abs(cam.altitude - this.lastCam.alt) > Math.max(1, cam.altitude * 1e-3)
    if (moved) {
      this.resettleFrames = Math.max(this.resettleFrames, 90)
      this.lastCam.lat = cam.lat
      this.lastCam.lng = cam.lng
      this.lastCam.alt = cam.altitude
    }
  }

  setItems(items: readonly OverlayItem[]): void {
    this.frame++
    for (const item of items) {
      const existing = this.nodes.get(item.id)
      if (existing) {
        existing.seen = this.frame
        // Style et priorité suivent la donnée à chaud, même position inchangée
        // (un agent qui prend le focus change de couleur d'anneau sans bouger).
        this.applyItemStyle(existing, item)
        if (this.pinned.has(item.id)) continue
        if (existing.to.lat !== item.position.lat || existing.to.lng !== item.position.lng) {
          existing.from = { ...existing.cur }
          existing.to = { ...item.position }
          existing.t = 0
        }
      } else {
        const el = document.createElement('div')
        el.className = 'm3d-marker-node'
        if (item.animateEnter !== false) el.classList.add('m3d-enter')
        // Enveloppe positionnée par le CSS2DRenderer ; l'animation d'entrée vit sur
        // le nœud interne pour ne pas entrer en conflit avec le transform d'ancrage.
        const anchor = document.createElement('div')
        anchor.className = 'm3d-marker-anchor'
        if (this.leaderLine) {
          // Fil vertical (sol → badge) + point d'ancrage au sol : l'alerte reste
          // toujours visible tout en montrant précisément le point qu'elle marque.
          // Wrapper `lift` dédié au décalage vertical → l'animation d'entrée garde
          // son propre `transform` sur `el` sans conflit.
          const leader = document.createElement('span')
          leader.className = 'm3d-marker-leader'
          const dot = document.createElement('span')
          dot.className = 'm3d-marker-dot'
          const lift = document.createElement('div')
          lift.className = 'm3d-marker-lift'
          lift.appendChild(el)
          anchor.append(leader, dot, lift)
        } else {
          anchor.appendChild(el)
        }
        const obj = new CSS2DObject(anchor)
        // center (0,0) → coin haut-gauche ancré au point : le contenu se recentre
        // via ses marges négatives, comme l'ancien `translate3d(sx,sy)`.
        obj.center.set(0, 0)
        this.group.add(obj)
        const node: Node = {
          id: item.id,
          el,
          obj,
          from: { ...item.position },
          to: { ...item.position },
          cur: { ...item.position },
          t: 1,
          seen: this.frame,
          visible: true,
          groundHeight: 0,
          zIndex: 0,
          selColor: undefined,
        }
        this.applyItemStyle(node, item)
        // Pose immédiate sur le sol si les tuiles sont déjà là ; sinon hauteur 0
        // puis recalage pendant la fenêtre de re-échantillonnage (le temps que les
        // tuiles de la zone se chargent).
        this.settle(node)
        this.resettleFrames = Math.max(this.resettleFrames, 150)
        this.nodes.set(item.id, node)
        // Restaure le z-order si ce marker est déjà sélectionné/relevé : un nœud
        // recréé (marker → cluster → marker avec menu ouvert) repart à renderOrder 0,
        // sinon son menu repasse DERRIÈRE le cluster voisin.
        this.applyOrder(item.id)
        // Même restauration pour la multi-sélection : un marker absorbé par un
        // cluster puis ré-éclaté ressort avec son anneau.
        if (this.multiSel.has(item.id)) el.classList.add('m3d-multisel')
        this.applyRingVars(el)
        this.onMount(item.id, el)
        if (item.animateEnter !== false) {
          requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('m3d-enter')))
        }
      }
    }
    for (const [id, node] of this.nodes) {
      if (node.seen !== this.frame) {
        this.onUnmount(id)
        // Retirer l'objet fait remonter `removed` → l'enveloppe DOM est détachée du
        // domElement du CSS2DRenderer (pas de fuite).
        this.group.remove(node.obj)
        this.nodes.delete(id)
      }
    }
  }

  /**
   * Repositionne un marker **immédiatement**, sans interpolation : le point doit
   * coller au curseur pendant un geste, pas le rattraper avec 500 ms de retard.
   * À encadrer par `setPinned(id, true/false)` pour que `setItems` ne le rejoue pas.
   */
  moveItemNow(id: string | number, p: LatLng): void {
    const n = this.nodes.get(id)
    if (!n) return
    n.from = { lat: p.lat, lng: p.lng }
    n.to = { lat: p.lat, lng: p.lng }
    n.cur = { lat: p.lat, lng: p.lng }
    n.t = 1
    this.settle(n)
  }

  /** Gèle (ou libère) la position d'un marker vis-à-vis de `setItems`. */
  setPinned(id: string | number, pinned: boolean): void {
    if (pinned) this.pinned.add(id)
    else this.pinned.delete(id)
  }

  /**
   * Diamètres de l'anneau de sélection : `px` pour un sprite, `avatarPx` pour une
   * photo.
   *
   * Deux valeurs parce que les deux contenus n'occupent pas le même gabarit : un
   * avatar remplit tout le carré du marker, là où la pastille visible d'un sprite
   * n'en couvre qu'une fraction (l'appelant cale `px` sur elle). Un diamètre unique
   * ferait donc passer l'anneau à l'intérieur de la photo.
   *
   * Posée à la création de chaque nœud, et resynchronisée ici au changement : pas de
   * passe sur tous les nœuds à chaque mount/unmount côté React.
   */
  setSelectionRing(px: number, avatarPx?: number): void {
    const avatar = avatarPx ?? null
    if (this.ringPx === px && this.avatarRingPx === avatar) return
    this.ringPx = px
    this.avatarRingPx = avatar
    for (const node of this.nodes.values()) this.applyRingVars(node.el)
  }

  private applyRingVars(el: HTMLElement): void {
    if (this.ringPx !== null) el.style.setProperty('--m3d-selring', `${this.ringPx}px`)
    if (this.avatarRingPx !== null) el.style.setProperty('--m3d-avatarring', `${this.avatarRingPx}px`)
  }

  /**
   * Applique la multi-sélection de l'outil sélection : toggle la classe
   * `m3d-multisel` (anneau CSS) par diff — indépendant de `setSelected` mono-id.
   */
  setMultiSelected(ids: ReadonlySet<string | number>): void {
    for (const id of [...this.multiSel]) {
      if (!ids.has(id)) {
        this.multiSel.delete(id)
        this.nodes.get(id)?.el.classList.remove('m3d-multisel')
      }
    }
    for (const id of ids) {
      if (!this.multiSel.has(id)) {
        this.multiSel.add(id)
        this.nodes.get(id)?.el.classList.add('m3d-multisel')
      }
    }
  }

  /**
   * Positions écran (px canvas) des markers individuellement visibles — occlusion
   * horizon exclue (`node.visible`), derrière-caméra exclu (z>1). Appelée
   * uniquement au finalize du marquee : aucune position n'est maintenue par frame.
   */
  screenPositions(camera: THREE.Camera): SelectableScreenItem[] {
    const out: SelectableScreenItem[] = []
    for (const node of this.nodes.values()) {
      if (!node.visible) continue
      const world = node.obj.getWorldPosition(this.worldScratch)
      const s = this.projection.worldToScreen(world, camera)
      if (s.z <= 1) out.push({ id: node.id, x: s.sx, y: s.sy })
    }
    return out
  }

  setSelected(id: string | number | null): void {
    if (this.selected === id) return
    const prev = this.selected
    if (prev !== null) this.nodes.get(prev)?.el.classList.remove('m3d-selected')
    this.selected = id
    if (id !== null) this.nodes.get(id)?.el.classList.add('m3d-selected')
    this.applyOrder(prev)
    this.applyOrder(id)
  }

  /**
   * Relève un marker (menu/popup ouvert) tout en haut du tri z du `CSS2DRenderer`.
   * Sinon un cluster voisin plus PROCHE de la caméra reçoit un `z-index` supérieur
   * et son sous-arbre passe DEVANT le menu — le menu est un enfant du `CSS2DObject`
   * du marker, donc borné par le `z-index` de celui-ci. Le renderOrder est le seul
   * levier respecté par le tri z du `CSS2DRenderer` (sort par renderOrder décroissant).
   */
  setRaised(id: string | number | null): void {
    if (this.raised === id) return
    const prev = this.raised
    this.raised = id
    this.applyOrder(prev)
    this.applyOrder(id)
  }

  /**
   * Applique à un nœud ce que la DONNÉE porte : priorité d'affichage et couleur
   * d'anneau de sélection. Appelé à la création comme à chaque `setItems`, pour
   * qu'un changement d'état (un agent qui prend le focus) suive sans recréer le nœud.
   */
  private applyItemStyle(node: Node, item: OverlayItem): void {
    // `renderOrder` non fini désorganiserait tout le tri de la scène, pas seulement
    // ce marker : une valeur douteuse retombe sur la priorité neutre.
    const z = Number.isFinite(item.zIndex) ? item.zIndex! : 0
    if (z !== node.zIndex) {
      node.zIndex = z
      this.applyOrder(item.id)
    }
    // Var CSS plutôt qu'une classe : la couleur est une valeur continue, et le
    // style de l'anneau reste entièrement décrit dans la feuille. Écrite seulement
    // au changement : `setItems` passe sur TOUS les markers à chaque rafraîchissement
    // de données, et toucher au style de chacun sans raison est du travail pur.
    if (item.selectedColor === node.selColor) return
    node.selColor = item.selectedColor
    if (item.selectedColor) node.el.style.setProperty('--m3d-selcolor', item.selectedColor)
    else node.el.style.removeProperty('--m3d-selcolor')
  }

  /**
   * renderOrder combiné : relevé (menu ouvert) > sélectionné > `zIndex` de la donnée.
   *
   * Les deux états d'interaction passent AU-DESSUS de toute valeur demandée : un
   * `zIndex` métier ne doit jamais enterrer le marker avec lequel on interagit, ni
   * son menu ouvert (qui est un enfant de son `CSS2DObject`, donc borné par lui).
   * D'où le plancher borné plus bas : un `zIndex` extravagant est ramené sous lui
   * plutôt que de le franchir, sinon la garantie ci-dessus ne tiendrait qu'en
   * dessous d'une valeur arbitraire.
   */
  private applyOrder(id: string | number | null): void {
    if (id == null) return
    const node = this.nodes.get(id)
    if (!node) return
    const base = Math.min(node.zIndex, MarkerLayer.INTERACTION_FLOOR - 1)
    node.obj.renderOrder =
      id === this.raised
        ? MarkerLayer.INTERACTION_FLOOR + 1
        : id === this.selected
          ? MarkerLayer.INTERACTION_FLOOR
          : base
  }

  /** `renderOrder` réservé aux états d'interaction — hors d'atteinte des données. */
  private static readonly INTERACTION_FLOOR = 1e6

  /** Position live (lat/lng) d'un nœud, pour le suivi caméra. */
  getItemPosition(id: string | number): LatLng | null {
    const node = this.nodes.get(id)
    return node ? { ...node.cur } : null
  }

  /**
   * Passe 1 — avance le tween de position en lat/lng et **ne réécrit `obj.position`
   * que pendant le mouvement du point** (agent qui glisse). Un pan/zoom ne touche rien.
   */
  update(ctx: FrameContext): void {
    const dur = Math.max(1, this.moveTween.durationMs) / 1000
    for (const node of this.nodes.values()) {
      if (node.t >= 1) continue
      node.t = clamp(node.t + ctx.dt / dur, 0, 1)
      const e = this.moveTween.easing(node.t)
      node.cur.lat = node.from.lat + (node.to.lat - node.from.lat) * e
      node.cur.lng = node.from.lng + shortestLngDelta(node.from.lng, node.to.lng) * e
      // Marker en mouvement (agent qui glisse) : re-pose + re-échantillonne le sol chaque frame.
      this.settle(node)
    }
    // Caméra bougée → tuiles qui streament → rouvre la fenêtre de recalage.
    this.noteCamera(ctx.cameraState)
    // Markers fixes : re-échantillonnage tournant pour suivre le streaming des tuiles.
    this.settleStatic()
  }

  /**
   * Passe 2 — occlusion optionnelle : masque les markers derrière le globe via le
   * test d'horizon ellipsoïde. Aucun calcul de position d'écran (délégué au
   * CSS2DRenderer).
   */
  project(ctx: FrameContext): void {
    if (!this.occlude) return
    const camPos = ctx.camera.position
    for (const node of this.nodes.values()) {
      const world = node.obj.getWorldPosition(this.worldScratch)
      const above = this.projection.isAboveHorizon(world, camPos)
      if (above !== node.visible) {
        node.obj.visible = above
        node.visible = above
      }
    }
  }

  dispose(): void {
    for (const [id, node] of this.nodes) {
      this.onUnmount(id)
      this.group.remove(node.obj)
    }
    this.nodes.clear()
  }
}
