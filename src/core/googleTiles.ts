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

/** Statuts qui signalent un refus d'identité — inutile de réessayer vite. */
const AUTH_STATUS = new Set([400, 401, 403, 429])
/** Attente après un refus d'identité (clé invalide, quota) — ms. */
const BACKOFF_AUTH_MS = 5 * 60_000
/** Attente après une panne présumée transitoire (5xx, réseau) — ms. */
const BACKOFF_TRANSIENT_MS = 10_000

/**
 * Session + URLs de tuiles Google 2D. La session (token lié à mapType/layers) est
 * (re)créée à la demande et réutilisée tant que la signature ne change pas.
 */
export class GoogleTileSource {
  private session: string | null = null
  /** Signature de la session ÉTABLIE — mise à jour au succès seulement (cf. `ensureSession`). */
  private sessionTraffic = false
  private pending: Promise<string> | null = null
  /** Signature de la création en cours, distincte de celle de la session établie. */
  private pendingTraffic = false
  /** Instant (ms) avant lequel toute nouvelle tentative est refusée — cf. `BACKOFF_*`. */
  private retryAt = 0

  constructor(private readonly apiKey: string) {}

  /** Garantit une session valide pour le plan (+ trafic optionnel) ; renvoie le token. */
  async ensureSession(traffic: boolean): Promise<string> {
    if (this.session && this.sessionTraffic === traffic) return this.session
    // Coalesce les créations concurrentes de même type (plan / plan+trafic).
    if (this.pending && this.pendingTraffic === traffic) return this.pending
    /**
     * Fenêtre de back-off. Le cache d'échec ayant été supprimé (il condamnait le fond
     * de carte pour toute la session), chaque nouvelle vague de tuiles retenterait
     * sinon une création — inutile face à une clé refusée, qui le restera. On borne
     * donc la cadence, sans jamais rendre l'échec définitif.
     */
    if (Date.now() < this.retryAt) throw new Error('Google createSession: nouvelle tentative différée')
    this.pendingTraffic = traffic
    const p = (async () => {
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
      if (!res.ok) {
        // Refus d'identité (clé absente, invalide, API non activée, quota épuisé) :
        // réessayer dans la seconde ne sert à rien. Le reste (5xx, réseau) est
        // présumé transitoire et reprend vite.
        this.retryAt = Date.now() + (AUTH_STATUS.has(res.status) ? BACKOFF_AUTH_MS : BACKOFF_TRANSIENT_MS)
        throw new Error(`Google createSession ${res.status}`)
      }
      const body = (await res.json()) as { session: string }
      this.retryAt = 0
      this.session = body.session
      // Après le succès SEULEMENT : un échec laisserait sinon l'objet prétendre
      // détenir une session du type demandé alors qu'il n'en a aucune, et la
      // session précédente (encore valide) serait considérée périmée.
      this.sessionTraffic = traffic
      return body.session
    })()
    this.pending = p
    /**
     * Le cache de coalescence ne doit JAMAIS survivre au règlement de la promesse.
     * Mémoriser un REJET condamnerait le fond de carte 2D pour toute la session :
     * chaque appel suivant recevrait la même promesse déjà rejetée, donc toutes les
     * tuiles resteraient en erreur même réseau revenu — seul un rechargement de page
     * réparait. On ne libère que si personne n'a relancé entre-temps.
     *
     * Pas de tempête de requêtes pour autant : les appels concurrents partagent
     * cette promesse, et `TiledGlobeLayer` ne remet pas en file une tuile en erreur.
     */
    const release = () => {
      if (this.pending === p) this.pending = null
    }
    p.then(release, release)
    return p
  }

  /** URL d'une tuile (session doit être établie). */
  tileUrl(z: number, x: number, y: number): string {
    return `https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${this.session}&key=${this.apiKey}`
  }
}
