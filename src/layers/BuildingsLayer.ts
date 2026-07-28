import * as THREE from 'three'
import type { Ellipsoid } from '3d-tiles-renderer'
import { defaultConfig } from '../config/defaultConfig'
import type { BuildingsConfig, InternalServerConfig } from '../config/types'
import { attachBVH, bvhBytes, detachBVH } from '../core/bvh'
import { latToTileY, lngToTileX, tileXToLng, tileYToLat } from '../core/googleTiles'
import { trimSlash } from '../core/internalTiles'
import { DEG2RAD } from '../core/math'
import { intersectsView, type Tile, TileQueue, tileRange, tileRing } from '../core/TileQueue'
import { BuildingsSource, type BuiltTile } from '../data/buildingsSource'
import type { Shading, TileFrame } from '../data/mvt'
import type { Bounds, LatLng } from '../shared'
import { defaultTheme } from '../theme/defaultTheme'

/** Ce que la file de tuiles ne connaît pas : la géométrie montée dans la scène. */
type BuildingTile = Tile & { mesh: THREE.Mesh | null }

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
    make: (base) => ({ ...base, mesh: null }),
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
   * Sous `minViewZoom`, rien n'est demandé : de haut, les bâtiments ne couvriraient que
   * quelques pixels pour le prix du décodage d'une ville entière.
   */
  update(bounds: Bounds, zoom: number, aim: LatLng): void {
    if (this.disposed || !this.hasSource) return
    const frame = this.cache.beginFrame()
    if (zoom >= this.cfg.minViewZoom) this.requestLevel(bounds, aim)

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
   * Une vue inclinée peut couvrir un département : au-delà du budget, on RESSERRE
   * l'emprise autour du point regardé, au lieu de tout abandonner — un abandon en bloc
   * faisait disparaître les bâtiments dès qu'on inclinait, en laissant le fond défiler
   * seul.
   */
  private requestLevel(bounds: Bounds, aim: LatLng): void {
    const z = this.cfg.zoom
    const full = tileRange(bounds, z, this.cfg.margin, lngToTileX, latToTileY)
    if (full.x1 < full.x0 || full.y1 < full.y0) return
    const count = (full.x1 - full.x0 + 1) * (full.y1 - full.y0 + 1)
    const side = Math.floor(Math.sqrt(this.cfg.maxRequest))
    const r = count > this.cfg.maxRequest ? tileRing(aim, z, side, lngToTileX, latToTileY) : full
    for (let x = r.x0; x <= r.x1; x++) {
      for (let y = r.y0; y <= r.y1; y++) this.ensureTile(z, x, y)
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
    // Ce que la tuile retient réellement, GPU et CPU confondus — la matière du budget
    // mémoire. Un compte de tuiles ne dirait rien : entre campagne et centre-ville, le
    // rapport est de cent.
    t.bytes = built.positions.byteLength + built.indices.byteLength + colors.byteLength + bvhBytes(mesh)
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

  private disposeTile(t: BuildingTile): void {
    if (!t.mesh) return
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
    this.cache.dispose()
    this.material.dispose()
    this.source.dispose()
    this.parent.remove(this.group)
  }
}

/**
 * Écart (degrés) des différences finies qui mesurent les échelles locales — ~11 m :
 * assez grand pour la précision numérique, assez petit pour rester local.
 */
const FINITE_DIFF_DEG = 1e-4

/** Scratch de la mise à l'échelle des positions normalisées — jamais alloué par tuile. */
const SCRATCH_SCALE = new THREE.Vector3()
