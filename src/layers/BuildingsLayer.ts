import * as THREE from 'three'
import type { Ellipsoid } from '3d-tiles-renderer'
import { defaultConfig } from '../config/defaultConfig'
import type { BuildingsConfig, InternalServerConfig } from '../config/types'
import { attachBVH, bvhBytes, detachBVH } from '../core/bvh'
import { latToTileY, lngToTileX, tileXToLng, tileYToLat } from '../core/googleTiles'
import { trimSlash } from '../core/internalTiles'
import { DEG2RAD } from '../core/math'
import { intersectsView, type Tile, TileQueue, tileRange } from '../core/TileQueue'
import { BuildingsSource, type BuiltTile } from '../data/buildingsSource'
import type { Shading, TileBuildings, TileFrame } from '../data/mvt'
import type { Bounds } from '../shared'
import { defaultTheme } from '../theme/defaultTheme'
import {
  type BuildingAttrs,
  type BuildingHighlight,
  type BuildingRef,
  buildingAttrs,
  buildingAtVertex,
  highlightActions,
  paintRange,
  restoreRange,
  saveRange,
} from './buildingPick'

export type { BuildingHighlight, BuildingRef } from './buildingPick'

/** Ce que la file de tuiles ne connaît pas : la géométrie montée dans la scène. */
type BuildingTile = Tile & {
  mesh: THREE.Mesh | null
  buildings: TileBuildings | null
  /**
   * Facteur d'ombrage par sommet, RETENU après le développement des couleurs : c'est lui
   * qui rend son relief au bâtiment surligné. Sans lui, la teinte de survol repeindrait
   * les quatre façades du même aplat.
   */
  shade: Uint8Array | null
}

/**
 * Ce qu'un raycast rend : de quoi re-désigner le bâtiment, et le point touché.
 *
 * Volontairement SANS ses attributs : le survol appelle `pick` à chaque mouvement du
 * pointeur et n'a besoin que de la référence. Les attributs se lisent au clic, par
 * `attrsOf`.
 */
export type BuildingPickResult = { ref: BuildingRef; point: THREE.Vector3 }

/** Apparence des volumes — vient du thème, jamais du code. */
export type BuildingColors = {
  wall: string
  roof: string
  /**
   * Éclaircissement du toit d'une emprise qui porte SA PROPRE couleur, en fraction vers
   * le blanc — c'est ce qui lui donne du volume sans lumière, là où `roof` s'en charge
   * pour les emprises laissées au thème.
   */
  roofLighten: number
  /** Soleil de convention qui module les façades selon leur orientation. */
  shading: Shading
  /** Teinte d'un bâtiment survolé, l'outil de sélection actif. */
  hover: string
  /** Teinte du bâtiment dont le menu est ouvert. */
  select: string
}

/**
 * Bâtiments extrudés depuis les tuiles vectorielles du serveur interne : c'est le volume
 * du fournisseur `'internal'`, là où le fournisseur externe fournit des tuiles 3D
 * photoréalistes.
 *
 * Un SEUL niveau de zoom (celui du `maxzoom` des données) : au-delà, la même tuile sert,
 * les bâtiments ne gagnent rien à être redemandés plus fins.
 *
 * Présence, concurrence, backoff, éviction et annulation vivent dans `TileQueue`, partagé
 * avec le fond raster ; téléchargement, décodage et extrusion dans un **worker**
 * (`BuildingsSource`). La frame ne fait donc que basculer des visibilités et faire tourner
 * la file. Chaque tuile porte son **BVH** : sans lui, un rayon de la carte testait ses
 * ~131 000 triangles un par un, plusieurs fois par frame.
 */
export class BuildingsLayer {
  readonly group = new THREE.Group()
  private readonly source = new BuildingsSource()
  private disposed = false
  /** Origine substituée dans le gabarit ; vide = rien à demander. */
  private origin = ''
  /**
   * Altitude (m) du sol sous les bâtiments — celle à laquelle le fond raster est drapé.
   * Intégrée au repère de chaque tuile : la changer invalide ce qui est déjà extrudé.
   */
  private elevation = 0
  /**
   * Gabarit dont `{origin}` est DÉJÀ substitué — seuls `z`/`x`/`y` varient ensuite. Résolu
   * une fois par changement de config et non par tuile, comme `InternalTileSource` le fait
   * déjà : il est appelé jusqu'à `maxRequest` fois par déplacement.
   */
  private template = ''

  // Scratch de `frameFor` — un repère par tuile, aucune allocation par appel.
  private readonly p0 = new THREE.Vector3()
  private readonly p1 = new THREE.Vector3()

  /** Mesh → tuile : le raycast rend un objet, la table de bâtiments vit sur la tuile. */
  private readonly byMesh = new Map<THREE.Object3D, BuildingTile>()
  /** Rayon du pick — jamais celui de `Projection`, dont les réglages servent la caméra. */
  private readonly raycaster = new THREE.Raycaster()
  /** Intersections du rayon, vidées et réutilisées à chaque pick (zéro allocation). */
  private readonly hits: THREE.Intersection[] = []
  /** Couleurs empruntées à la plage surlignée, par genre — rendues telles quelles ensuite. */
  private readonly saved: Record<BuildingHighlight, Uint8Array | null> = { hover: null, active: null }
  private readonly current: Record<BuildingHighlight, BuildingRef | null> = { hover: null, active: null }
  private readonly rgb = new THREE.Color()

  /**
   * UN matériau pour toutes les tuiles : leurs réglages sont identiques, et seule la
   * géométrie les distingue.
   *
   * Un matériau par tuile en allouait autant qu'il y a de tuiles en cache, chacun à
   * libérer à la bonne seconde — un `dispose()` manqué, et c'est un programme GPU qui
   * fuit. `DoubleSide` : les emprises OSM n'ont pas d'orientation garantie, et sans
   * lumière une face manquante se voit comme un trou dans le bâtiment.
   */
  private readonly material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })

  /**
   * Cache et file, partagés avec le fond raster (cf. `TileQueue`).
   *
   * `fetch` ne monte RIEN : c'est la file qui vérifie, au retour, que la tuile lui
   * appartient encore avant d'appeler `commit`. Une tuile évincée pendant son chargement
   * ne peut donc plus laisser un mesh orphelin dans la scène.
   */
  private readonly cache = new TileQueue<BuildingTile, BuiltTile>({
    budget: () => this.cfg,
    make: (base) => ({ ...base, mesh: null, buildings: null, shade: null }),
    fetch: (t, signal) => this.source.build(this.tileUrl(t), this.cfg, this.frameFor(t), this.colors.shading, signal),
    commit: (t, built) => this.buildMesh(t, built),
    release: (t) => this.disposeTile(t),
  })

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly ellipsoid: Ellipsoid,
    private cfg: BuildingsConfig = defaultConfig.providers.buildings,
    /** Serveur interne : origine partagée avec le fond raster, et seuil d'altitude commun. */
    server: InternalServerConfig = defaultConfig.providers.internal,
    /**
     * Façades, toits et soleil de convention — viennent de `theme.globe`. Figés au
     * montage, comme l'océan des globes de repli (`oceanColor`) : l'ombrage étant cuit
     * dans la géométrie, une charte qui change ne repeint pas ce qui est déjà extrudé.
     */
    private readonly colors: BuildingColors = {
      wall: defaultTheme.globe.buildingColor,
      roof: defaultTheme.globe.buildingRoofColor,
      roofLighten: defaultTheme.globe.buildingRoofLighten,
      shading: { azimuth: defaultTheme.globe.buildingSunAzimuth, min: defaultTheme.globe.buildingShadeMin },
      hover: defaultTheme.globe.buildingHoverColor,
      select: defaultTheme.globe.buildingSelectColor,
    },
  ) {
    this.group.name = 'm3d-buildings'
    this.group.visible = false
    // Pas d'`add` ici : le groupe n'entre dans le graphe qu'une fois visible (cf. `setVisible`).
    // Le gabarit se résout par `setConfig`, seul endroit qui le sache : le poser aussi ici
    // en ferait deux versions à tenir d'accord, et la couche restait muette (`template`
    // vide) si l'appelant oubliait le premier `setConfig`.
    this.setConfig(cfg, server)
  }

  /** Des tuiles sont en vol ou en attente de montage — l'image va encore changer. */
  get busy(): boolean {
    return this.cache.busy
  }

  /**
   * Montre ou retire les volumes.
   *
   * ⚠️ Le groupe est SORTI du graphe quand il est masqué, et pas seulement rendu
   * invisible : `Raycaster.intersect()` ne teste que `layers`, jamais `visible`. Un
   * groupe masqué reste donc entièrement sur le chemin des rayons — et la carte en lance
   * trois par frame sur `internalSurface` dès que le volume vient du serveur interne, mode
   * plan compris. Les bâtiments cachés arrêtaient ainsi la garde caméra sur des toits
   * invisibles, et `Projection.pickLatLng` rendait le point d'impact d'un toit au lieu du
   * sol — un clic décalé de toute la parallaxe, sur une carte pourtant plate.
   */
  setVisible(visible: boolean): void {
    if (visible === this.group.visible) return
    this.group.visible = visible
    if (visible) this.parent.add(this.group)
    else this.parent.remove(this.group)
  }

  /**
   * Opacité globale des volumes (fondu d'extinction au dézoom). Un SEUL matériau partagé :
   * une écriture suffit pour toutes les tuiles, aucune traversée. `transparent` n'est activé
   * que pendant le fondu (< 1) — à 1 le rendu reste opaque, sans coût de blending.
   */
  setOpacity(opacity: number): void {
    const transparent = opacity < 1
    if (this.material.opacity === opacity && this.material.transparent === transparent) return
    // `opacity` seul est un uniform ré-uploadé à chaque rendu : inutile de lever `needsUpdate`
    // à chaque frame du fondu. Seul le basculement de `transparent` (blending/depth) impose une
    // re-évaluation du programme — sans ce garde, ~1 re-éval de matériau était payée par frame.
    if (this.material.transparent !== transparent) this.material.needsUpdate = true
    this.material.opacity = opacity
    this.material.transparent = transparent
  }

  /**
   * Libère TOUTES les tuiles montées (géométries + matériaux GPU) — pour rendre la RAM/VRAM
   * quand le volume est masqué au dézoom. Le `feed` les redemandera au retour sous le seuil.
   */
  releaseAll(): void {
    this.cache.clear()
  }

  /**
   * Réglages à chaud. Un changement d'origine, de gabarit ou de sémantique des attributs
   * invalide tout ce qui est déjà extrudé — la géométrie en dépend, contrairement aux
   * budgets, qui ne pèsent que sur les demandes suivantes.
   */
  setConfig(cfg: BuildingsConfig, server: InternalServerConfig): void {
    const prev = this.cfg
    const prevOrigin = this.origin
    this.cfg = cfg
    this.origin = server.origin
    this.epsilon = server.elevationEpsilon
    this.template = cfg.tileUrl.replace('{origin}', trimSlash(server.origin))
    const rebuild =
      prevOrigin !== server.origin ||
      prev.tileUrl !== cfg.tileUrl ||
      prev.sourceLayer !== cfg.sourceLayer ||
      prev.heightField !== cfg.heightField ||
      prev.minHeightField !== cfg.minHeightField ||
      prev.hideField !== cfg.hideField ||
      prev.colorField !== cfg.colorField ||
      prev.defaultHeight !== cfg.defaultHeight ||
      prev.maxHeight !== cfg.maxHeight ||
      prev.positionPrecision !== cfg.positionPrecision ||
      prev.zoom !== cfg.zoom
    if (rebuild) this.cache.clear()
  }

  /** Seuil de reconstruction sur l'altitude du sol — cf. `providers.internal`. */
  private epsilon = defaultConfig.providers.internal.elevationEpsilon

  /**
   * Pose les volumes à l'altitude du sol, comme `TiledGlobeLayer.setElevation` pose le
   * fond : les deux doivent partager la même référence, sinon les bâtiments flottent
   * au-dessus du raster ou s'y enfoncent. L'altitude est intégrée au repère de chaque
   * tuile → reconstruction du cache quand elle change significativement (rare).
   */
  setElevation(meters: number): void {
    if (Math.abs(meters - this.elevation) < this.epsilon) return
    this.elevation = meters
    this.cache.clear()
  }

  /** Y a-t-il de quoi servir des bâtiments ? (origine renseignée) */
  get hasSource(): boolean {
    return this.origin !== '' && this.cfg.tileUrl !== ''
  }

  /** Mémoire retenue par les volumes montés (octets) — lue par le panneau de réglages. */
  get usedBytes(): number {
    return this.cache.usedBytes
  }

  /**
   * Appelée chaque frame quand le volume interne est affiché. Demande les tuiles couvrant
   * la vue au zoom des données, montre celles qui sont prêtes, fait tourner file et
   * éviction.
   *
   * Appelée dès que le moteur veut du volume EN CACHE — donc aussi quand il est encore
   * masqué, pendant la bande de préchargement (cf. `MapEngine.updateBuildingsFade`). La
   * couche ignore la caméra : c'est au moteur de décider quand cesser de l'appeler.
   */
  update(bounds: Bounds): void {
    if (this.disposed || !this.hasSource) return
    const frame = this.cache.beginFrame()
    this.requestLevel(bounds)

    /**
     * ⚠️ Toute tuile prête était montrée ET marquée « vue cette frame », sans regarder
     * l'emprise. Deux conséquences, l'une de mémoire et l'autre de rendu :
     *
     * - l'éviction écarte les tuiles vues cette frame ; comme elles l'étaient TOUTES, la
     *   liste de candidates restait vide et **rien n'était jamais évincé** — le plafond ne
     *   servait à rien et le cache grossissait sans borne.
     * - Ce qui avait été chargé ailleurs restait à l'écran, donc l'étendue du bâti était
     *   celle de l'historique de navigation, pas celle de la vue.
     */
    for (const t of this.cache.values()) {
      if (t.state !== 'ready' || !t.mesh) continue
      const inView = intersectsView(t, bounds)
      t.mesh.visible = inView
      if (inView) t.lastUsed = frame
    }
    this.cache.pump()
    this.cache.evict()
  }

  /**
   * Emprise demandée au zoom des données.
   *
   * ⚠️ Il y avait ici un repli : au-delà du budget, l'emprise était RESSERRÉE sur un carré
   * de côté fixe centré sur le point regardé. Il compensait une emprise qui explosait à
   * l'horizon — mais en basculant d'un régime à l'autre sans transition, et en laissant un
   * trou entre l'observateur et le carré dès que la vue s'inclinait. L'emprise reçue est
   * désormais bornée en amont (`providers.buildings.maxViewDistance`), donc continue :
   * `maxRequest` n'est plus qu'un filet, et le pic mesuré (24 tuiles) reste loin dessous.
   */
  private requestLevel(bounds: Bounds): void {
    const z = this.cfg.zoom
    const r = tileRange(bounds, z, this.cfg.margin, lngToTileX, latToTileY)
    if (r.x1 < r.x0 || r.y1 < r.y0) return
    // L'emprise reçue est le CARRÉ circonscrit au disque de couverture (cf.
    // `MapEngine.volumeBounds`) : en écarter les coins rend 21 % du budget — assez pour
    // gagner ~1 km de portée à compte de tuiles constant. Le demi-côté vaut le rayon.
    const cLat = (bounds.north + bounds.south) / 2
    const cLng = (bounds.east + bounds.west) / 2
    const radLat = (bounds.north - bounds.south) / 2
    const radLng = (bounds.east - bounds.west) / 2
    for (let x = r.x0; x <= r.x1; x++) {
      for (let y = r.y0; y <= r.y1; y++) {
        // Centre de la tuile rapporté au rayon, en degrés normalisés : le disque redevient
        // un cercle unité, sans conversion en mètres ni cosinus de latitude à refaire.
        const dLat = (tileYToLat(y + 0.5, z) - cLat) / radLat
        const dLng = (tileXToLng(x + 0.5, z) - cLng) / radLng
        if (dLat * dLat + dLng * dLng > 1) continue
        this.ensureTile(z, x, y)
      }
    }
  }

  private ensureTile(z: number, x: number, y: number): void {
    this.cache.ensure(z, x, y, tileXToLng(x, z), tileXToLng(x + 1, z), tileYToLat(y, z), tileYToLat(y + 1, z))
  }

  private tileUrl(t: BuildingTile): string {
    return this.template.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y))
  }

  /**
   * Repère East-North-Up au centre de la tuile, dans lequel le worker exprime la
   * géométrie (cf. `TileFrame`).
   *
   * Les deux échelles sont MESURÉES sur le vrai ellipsoïde par différences finies, plutôt
   * que dérivées d'une constante « mètres par degré » : celle-ci vaut pour l'équateur et
   * introduirait ~2 m de dérive en latitude sur une tuile — assez pour décaler les
   * emprises extrudées des bâtiments dessinés dans le raster. Rien de la géodésie du
   * moteur n'est ainsi recopié dans le worker.
   */
  private frameFor(t: BuildingTile): TileFrame {
    const lat0 = tileYToLat(t.y + 0.5, t.z)
    const lng0 = tileXToLng(t.x + 0.5, t.z)
    const d = FINITE_DIFF_DEG
    this.ellipsoid.getCartographicToPosition(lat0 * DEG2RAD, lng0 * DEG2RAD, this.elevation, this.p0)
    this.ellipsoid.getCartographicToPosition(lat0 * DEG2RAD, (lng0 + d) * DEG2RAD, this.elevation, this.p1)
    const metersPerDegLng = this.p0.distanceTo(this.p1) / d
    this.ellipsoid.getCartographicToPosition((lat0 + d) * DEG2RAD, lng0 * DEG2RAD, this.elevation, this.p1)
    const metersPerDegLat = this.p0.distanceTo(this.p1) / d
    return { z: t.z, x: t.x, y: t.y, lat0, lng0, metersPerDegLng, metersPerDegLat }
  }

  /**
   * Monte les tampons du worker en un mesh. Un mesh par tuile, pas par bâtiment — sinon
   * des milliers d'objets à parcourir chaque frame.
   *
   * La géométrie est en mètres LOCAUX : c'est la matrice du mesh (repère ENU au centre de
   * la tuile) qui la pose sur le globe. Elle est figée, donc `matrixAutoUpdate` est coupé.
   *
   * L'ombrage vient des couleurs de sommets : la scène n'a aucune lumière (tout est en
   * `MeshBasicMaterial`), un toit plus clair que ses façades suffit à lire le volume.
   */
  private buildMesh(t: BuildingTile, built: BuiltTile): void {
    if (!built) return
    const geo = new THREE.BufferGeometry()
    // `int16` : positions entières normalisées sur `positionScale`, décodées par le GPU —
    // deux fois moins d'octets, pour ~4 cm de résolution (cf. `positionPrecision`).
    const normalized = built.positions instanceof Int16Array
    geo.setAttribute('position', new THREE.BufferAttribute(built.positions, 3, normalized))
    const colors = this.expandColors(built)
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3, true))
    geo.setIndex(new THREE.BufferAttribute(built.indices, 1))
    const mesh = new THREE.Mesh(geo, this.material)
    mesh.matrixAutoUpdate = false
    const frame = this.frameFor(t)
    this.ellipsoid.getEastNorthUpFrame(frame.lat0 * DEG2RAD, frame.lng0 * DEG2RAD, this.elevation, mesh.matrix)
    // Une position normalisée vit dans [-1, 1] : c'est la matrice qui lui rend ses mètres,
    // avant de la poser sur le globe. Sans mise à l'échelle en `float32`, où les sommets
    // sont déjà en mètres.
    if (normalized) mesh.matrix.scale(SCRATCH_SCALE.setScalar(built.positionScale))
    mesh.matrixWorldNeedsUpdate = true
    // Volumes réels : ils se testent en profondeur ENTRE EUX (contrairement aux tuiles
    // plates, peintes sans depth test). renderOrder 0 → au-dessus du fond raster (< 0),
    // sous zones, tracés et dessins (≥ 1).
    mesh.renderOrder = 0
    /**
     * Sans arbre, ce mesh à lui seul remettrait la carte à genoux (cf. `attachBVH`).
     *
     * Construit ICI et non dans le worker : `MeshBVH` importe three, et le tirer dans un
     * worker empaqueté en blob autonome y embarquerait le moteur entier. C'est
     * `mountPerFrame` qui répond au coût, en n'en payant qu'un par frame.
     */
    attachBVH(mesh)
    t.mesh = mesh
    t.buildings = built.buildings
    t.shade = built.shade
    this.byMesh.set(mesh, t)
    // Ce que la tuile retient réellement, GPU et CPU confondus — la matière du budget
    // mémoire. Un compte de tuiles ne dirait rien : entre campagne et centre-ville, le
    // rapport est de cent.
    t.bytes =
      built.positions.byteLength +
      built.indices.byteLength +
      colors.byteLength +
      bvhBytes(mesh) +
      built.shade.byteLength +
      built.buildings.vStart.byteLength +
      built.buildings.featureIds.byteLength +
      built.buildings.heights.byteLength +
      propsBytes(built.buildings.props)
    this.group.add(mesh)
  }

  /**
   * Développe les index de couleur du worker en couleurs de sommets.
   *
   * C'est ici, et pas dans le worker, que les chaînes sont résolues : `THREE.Color` connaît
   * les 147 mots-clés CSS que la donnée emploie (`beige`, `silver`…) et l'espace
   * colorimétrique de la scène. La palette compte une douzaine d'entrées par tuile — le
   * coût réel est la boucle de développement, quelques millisecondes pour ~231 000 sommets.
   *
   * Sortie en `Uint8Array` NORMALISÉ et non en `Float32Array` : une teinte de façade n'a que
   * faire de 24 bits de mantisse, et c'est 3 Mo par tuile dense qui deviennent 780 Ko — en
   * mémoire vive comme à l'upload GPU.
   */
  private expandColors({ colorIndex, shade, palette }: NonNullable<BuiltTile>): Uint8Array {
    const lut = new Uint8Array(palette.length * 3)
    const c = new THREE.Color()
    const white = new THREE.Color(0xffffff)
    for (let i = 0; i < palette.length; i++) {
      const entry = palette[i]!
      // Le thème est posé D'ABORD, y compris pour une entrée de donnée : `Color.set` laisse
      // la couleur inchangée face à une chaîne qu'il ne comprend pas, et `c` étant réutilisé
      // d'un tour à l'autre, l'emprise hériterait sinon de la couleur de la précédente.
      c.set(entry.roof ? this.colors.roof : this.colors.wall)
      if (entry.color) {
        c.set(entry.color)
        if (entry.roof) c.lerp(white, this.colors.roofLighten)
      }
      // Arrondi, et non troncature : sur huit bits en espace linéaire, le demi-pas perdu
      // se voit comme un ton de banding sur les grandes façades sombres.
      lut[i * 3] = Math.round(c.r * 255)
      lut[i * 3 + 1] = Math.round(c.g * 255)
      lut[i * 3 + 2] = Math.round(c.b * 255)
    }
    const out = new Uint8Array(colorIndex.length * 3)
    for (let i = 0; i < colorIndex.length; i++) {
      const o = colorIndex[i]! * 3
      // L'ombrage du worker s'applique ICI, où la teinte existe enfin : le worker sait de
      // quelle FACE il s'agit, pas de quelle couleur elle sera.
      const lit = shade[i]!
      out[i * 3] = (lut[o]! * lit) / 255
      out[i * 3 + 1] = (lut[o + 1]! * lit) / 255
      out[i * 3 + 2] = (lut[o + 2]! * lit) / 255
    }
    return out
  }

  /**
   * Bâtiment sous `ndc`, `null` s'il n'y en a pas.
   *
   * Un seul rayon : le BVH de chaque tuile est déjà là (cf. `attachBVH`) et `firstHitOnly`
   * l'arrête au premier triangle — un mouvement de pointeur coûte donc ~0,015 ms, au lieu
   * du parcours des 131 000 triangles d'une tuile dense.
   */
  pick(ndc: THREE.Vector2, camera: THREE.Camera): BuildingPickResult | null {
    // Groupe masqué = groupe SORTI du graphe (cf. `setVisible`) : rien à intersecter, et
    // surtout rien à désigner sur une carte qui ne montre pas ses volumes.
    if (!this.group.visible) return null
    this.raycaster.setFromCamera(ndc, camera)
    this.raycaster.far = Infinity
    ;(this.raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true
    // Tableau d'intersections RECYCLÉ : `intersectObject` en alloue un neuf à chaque appel
    // sans ce paramètre, et le survol l'appelle à chaque mouvement du pointeur.
    this.hits.length = 0
    this.raycaster.intersectObject(this.group, true, this.hits)
    const hit = this.hits[0]
    const face = hit?.faceIndex
    if (!hit || face === undefined || face === null) return null
    const tile = this.byMesh.get(hit.object)
    const idx = tile?.mesh?.geometry.getIndex()
    if (!tile?.buildings || !idx) return null
    // Le premier sommet de la face suffit : les trois appartiennent au même bâtiment, une
    // face n'enjambant jamais deux emprises.
    const index = buildingAtVertex(tile.buildings.vStart, idx.getX(face * 3))
    if (index < 0) return null
    return { ref: { tileKey: tile.key, index }, point: hit.point }
  }

  /** Attributs d'un bâtiment désigné. Lu au CLIC — le survol n'en a que faire. */
  attrsOf(ref: BuildingRef): BuildingAttrs {
    const t = this.find(ref.tileKey)?.buildings
    // Tuile évincée entre le clic et ici : des attributs vides valent mieux qu'un `null`
    // que chaque appelant devrait retester.
    return t ? buildingAttrs(t, ref.index) : { featureId: null, height: 0, minHeight: 0, props: {} }
  }

  /**
   * Coins de l'emprise d'un bâtiment, en repère MONDE, écrits dans `out` (4 points).
   * `false` quand la tuile n'est plus là.
   *
   * La boîte est mesurée dans le repère LOCAL de la tuile — de l'arithmétique sur la plage
   * de sommets — puis seuls ses quatre coins passent en monde. Un bâtiment fait quelques
   * dizaines de mètres : à cette échelle le repère est linéaire, et convertir chaque sommet
   * donnerait la même boîte pour mille fois le travail.
   *
   * Appelé au CLIC seulement, jamais au survol : c'est le seul endroit où l'emprise sert.
   */
  cornersOf(ref: BuildingRef, out: THREE.Vector3[]): boolean {
    const tile = this.find(ref.tileKey)
    const mesh = tile?.mesh
    const from = tile?.buildings?.vStart[ref.index]
    const to = tile?.buildings?.vStart[ref.index + 1]
    if (!mesh || from === undefined || to === undefined || to <= from) return false
    const pos = mesh.geometry.getAttribute('position')
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    // Le toit, mesuré et non déduit de l'ordre des sommets : cadrer sur la base ferait
    // passer la caméra à l'intérieur du volume.
    let top = -Infinity
    for (let v = from; v < to; v++) {
      // `getX`/`getY` dénormalisent d'eux-mêmes un attribut `int16` ; c'est la matrice du
      // mesh qui rend ensuite les mètres, puis la position sur le globe.
      const x = pos.getX(v)
      const y = pos.getY(v)
      const z = pos.getZ(v)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (z > top) top = z
    }
    out[0]!.set(minX, minY, top).applyMatrix4(mesh.matrixWorld)
    out[1]!.set(maxX, minY, top).applyMatrix4(mesh.matrixWorld)
    out[2]!.set(maxX, maxY, top).applyMatrix4(mesh.matrixWorld)
    out[3]!.set(minX, maxY, top).applyMatrix4(mesh.matrixWorld)
    return true
  }

  /**
   * Met (ou retire, avec `null`) la mise en évidence d'un genre donné.
   *
   * Réécrit la plage de l'attribut `color` DÉJÀ ALLOUÉ, après en avoir emprunté une copie :
   * aucun objet n'entre ni ne sort de la scène, et le BVH — qui ne connaît que `position`
   * et l'index — reste valide.
   */
  setHighlight(ref: BuildingRef | null, kind: BuildingHighlight): void {
    const { restore, paint } = highlightActions(this.current, ref, kind)
    for (const k of restore) this.restore(k)
    if (!paint) return
    const tile = this.find(paint.tileKey)
    const attr = tile?.mesh?.geometry.getAttribute('color')
    const from = tile?.buildings?.vStart[paint.index]
    const to = tile?.buildings?.vStart[paint.index + 1]
    if (!attr || !tile?.shade || from === undefined || to === undefined) return
    const colors = attr.array as Uint8Array
    const span = (to - from) * 3
    // Tampon d'emprunt recyclé tant qu'il est assez grand : un survol qui glisse d'un
    // bâtiment à l'autre, c'est un appel par mouvement de pointeur.
    const prev = this.saved[kind]
    const keep = prev && prev.length >= span ? prev : new Uint8Array(span)
    saveRange(colors, from, to, keep)
    this.saved[kind] = keep
    this.rgb.set(kind === 'hover' ? this.colors.hover : this.colors.select)
    paintRange(
      colors,
      from,
      to,
      Math.round(this.rgb.r * 255),
      Math.round(this.rgb.g * 255),
      Math.round(this.rgb.b * 255),
      tile.shade,
    )
    this.uploadRange(attr, from, to)
    this.current[kind] = paint
  }

  /**
   * Marque pour ré-upload la SEULE plage repeinte.
   *
   * Sans plage déclarée, three renvoie tout l'attribut à la carte graphique
   * (`bufferSubData(0, array)`) : ~677 Kio pour une tuile z14 dense, à chaque bâtiment
   * survolé, pour quelques centaines d'octets réellement modifiés. Three fusionne les
   * plages adjacentes puis les vide de lui-même après l'upload.
   */
  private uploadRange(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, from: number, to: number): void {
    // `addUpdateRange` n'existe que sur `BufferAttribute` ; la géométrie des tuiles n'est
    // jamais entrelacée, mais le type de retour de `getAttribute` couvre les deux.
    if ('addUpdateRange' in attr) attr.addUpdateRange(from * 3, (to - from) * 3)
    attr.needsUpdate = true
  }

  /** Rend ses couleurs d'origine à la plage surlignée d'un genre. */
  private restore(kind: BuildingHighlight): void {
    const ref = this.current[kind]
    const keep = this.saved[kind]
    this.current[kind] = null
    if (!ref || !keep) return
    const tile = this.find(ref.tileKey)
    const attr = tile?.mesh?.geometry.getAttribute('color')
    const from = tile?.buildings?.vStart[ref.index]
    const to = tile?.buildings?.vStart[ref.index + 1]
    if (!attr || from === undefined || to === undefined) return
    restoreRange(attr.array as Uint8Array, from, keep, (to - from) * 3)
    this.uploadRange(attr, from, to)
  }

  /** Tuile d'une clé — la file l'indexe déjà, inutile de parcourir le cache. */
  private find(tileKey: string): BuildingTile | undefined {
    return this.cache.get(tileKey)
  }

  private disposeTile(t: BuildingTile): void {
    if (!t.mesh) return
    this.byMesh.delete(t.mesh)
    t.buildings = null
    t.shade = null
    // Une tuile évincée sous un highlight laisserait une référence morte — et le prochain
    // `setHighlight` tenterait de restaurer des couleurs dans une géométrie libérée.
    if (this.current.hover?.tileKey === t.key) this.current.hover = null
    if (this.current.active?.tileKey === t.key) this.current.active = null
    this.group.remove(t.mesh)
    // L'arbre vit côté CPU : `geometry.dispose()` ne connaît que les ressources GPU.
    detachBVH(t.mesh)
    t.mesh.geometry.dispose()
    // Le matériau est PARTAGÉ (cf. `material`) : il survit à la tuile, et c'est `dispose()`
    // qui le libère une fois pour toutes.
    t.mesh = null
  }

  dispose(): void {
    this.disposed = true
    this.byMesh.clear()
    this.cache.dispose()
    this.material.dispose()
    this.source.dispose()
    this.parent.remove(this.group)
  }
}

/**
 * Poids RETENU par les attributs de `pickFields`, en octets — une estimation, mais du bon
 * ordre de grandeur.
 *
 * Vide par défaut, donc gratuit ; mais un hôte qui demande deux attributs texte sur une
 * tuile dense en retient plusieurs centaines de kilo-octets — davantage que tous les
 * tampons de la table réunis. Les omettre du budget ferait déclencher l'éviction trop tard,
 * et le plafond `maxBytes` serait dépassé sans que rien ne le voie.
 */
function propsBytes(props: Record<string, unknown>[] | null): number {
  if (!props) return 0
  let bytes = 0
  for (const p of props) {
    // En-tête d'objet + une entrée par clé ; les chaînes comptent leurs caractères (UTF-16).
    bytes += OBJECT_OVERHEAD
    for (const k in p) {
      const v = p[k]
      bytes += ENTRY_OVERHEAD + k.length * 2 + (typeof v === 'string' ? v.length * 2 : 0)
    }
  }
  return bytes
}

/** Coût d'un objet JS vide en V8 (en-tête + carte cachée), arrondi. */
const OBJECT_OVERHEAD = 56
/** Coût d'une paire clé/valeur dans un objet, hors longueur des chaînes. */
const ENTRY_OVERHEAD = 24

/**
 * Écart (degrés) des différences finies qui mesurent les échelles locales — ~11 m :
 * assez grand pour la précision numérique, assez petit pour rester local.
 */
const FINITE_DIFF_DEG = 1e-4

/** Scratch de la mise à l'échelle des positions normalisées — jamais alloué par tuile. */
const SCRATCH_SCALE = new THREE.Vector3()
