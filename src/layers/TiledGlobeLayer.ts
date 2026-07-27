import * as THREE from 'three'
import type { Ellipsoid } from '3d-tiles-renderer'
import { defaultConfig } from '../config/defaultConfig'
import type { TilesConfig } from '../config/types'
import { GoogleTileSource, latToTileY, lngToTileX, tileXToLng, tileYToLat } from '../core/googleTiles'
import { clamp, DEG2RAD } from '../core/math'
import type { Bounds } from '../shared'

const BASE_Z = 2 // niveau de base (globe entier), toujours chargé → couverture totale
const MAX_Z = 22 // zoom max des tuiles Google roadmap 2D

type TileState = 'queued' | 'loading' | 'ready' | 'error'

interface Tile {
  z: number
  x: number
  y: number
  key: string
  state: TileState
  img: HTMLImageElement | null
  mesh: THREE.Mesh | null
  lastUsed: number
  /** Tentatives de téléchargement déjà consommées. */
  attempts: number
  /** Date (ms) avant laquelle la file n'a pas le droit de relancer cette tuile. */
  retryAt: number
  // Emprise géographique (constante pour la durée de vie de la tuile) — mémoïsée pour
  // éviter de recalculer exp/atan (tileYToLat) à chaque test de vue par frame.
  west: number
  east: number
  north: number
  south: number
}

/** Subdivisions par tuile : les tuiles basses (grandes) sont plus tessellées pour
 *  épouser la courbure ; les hautes (petites) restent légères. */
function segFor(z: number): number {
  if (z <= 1) return 32
  if (z <= 3) return 16
  if (z <= 5) return 8
  if (z <= 8) return 4
  return 2
}

/**
 * Globe 2D tuilé (quadtree) : fond de carte Google drapé sur l'ellipsoïde avec LOD,
 * cache mémoïsé (LRU), file de chargement à concurrence limitée, prefetch et
 * raffinement progressif. Un niveau de base couvre en permanence tout le globe
 * (zéro trou), les tuiles fines sont ajoutées/retirées incrémentalement selon la vue.
 * Aucun rebuild global : le rendu se raffine du flou vers le net sans à-coup.
 */
export class TiledGlobeLayer {
  readonly group = new THREE.Group()
  private readonly ocean: THREE.Mesh
  private readonly tiles = new Map<string, Tile>()
  private readonly queue: Tile[] = []
  private readonly scratch = new THREE.Vector3()
  private elevation = 0
  private inflight = 0
  private frame = 0
  private traffic = false
  private disposed = false

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly ellipsoid: Ellipsoid,
    private readonly source: GoogleTileSource,
    private cfg: TilesConfig = defaultConfig.providers.tiles,
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
    this.ocean = this.buildOcean()
    this.group.add(this.ocean)
    this.parent.add(this.group)
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible
  }

  /**
   * Réglages à chaud. Le cache existant est CONSERVÉ : les budgets ne changent que
   * les prochaines demandes, et l'éviction ramènera d'elle-même la table sous un
   * nouveau plafond plus bas. Un `mapType` ou une langue différents changent en
   * revanche les URLs, donc le cache est vidé — sinon des tuiles de l'ancienne
   * session resteraient affichées.
   */
  setConfig(cfg: TilesConfig): void {
    const prev = this.cfg
    this.cfg = cfg
    this.source.setConfig(cfg)
    const urlChanged =
      prev.mapType !== cfg.mapType ||
      prev.language !== cfg.language ||
      prev.region !== cfg.region ||
      prev.tileUrl !== cfg.tileUrl ||
      prev.sessionUrl !== cfg.sessionUrl
    if (urlChanged) this.clearTiles()
  }

  /**
   * Pose le fond à l'altitude du terrain (mètres au-dessus de l'ellipsoïde), au lieu
   * de 0 : sinon, caméra basse, l'écart sol réel (~35 m à Paris) ↔ ellipsoïde fait
   * paraître la carte bien plus petite que la 3D. L'altitude est intégrée **dans la
   * géométrie** de chaque tuile (getCartographicToPosition) — reconstruction du cache
   * quand elle change significativement (rare : une fois par bascule 2D).
   */
  setElevation(meters: number): void {
    if (Math.abs(meters - this.elevation) < 1) return
    this.elevation = meters
    this.clearTiles()
  }

  /** Active/désactive le calque trafic. Les URLs incluent la session (qui change avec
   *  le trafic) → on repart d'un cache vide. */
  setTraffic(traffic: boolean): void {
    if (traffic === this.traffic) return
    this.traffic = traffic
    this.clearTiles()
  }

  /** État réel du calque — le moteur le lit plutôt que d'en tenir une copie. */
  get trafficOn(): boolean {
    return this.traffic
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
  update(bounds: Bounds, zoom: number, refine = true): void {
    if (this.disposed) return
    this.frame++

    // Tuiles désirées : base (globe entier) + niveau cible (emprise vue + marge). Si le
    // niveau cible dépasse le budget de tuiles, on RÉDUIT le zoom pour tenir (jamais rien
    // sauter → il y a toujours quelque chose de plus net que la base).
    this.requestLevel(BASE_Z, { west: -180, east: 180, north: 85, south: -85 }, 0)
    let targetZ = clamp(Math.round(zoom), BASE_Z, MAX_Z)
    while (targetZ > BASE_Z && tileCount(bounds, targetZ, this.cfg.margin) > this.cfg.maxRequest) targetZ--
    if (refine && targetZ > BASE_Z) this.requestLevel(targetZ, bounds, this.cfg.margin)

    // Rendu : toute tuile prête qui intersecte la vue (base incluse), la plus fine
    // au-dessus (renderOrder + polygonOffset par zoom).
    for (const t of this.tiles.values()) {
      const inView = t.z === BASE_Z || this.intersectsView(t, bounds)
      if (t.state === 'ready' && inView) {
        if (!t.mesh) this.buildMesh(t)
        t.mesh!.visible = true
        t.lastUsed = this.frame
      } else if (t.mesh) {
        t.mesh.visible = false
      }
    }

    this.pump()
    this.evict()
  }

  /** Garantit la présence (dans le cache/file) des tuiles couvrant `bounds` au zoom `z`. */
  private requestLevel(z: number, bounds: Bounds, margin: number): void {
    const { x0, x1, y0, y1 } = tileRange(bounds, z, margin)
    if (x1 < x0 || y1 < y0) return
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) this.ensureTile(z, x, y)
    }
  }

  private ensureTile(z: number, x: number, y: number): void {
    const key = `${z}/${x}/${y}`
    let t = this.tiles.get(key)
    if (!t) {
      t = {
        z, x, y, key, state: 'queued', img: null, mesh: null, lastUsed: this.frame,
        attempts: 0, retryAt: 0,
        west: tileXToLng(x, z), east: tileXToLng(x + 1, z),
        north: tileYToLat(y, z), south: tileYToLat(y + 1, z),
      }
      this.tiles.set(key, t)
      this.queue.push(t)
    }
    t.lastUsed = this.frame
  }

  /** Lance des chargements tant qu'il reste des créneaux de concurrence. */
  private pump(): void {
    const now = Date.now()
    // `skipped` fait avancer la boucle quand la tête de file est en attente de
    // réessai : la tuile repart en queue, la longueur ne bouge pas — sans ce
    // compteur, une file entièrement en backoff tournerait à l'infini.
    let skipped = 0
    while (this.inflight < this.cfg.maxInflight && this.queue.length > skipped) {
      const t = this.queue.shift()!
      if (t.state !== 'queued' || !this.tiles.has(t.key)) continue
      if (t.retryAt > now) {
        this.queue.push(t)
        skipped++
        continue
      }
      void this.load(t)
    }
  }

  private async load(t: Tile): Promise<void> {
    t.state = 'loading'
    t.attempts++
    this.inflight++
    try {
      await this.source.ensureSession(this.traffic) // mémoïsé/coalescé
      if (this.disposed || !this.tiles.has(t.key)) return
      const img = await loadImage(this.source.tileUrl(t.z, t.x, t.y))
      if (this.disposed || !this.tiles.has(t.key)) return
      if (img) {
        t.img = img
        t.state = 'ready'
      } else {
        this.retryOrFail(t)
      }
    } catch {
      this.retryOrFail(t)
    } finally {
      this.inflight--
      if (!this.disposed) this.pump()
    }
  }

  /**
   * Replanifie une tuile en échec, ou l'abandonne au bout de `MAX_ATTEMPTS`.
   *
   * `<img>` ne donne pas le code HTTP : un 429 (quota, temporaire) est
   * indistinguable d'un 404 (tuile inexistante, définitif). On réessaie donc
   * quelques fois avec du recul — sans quoi un simple dépassement de quota laissait
   * des trous DÉFINITIFS dans la carte, la tuile n'étant jamais redemandée.
   */
  private retryOrFail(t: Tile): void {
    if (t.attempts >= this.cfg.maxAttempts) {
      t.state = 'error'
      return
    }
    t.state = 'queued'
    const delays = this.cfg.retryDelays
    // Dernier délai reconduit au-delà de la liste ; liste vide = réessai immédiat.
    t.retryAt = Date.now() + (delays[t.attempts - 1] ?? delays.at(-1) ?? 0)
    this.queue.push(t)
  }

  /** Construit la géométrie (grille projetée sur l'ellipsoïde) + texture d'une tuile. */
  private buildMesh(t: Tile): void {
    const seg = segFor(t.z)
    const positions: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    for (let iy = 0; iy <= seg; iy++) {
      for (let ix = 0; ix <= seg; ix++) {
        const fx = ix / seg
        const fy = iy / seg
        // Mercator : lng linéaire en X, lat non-linéaire en Y (interpole en espace tuile).
        const lng = tileXToLng(t.x + fx, t.z)
        const lat = tileYToLat(t.y + fy, t.z)
        this.ellipsoid.getCartographicToPosition(lat * DEG2RAD, lng * DEG2RAD, this.elevation, this.scratch)
        positions.push(this.scratch.x, this.scratch.y, this.scratch.z)
        uvs.push(fx, fy)
      }
    }
    const row = seg + 1
    for (let iy = 0; iy < seg; iy++) {
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
    mesh.renderOrder = -0.8 + t.z * 0.005
    t.mesh = mesh
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
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.oceanColor), side: THREE.FrontSide, depthTest: false, depthWrite: false })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = -0.9
    return mesh
  }

  private intersectsView(t: Tile, b: Bounds): boolean {
    return !(t.east < b.west || t.west > b.east || t.south > b.north || t.north < b.south)
  }

  /** Éviction LRU au-delà du plafond (protège le niveau de base et les tuiles vues).
   *  L'alloc + tri de tout le cache ne tourne qu'une frame sur 10 en régime normal (pas
   *  de O(n log n) chaque frame pendant un pan soutenu au plafond), MAIS on force
   *  l'éviction dès qu'on déborde franchement → pic mémoire (textures GPU) borné. */
  private evict(): void {
    if (this.tiles.size <= this.cfg.maxTiles) return
    if (this.frame % 10 !== 0 && this.tiles.size < this.cfg.maxTiles + 200) return
    const candidates = [...this.tiles.values()]
      .filter((t) => t.z !== BASE_Z && t.lastUsed !== this.frame)
      .sort((a, b) => a.lastUsed - b.lastUsed)
    let over = this.tiles.size - this.cfg.maxTiles
    for (const t of candidates) {
      if (over <= 0) break
      this.disposeTile(t)
      this.tiles.delete(t.key)
      over--
    }
  }

  private disposeTile(t: Tile): void {
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

  private clearTiles(): void {
    for (const t of this.tiles.values()) this.disposeTile(t)
    this.tiles.clear()
    this.queue.length = 0
  }

  dispose(): void {
    this.disposed = true
    this.clearTiles()
    this.ocean.geometry.dispose()
    ;(this.ocean.material as THREE.Material).dispose()
    this.parent.remove(this.group)
  }
}

/** Plage de tuiles (indices min/max, marge incluse) couvrant `bounds` au zoom `z`, bornée au globe. */
function tileRange(b: Bounds, z: number, margin: number): { x0: number; x1: number; y0: number; y1: number } {
  const n = 2 ** z
  return {
    x0: Math.max(0, Math.floor(lngToTileX(b.west, z)) - margin),
    x1: Math.min(n - 1, Math.floor(lngToTileX(b.east, z)) + margin),
    y0: Math.max(0, Math.floor(latToTileY(b.north, z)) - margin),
    y1: Math.min(n - 1, Math.floor(latToTileY(b.south, z)) + margin),
  }
}

/** Nombre de tuiles couvrant `bounds` au zoom `z` (marge incluse), borné au globe. */
function tileCount(b: Bounds, z: number, margin: number): number {
  const { x0, x1, y0, y1 } = tileRange(b, z, margin)
  return Math.max(0, x1 - x0 + 1) * Math.max(0, y1 - y0 + 1)
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}
