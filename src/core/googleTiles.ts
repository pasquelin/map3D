// Accès direct à l'API Google Map Tiles 2D (createSession + /2dtiles/{z}/{x}/{y}).
// NB EEA : seuls roadmap/trafic sont servis (satellite/hybride/3D bloqués).

import { DEG2RAD, RAD2DEG } from './math'

export const TILE_SIZE = 256

/** lng (deg) → coordonnée de tuile X (Web Mercator) au zoom `z`. */
export function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z
}

/** lat (deg) → coordonnée de tuile Y (Web Mercator) au zoom `z`. */
export function latToTileY(lat: number, z: number): number {
  const r = lat * DEG2RAD
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

/** Bord ouest (lng) d'une colonne de tuile. */
export function tileXToLng(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180
}

/** Bord nord (lat) d'une ligne de tuile. */
export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return RAD2DEG * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

/**
 * Session + URLs de tuiles Google 2D. La session (token lié à mapType/layers) est
 * (re)créée à la demande et réutilisée tant que la signature ne change pas.
 */
export class GoogleTileSource {
  private session: string | null = null
  private sessionTraffic = false
  private pending: Promise<string> | null = null

  constructor(private readonly apiKey: string) {}

  /** Garantit une session valide pour le plan (+ trafic optionnel) ; renvoie le token. */
  async ensureSession(traffic: boolean): Promise<string> {
    if (this.session && this.sessionTraffic === traffic) return this.session
    // Coalesce les créations concurrentes de même type (plan / plan+trafic).
    if (this.pending && this.sessionTraffic === traffic) return this.pending
    this.sessionTraffic = traffic
    this.pending = (async () => {
      const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mapType: 'roadmap',
          language: 'fr-FR',
          region: 'FR',
          ...(traffic ? { layerTypes: ['layerTraffic'] } : {}),
        }),
      })
      if (!res.ok) throw new Error(`Google createSession ${res.status}`)
      const body = (await res.json()) as { session: string }
      this.session = body.session
      return body.session
    })()
    return this.pending
  }

  /** URL d'une tuile (session doit être établie). */
  tileUrl(z: number, x: number, y: number): string {
    return `https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${this.session}&key=${this.apiKey}`
  }
}
