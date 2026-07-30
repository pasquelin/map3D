import * as THREE from 'three'
import type { Ellipsoid } from '3d-tiles-renderer'
import { defaultConfig } from '../config/defaultConfig'
import type { InternalServerConfig, TilesConfig } from '../config/types'
import { WORLD_BOUNDS } from '../core/bounds'
import { makeUnraycastable } from '../core/bvh'
import { latToTileY, lngToTileX, TILE_SIZE, tileXToLng, tileYToLat } from '../core/googleTiles'
import { clamp, DEG2RAD } from '../core/math'
import type { TileSource } from '../core/tileSource'
import { intersectsView, type Tile, TileQueue, tileRange, tileRing } from '../core/TileQueue'
import type { Bounds, LatLng } from '../shared'

/** Ce que la file de tuiles ne connaît pas : l'image reçue et le mesh monté. */
type RasterTile = Tile & { img: HTMLImageElement | null; mesh: THREE.Mesh | null }

/** Subdivisions par tuile : les tuiles basses (grandes) sont plus tessellées pour
 *  épouser la courbure ; les hautes (petites) restent légères. */
function segFor(z: number): number {
  if (z <= 1) return 32
  if (z <= 3) return 16
  if (z <= 5) return 8
  if (z <= 8) return 4
  return 2
}

/** Une ligne de sommets du maillage d'une tuile : sa latitude, et le `v` qu'elle échantillonne. */
export type MeshRow = { lat: number; v: number }

/**
 * Lignes de latitude du maillage d'une tuile, calottes polaires comprises.
 *
 * Web Mercator ne peut pas atteindre les pôles — la projection les envoie à l'infini, et
 * la pyramide s'arrête à ±85,0511°. Il reste donc, à chaque pôle, une calotte d'environ
 * 5° de latitude (~550 km de rayon) qu'AUCUNE tuile ne couvre : c'est la sphère de repli
 * qui y affleurait, d'où le disque de couleur d'océan au milieu de l'Antarctique.
 *
 * Une tuile de la rangée extrême reçoit donc une ligne SUPPLÉMENTAIRE, posée au pôle et
 * portant le `v` du bord (0 au nord, 1 au sud). Les deux lignes partageant la même
 * coordonnée de texture, le quad qui les relie n'échantillonne QUE la dernière ligne de
 * texels : le bord de l'image est étiré jusqu'au pôle au lieu d'être extrapolé. Rien à
 * télécharger, rien à décoder — la banquise continue simplement jusqu'au bout.
 */
export function meshRows(y: number, z: number, seg: number, fillPoles: boolean): MeshRow[] {
  const rows: MeshRow[] = []
  if (fillPoles && y === 0) rows.push({ lat: 90, v: 0 })
  for (let iy = 0; iy <= seg; iy++) {
    const fy = iy / seg
    rows.push({ lat: tileYToLat(y + fy, z), v: fy })
  }
  if (fillPoles && y === 2 ** z - 1) rows.push({ lat: -90, v: 1 })
  return rows
}

/** Réglages qui décident de QUELLE source sert les tuiles (origine du serveur incluse). */
function sourceSignature(cfg: TilesConfig, origin: string): string {
  return [cfg.provider, origin, cfg.style, cfg.retina, cfg.internalTileUrl, cfg.tileUrl, cfg.sessionUrl].join(' ')
}

/**
 * Globe 2D tuilé (quadtree) : fond de carte drapé sur l'ellipsoïde avec LOD, cache
 * mémoïsé (LRU), file de chargement à concurrence limitée, prefetch et raffinement
 * progressif. Un niveau de base couvre en permanence tout le globe (zéro trou), les
 * tuiles fines sont ajoutées/retirées incrémentalement selon la vue. Aucun rebuild
 * global : le rendu se raffine du flou vers le net sans à-coup.
 *
 * La source des tuiles est **injectée par une fabrique** (cf. `TileSource`) : le calque
 * ignore s'il parle à Google ou à un serveur auto-hébergé, et n'a jamais à connaître de
 * clé d'API. Une fabrique qui rend `null` (fournisseur non configuré) laisse le calque
 * en place, inerte, prêt à repartir dès que la config le permet.
 */
export class TiledGlobeLayer {
  readonly group = new THREE.Group()
  private readonly ocean: THREE.Mesh
  private readonly scratch = new THREE.Vector3()
  /** Origine locale de la tuile en cours de construction (cf. `buildMesh`). */
  private readonly tileOrigin = new THREE.Vector3()
  private elevation = 0
  private traffic = false
  private disposed = false
  /** Seuil de reconstruction sur l'altitude du sol — cf. `providers.internal`. */
  private epsilon = defaultConfig.providers.internal.elevationEpsilon

  /** Source courante ; `null` = fournisseur non servable (cf. `createTileSource`). */
  private source: TileSource | null
  /** Signature de la config qui a produit `source` — recréation quand elle change. */
  private signature: string

  /**
   * Cache et file, partagés avec le volume interne (cf. `TileQueue`).
   *
   * `fetch` ne monte RIEN : c'est la file qui vérifie, au retour, que la tuile lui
   * appartient encore. Le niveau de base est épinglé — c'est le filet qui garantit
   * l'absence de trou pendant que les niveaux fins arrivent.
   */
  private readonly cache = new TileQueue<RasterTile, HTMLImageElement>({
    budget: () => this.cfg,
    make: (base) => ({ ...base, img: null, mesh: null }),
    fetch: (t, signal) => this.fetchTile(t, signal),
    commit: (t, img) => {
      t.img = img
      // Le mesh se construit à l'affichage, pas ici : une tuile chargée hors de la vue
      // n'a aucune raison de payer sa géométrie. Les octets sont comptés au montage réel.
    },
    release: (t) => this.disposeTile(t),
    pinned: (t) => t.z === this.cfg.baseZoom,
  })

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly ellipsoid: Ellipsoid,
    /** Fabrique de source, relue à chaque changement de fournisseur (bascule à chaud). */
    private readonly createSource: (cfg: TilesConfig, origin: string) => TileSource | null,
    private cfg: TilesConfig = defaultConfig.providers.tiles,
    /** Serveur interne : origine partagée avec le volume, et seuil d'altitude commun. */
    server: InternalServerConfig = defaultConfig.providers.internal,
    /**
     * Océan de repli sous les tuiles. Vient de `theme.globe.oceanColor`, comme celui
     * du globe de secours : le bleu clair écrit ici était le second des deux
     * littéraux qui décidaient d'une couleur que le thème exposait déjà sans qu'elle
     * soit lue nulle part.
     */
    private readonly oceanColor: string = '#0F2942',
  ) {
    this.group.name = 'm3d-tiled-globe'
    this.group.visible = false
    this.source = createSource(cfg, server.origin)
    this.signature = sourceSignature(cfg, server.origin)
    this.epsilon = server.elevationEpsilon
    this.ocean = this.buildOcean()
    this.group.add(this.ocean)
    // Pas d'`add` ici : le groupe n'entre dans le graphe qu'une fois visible (cf. `setVisible`).
  }

  /** Des tuiles sont en vol ou en attente de montage — l'image va encore changer. */
  get busy(): boolean {
    return this.cache.busy
  }

  /**
   * Montre ou retire le fond tuilé.
   *
   * Le groupe est SORTI du graphe quand il est masqué : `Raycaster.intersect()` ne teste
   * que `layers`, jamais `visible`. Ses tuiles sont certes insensibles aux rayons
   * (`makeUnraycastable`), mais la traversée descend quand même dans chacune — jusqu'à
   * `maxTiles` enfants parcourus trois fois par frame pour n'y rien trouver.
   */
  setVisible(visible: boolean): void {
    if (visible === this.group.visible) return
    this.group.visible = visible
    if (visible) this.parent.add(this.group)
    else this.parent.remove(this.group)
  }

  /** Le fournisseur courant a-t-il de quoi servir des tuiles ? (clé, ou origine) */
  get hasSource(): boolean {
    return this.source !== null
  }

  /** Le fournisseur courant sait-il servir le calque trafic ? (Google seulement) */
  get supportsTraffic(): boolean {
    return this.source?.supportsTraffic ?? false
  }

  /**
   * Réglages à chaud. Le cache existant est CONSERVÉ : les budgets ne changent que
   * les prochaines demandes, et l'éviction ramènera d'elle-même la table sous un
   * nouveau plafond plus bas. Un `mapType` ou une langue différents changent en
   * revanche les URLs, donc le cache est vidé — sinon des tuiles de l'ancienne
   * session resteraient affichées.
   *
   * Changer de FOURNISSEUR (ou d'origine, de style, de densité) va plus loin : la
   * source elle-même est remplacée, sans démonter le calque — c'est ce qui permet de
   * basculer Google ↔ serveur interne sans remonter la carte.
   */
  setConfig(cfg: TilesConfig, server: InternalServerConfig): void {
    const prev = this.cfg
    this.cfg = cfg
    this.epsilon = server.elevationEpsilon
    const signature = sourceSignature(cfg, server.origin)
    if (signature !== this.signature) {
      this.signature = signature
      this.source = this.createSource(cfg, server.origin)
      this.cache.clear()
      return
    }
    this.source?.setConfig(cfg, server.origin)
    const urlChanged = prev.mapType !== cfg.mapType || prev.language !== cfg.language || prev.region !== cfg.region
    // Le remplissage polaire est cuit DANS la géométrie (une ligne de sommets en plus) :
    // le basculer ne change aucune URL, mais impose de reconstruire les maillages, sans
    // quoi le réglage ne prendrait effet qu'au gré des évictions.
    if (urlChanged || prev.fillPoles !== cfg.fillPoles) this.cache.clear()
  }

  /** Remplissage des calottes polaires — relu à chaud depuis la config (cf. `meshRows`). */
  private get fillPoles(): boolean {
    return this.cfg.fillPoles
  }

  /**
   * Pose le fond à l'altitude du terrain (mètres au-dessus de l'ellipsoïde), au lieu
   * de 0 : sinon, caméra basse, l'écart sol réel (~35 m à Paris) ↔ ellipsoïde fait
   * paraître la carte bien plus petite que la 3D. L'altitude est intégrée **dans la
   * géométrie** de chaque tuile (getCartographicToPosition) — reconstruction du cache
   * quand elle change significativement (rare : une fois par bascule 2D).
   */
  /**
   * Filtrage anisotrope appliqué aux textures montées, posé par `MapEngine` depuis
   * `performance.textureAnisotropy` (0 = maximum du matériel, résolu à la construction).
   * Les tuiles déjà montées gardent leur réglage : il ne change pas en cours de session.
   */
  anisotropy = 1

  /**
   * Hauteur (m au-dessus de l'ellipsoïde) à laquelle le fond est réellement drapé.
   *
   * C'est LE niveau du sol du volume interne : la nappe est plate et **non raycastable**
   * (cf. `makeUnraycastable`), donc aucun rayon ne peut le retrouver. Le mode piéton s'y
   * pose et y valide ses points d'entrée.
   */
  get groundElevation(): number {
    return this.elevation
  }

  setElevation(meters: number): void {
    if (Math.abs(meters - this.elevation) < this.epsilon) return
    this.elevation = meters
    this.cache.clear()
  }

  /** Active/désactive le calque trafic. Les URLs incluent la session (qui change avec
   *  le trafic) → on repart d'un cache vide. */
  setTraffic(traffic: boolean): void {
    if (traffic === this.traffic) return
    this.traffic = traffic
    this.cache.clear()
  }

  /** État réel du calque — le moteur le lit plutôt que d'en tenir une copie. */
  get trafficOn(): boolean {
    return this.traffic
  }

  /** Mémoire retenue par les tuiles montées (octets) — lue par le panneau de réglages. */
  get usedBytes(): number {
    return this.cache.usedBytes
  }

  /**
   * Appelé chaque frame en mode 2D. Demande les tuiles nécessaires (base + niveau de
   * la vue), affiche celles qui sont prêtes (toutes zooms confondus → fallback flou
   * pendant le chargement), puis fait tourner la file et l'éviction. Coût par frame
   * faible (quelques dizaines de tuiles).
   *
   * `refine = false` ne demande QUE le niveau de base : à utiliser pendant un vol
   * caméra, où les niveaux intermédiaires défilent trop vite pour être vus. Sans
   * cela, une descente d'intro (zoom 3 → 14) réclame les onze niveaux traversés,
   * soit plus d'un millier de tuiles jamais regardées — de quoi épuiser le quota
   * Google Map Tiles à chaque chargement de page.
   */
  update(bounds: Bounds, zoom: number, aim: LatLng, refine = true): void {
    if (this.disposed) return
    // Sans source (fournisseur non configuré), ne RIEN mettre en file : les tuiles
    // s'empileraient en attente d'un chargement impossible, pour être rejouées telles
    // quelles à la reconfiguration.
    if (!this.source) return
    const frame = this.cache.beginFrame()

    const baseZ = this.cfg.baseZoom
    // Filet de sécurité : le globe entier au niveau de base, toujours chargé, jamais évincé.
    this.requestLevel(baseZ, WORLD_BOUNDS, 0)

    /**
     * CASCADE de niveaux, du plus fin au plus grossier.
     *
     * ⚠️ Il n'y avait que DEUX niveaux : la base et un niveau cible, ce dernier étant
     * RABAISSÉ jusqu'à ce que son compte de tuiles tienne sur l'emprise entière. En vue
     * inclinée, l'emprise porte jusqu'à l'horizon : le niveau cible s'effondrait alors vers
     * la base, et tout ce que le cache ne couvrait pas déjà tombait d'un coup sur le niveau
     * 2 — une tuile grande comme un quart de continent, soit un aplat vert uniforme au
     * loin. Ça se lisait comme un bug d'affichage, et c'en était un.
     *
     * Chaque niveau ne comble désormais que ce que le précédent, deux fois plus fin, ne
     * couvre pas : un anneau de `lodRing` tuiles de côté autour du point visé suffit, et il
     * porte deux fois plus loin à chaque cran.
     *
     * ⚠️ La cascade s'arrêtait au niveau `covering`, celui qui couvre toute la vue dans le
     * budget — et ce niveau-là n'était demandé QUE sur `bounds`. Or `bounds` est déduit de
     * raycasts sur l'ellipsoïde : à l'horizon, le rayon rase la surface et l'emprise
     * s'arrête bien avant ce que l'œil voit. Au-delà, plus aucun niveau intermédiaire —
     * seulement le niveau de base, dont un texel étiré couvre alors des centaines de
     * kilomètres. C'est l'aplat uniforme qui restait au ras du ciel, exactement là où la
     * cascade croyait n'avoir plus rien à combler.
     *
     * Les anneaux descendent donc jusqu'au niveau de BASE, sans dépendre de la justesse de
     * `bounds`. Le coût est borné : à z=3 un anneau de 5 tuiles porte déjà 25 000 km, et
     * les niveaux grossiers sont demandés une fois puis resservis toute la session.
     *
     * Le coût en requêtes est bien moindre qu'il n'y paraît : les niveaux grossiers
     * couvrent d'immenses surfaces, donc ils sont demandés une fois puis resservis pendant
     * toute la session. Seul le niveau le plus fin se renouvelle en se déplaçant.
     */
    if (refine) {
      const { finest, covering } = lodLevels(bounds, zoom, this.cfg)
      for (let z = finest; z > baseZ; z--) this.requestRing(z, aim, this.cfg.lodRing)
      if (covering > baseZ) this.requestLevel(covering, bounds, this.cfg.margin)
    }

    // Rendu : toute tuile prête qui intersecte la vue (base incluse), la plus fine
    // au-dessus (renderOrder + polygonOffset par zoom).
    for (const t of this.cache.values()) {
      const inView = t.z === baseZ || intersectsView(t, bounds)
      if (t.state === 'ready' && inView) {
        if (!t.mesh) this.buildMesh(t)
        t.mesh!.visible = true
        t.lastUsed = frame
      } else if (t.mesh) {
        t.mesh.visible = false
      }
    }

    this.cache.pump()
    this.cache.evict()
  }

  /**
   * Anneau de `side` × `side` tuiles centré sur le point visé, au niveau `z`.
   *
   * C'est le pavé d'un cran de la cascade : le niveau plus fin, deux fois plus détaillé,
   * en couvre déjà le quart central — cet anneau ne sert donc qu'à combler la couronne
   * autour, et sa portée double à chaque cran plus grossier.
   */
  private requestRing(z: number, aim: LatLng, side: number): void {
    const r = tileRing(aim, z, side, lngToTileX, latToTileY)
    for (let x = r.x0; x <= r.x1; x++) {
      for (let y = r.y0; y <= r.y1; y++) this.ensureTile(z, x, y)
    }
  }

  /** Garantit la présence (dans le cache/file) des tuiles couvrant `bounds` au zoom `z`. */
  private requestLevel(z: number, bounds: Bounds, margin: number): void {
    const { x0, x1, y0, y1 } = tileRange(bounds, z, margin, lngToTileX, latToTileY)
    if (x1 < x0 || y1 < y0) return
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) this.ensureTile(z, x, y)
    }
  }

  /**
   * Bornes DÉCLARÉES étendues au pôle pour les rangées extrêmes, en même temps que la
   * géométrie l'est : `intersectsView` décide de la visibilité sur ces bornes, et les
   * laisser à ±85° aurait masqué la tuile — donc rouvert le trou — dès que la vue ne
   * cadrait plus que la calotte.
   */
  private ensureTile(z: number, x: number, y: number): void {
    const nord = this.fillPoles && y === 0 ? 90 : tileYToLat(y, z)
    const sud = this.fillPoles && y === 2 ** z - 1 ? -90 : tileYToLat(y + 1, z)
    this.cache.ensure(z, x, y, tileXToLng(x, z), tileXToLng(x + 1, z), nord, sud)
  }

  /**
   * Établit la session s'il en faut une, puis télécharge l'image.
   *
   * La source est CAPTURÉE pour toute la durée du chargement : une bascule de fournisseur
   * entre `ensureSession` et `tileUrl` produirait sinon l'URL de la nouvelle source avec
   * la session de l'ancienne.
   *
   * `<img>` ne donne pas le code HTTP : un 429 (quota, temporaire) est indistinguable
   * d'un 404 (tuile inexistante, définitif). On lève donc dans les deux cas, et la file
   * réessaie quelques fois avec du recul — sans quoi un simple dépassement de quota
   * laissait des trous DÉFINITIFS dans la carte, la tuile n'étant jamais redemandée.
   */
  private async fetchTile(t: RasterTile, signal: AbortSignal): Promise<HTMLImageElement> {
    const source = this.source
    if (!source) throw new Error('fournisseur de tuiles non configuré')
    await source.ensureSession(this.traffic) // mémoïsé/coalescé
    const img = await loadImage(source.tileUrl(t.z, t.x, t.y), signal)
    if (!img) throw new Error('tuile raster indisponible')
    return img
  }

  /**
   * Construit la géométrie (grille projetée sur l'ellipsoïde) + texture d'une tuile.
   *
   * ⚠️ Les sommets sont stockés RELATIVEMENT au centre de la tuile, dont la position monde
   * est portée par la matrice du mesh — jamais en coordonnées ECEF absolues.
   *
   * Un `Float32BufferAttribute` ne garde que 24 bits de mantisse : à la magnitude d'un
   * rayon terrestre (6,4·10⁶ m), son pas de quantification vaut **50 cm**. Les sommets
   * étaient donc collés sur une grille de 50 cm, et surtout la `modelViewMatrix` — dont la
   * translation valait elle aussi 6,4·10⁶ — était uploadée en float32 : le produit
   * sommet × matrice perdait sa précision par cancellation, d'une façon qui CHANGE avec la
   * position de la caméra. Mesuré à 65 m : 14 cm d'erreur, qui varient de 15 cm (≈ 2 px)
   * pour 50 cm de déplacement, et d'un montant différent par sommet — le sol gondolait.
   *
   * En repère local, les sommets ne dépassent pas la taille de la tuile et la translation
   * de la matrice est calculée en float64 côté CPU, puis réduite à (tuile − caméra) : deux
   * grandeurs petites, donc justes. C'est le motif que `BuildingsLayer` applique déjà.
   */
  private buildMesh(t: RasterTile): void {
    const seg = segFor(t.z)
    const positions: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const origin = this.tileOrigin
    this.ellipsoid.getCartographicToPosition(
      tileYToLat(t.y + 0.5, t.z) * DEG2RAD,
      tileXToLng(t.x + 0.5, t.z) * DEG2RAD,
      this.elevation,
      origin,
    )
    // Lignes de latitude, calotte polaire comprise pour les tuiles des rangées extrêmes.
    const rows = meshRows(t.y, t.z, seg, this.fillPoles)
    for (const { lat, v } of rows) {
      for (let ix = 0; ix <= seg; ix++) {
        const fx = ix / seg
        // Mercator : lng linéaire en X, lat non-linéaire en Y (interpole en espace tuile).
        const lng = tileXToLng(t.x + fx, t.z)
        this.ellipsoid.getCartographicToPosition(lat * DEG2RAD, lng * DEG2RAD, this.elevation, this.scratch)
        // La soustraction se fait ICI, en float64 : c'est elle qui sauve la précision.
        positions.push(this.scratch.x - origin.x, this.scratch.y - origin.y, this.scratch.z - origin.z)
        uvs.push(fx, v)
      }
    }
    const row = seg + 1
    // Bornée par le nombre RÉEL de lignes, pas par `seg` : une tuile polaire en porte une
    // de plus, et la sauter laissait la calotte sans triangles — donc le trou intact.
    for (let iy = 0; iy < rows.length - 1; iy++) {
      for (let ix = 0; ix < seg; ix++) {
        const a = iy * row + ix
        const b = a + 1
        const c = a + row
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(indices)

    const tex = new THREE.Texture(t.img!)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.flipY = false
    /**
     * Filtrage anisotrope — indispensable dès que le sol se regarde de biais.
     *
     * Un mipmap seul choisit UN niveau de détail pour les deux axes de la texture. Sur une
     * nappe vue en rasant, l'axe fuyant est bien plus comprimé que l'autre : le niveau
     * retenu est trop fin dans un sens (moiré) ou trop grossier dans l'autre (flou), et le
     * motif change au moindre déplacement de la caméra — le sol paraît alors grouiller.
     */
    tex.anisotropy = this.anisotropy
    tex.needsUpdate = true
    // Algorithme du peintre : pas de depth test, ordre = zoom (fine au-dessus de coarse).
    // `FrontSide` cule l'hémisphère arrière (winding sortant) → seul l'avant est peint,
    // sans z-fight entre niveaux coplanaires (fini le clignotement).
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.FrontSide,
      depthTest: false,
      depthWrite: false,
    })
    // renderOrder dans la bande (-1, 0) : au-dessus des étoiles (-1), sous les zones/
    // tracés/dessins (≥ 1). Fin (z élevé) → ordre plus haut → peint par-dessus la coarse.
    const mesh = new THREE.Mesh(geo, mat)
    // La position monde vit dans la matrice, pas dans les sommets (cf. l'en-tête).
    mesh.position.copy(origin)
    mesh.renderOrder = -0.8 + t.z * 0.005
    /**
     * Jamais touchée par un rayon, comme l'océan. Sous `TilesGroup`, ce fond ne l'était
     * pas non plus — le `raycast()` du groupe arrêtait la traversée. Le sortir de là l'a
     * rendu raycastable par accident : trois rayons par frame traversaient alors jusqu'à
     * `maxTiles` meshes sans arbre, dont les tuiles de base, dont la sphère englobante
     * couvre un quart de globe.
     *
     * Rien n'est perdu : c'est une surface PLATE à hauteur connue (`setElevation`), que
     * `Projection.flatHeight` et le repli ellipsoïde de `GlobeControls` rendent déjà
     * analytiquement. Seuls les bâtiments sont un vrai volume, et eux portent un BVH.
     */
    makeUnraycastable(mesh)
    t.mesh = mesh
    // Ce que la tuile retient une fois montée : la texture décodée sur le GPU (quatre
    // octets par texel, mipmaps exclus) et sa grille. C'est la texture qui pèse — la
    // géométrie fait quelques kilooctets au plus.
    const texels = (t.img?.naturalWidth || TILE_SIZE) * (t.img?.naturalHeight || TILE_SIZE)
    this.cache.account(t, texels * 4 + positions.length * 4 + uvs.length * 4 + indices.length * 4)
    this.group.add(mesh)
  }

  /** Sphère « océan » de repli (comble pôles/gaps sous les tuiles). */
  private buildOcean(): THREE.Mesh {
    const r = this.ellipsoid.radius
    const geo = new THREE.SphereGeometry(1, 48, 32)
    // À la surface de l'ellipsoïde (hauteur 0). Les tuiles (à l'altitude terrain) sont
    // au-dessus et la repeignent (peintre) ; l'océan ne comble que pôles/gaps.
    geo.scale(r.x, r.y, r.z)
    // Peint en premier (sous toutes les tuiles), au-dessus des étoiles, sans depth test.
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.oceanColor),
      side: THREE.FrontSide,
      depthTest: false,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = -0.9
    // Jamais touchée par un rayon : son volume englobant est la Terre entière, donc TOUS
    // les rayons de la carte la traversent et testaient ses 3 072 triangles — pour un
    // résultat que le repli ellipsoïde de `GlobeControls` et de `Projection` donne déjà,
    // analytiquement. Ce n'est pas une surface, c'est un bouche-trou visuel.
    makeUnraycastable(mesh)
    return mesh
  }

  private disposeTile(t: RasterTile): void {
    if (t.mesh) {
      this.group.remove(t.mesh)
      t.mesh.geometry.dispose()
      const mat = t.mesh.material as THREE.MeshBasicMaterial
      mat.map?.dispose()
      mat.dispose()
      t.mesh = null
    }
    t.img = null
  }

  dispose(): void {
    this.disposed = true
    this.cache.dispose()
    this.ocean.geometry.dispose()
    ;(this.ocean.material as THREE.Material).dispose()
    this.parent.remove(this.group)
  }
}

/** Les deux bornes de la cascade de détail — cf. `lodLevels`. */
export type LodLevels = {
  /** Niveau le plus fin demandé, autour du point visé. */
  finest: number
  /**
   * Premier niveau (≤ `finest`) qui couvre TOUTE la vue dans le budget ; il est demandé en
   * plein, sur l'emprise. Vaut `baseZoom` quand aucun ne tient.
   *
   * ⚠️ Il ne clôt PAS la cascade : les anneaux descendent jusqu'au niveau de base. Ce
   * niveau n'est demandé que sur `bounds`, or `bounds` s'arrête avant l'horizon (les
   * raycasts d'emprise rasent l'ellipsoïde) — s'y fier laissait le lointain au seul
   * niveau de base, dont un texel étiré couvre des centaines de kilomètres.
   */
  covering: number
}

/**
 * Bornes de la cascade de détail pour une vue.
 *
 * Fonction PURE, hors du calque, parce que c'est la règle qui décide de ce qu'on voit au
 * loin : un aplat uniforme ou une dégradation progressive. Elle se teste seule.
 *
 * Les niveaux de `finest` au niveau de base sont demandés en ANNEAU autour du point visé —
 * chacun porte deux fois plus loin que le précédent ; le niveau `covering`, lui, est en
 * outre demandé en plein sur l'emprise. Deux entiers suffisent à décrire ce plan : en
 * rendre la liste allouerait un tableau et ses objets à chaque frame.
 */
export function lodLevels(
  bounds: Bounds,
  zoom: number,
  cfg: Pick<TilesConfig, 'baseZoom' | 'maxZoom' | 'margin' | 'maxRequest'>,
): LodLevels {
  const finest = clamp(Math.round(zoom), cfg.baseZoom, cfg.maxZoom)
  let covering = finest
  while (covering > cfg.baseZoom && tileCount(bounds, covering, cfg.margin) > cfg.maxRequest) covering--
  return { finest, covering }
}

/** Nombre de tuiles couvrant `bounds` au zoom `z` (marge incluse), borné au globe. */
function tileCount(b: Bounds, z: number, margin: number): number {
  const { x0, x1, y0, y1 } = tileRange(b, z, margin, lngToTileX, latToTileY)
  return Math.max(0, x1 - x0 + 1) * Math.max(0, y1 - y0 + 1)
}

/**
 * Charge une image, ou `null` en cas d'échec.
 *
 * `signal` interrompt le téléchargement d'une tuile qui n'intéresse plus personne : une
 * `<img>` ne s'annule pas autrement qu'en lui retirant sa source, ce qui suffit à faire
 * abandonner la requête au navigateur.
 */
function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const onAbort = () => {
      img.src = ''
      resolve(null)
    }
    const done = (value: HTMLImageElement | null) => {
      signal?.removeEventListener('abort', onAbort)
      resolve(value)
    }
    img.crossOrigin = 'anonymous'
    img.onload = () => done(img)
    img.onerror = () => done(null)
    signal?.addEventListener('abort', onAbort, { once: true })
    img.src = url
  })
}
