// Accès direct à l'API Google Map Tiles 2D (createSession + /2dtiles/{z}/{x}/{y}).
// NB EEA : seuls roadmap/trafic sont servis (satellite/hybride/3D bloqués).

import { defaultConfig } from '../config/defaultConfig'
import { resolveLocale, resolveRegion } from '../config/mergeConfig'
import type { TilesConfig } from '../config/types'
import { fetchWithPolicy, HttpError } from './fetchPolicy'
import { DEG2RAD, RAD2DEG, TILE_SIZE } from './math'
import { TileDeferred } from './TileQueue'


/** Ré-export : `math` en est la source (cf. `metersPerPixelAtZoom`). */
export { TILE_SIZE }

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

/**
 * Session + URLs de tuiles Google 2D. La session (token lié à mapType/layers) est
 * (re)créée à la demande et réutilisée tant que la signature ne change pas.
 *
 * Langue, région, type de fond, endpoints et backoffs viennent de
 * `config.providers.tiles` : ils étaient codés en dur, ce qui figeait la carte sur
 * `fr-FR`/`FR` et interdisait tout proxy d'entreprise.
 */
export class GoogleTileSource {
  /** Le calque trafic est un service Google : la source interne, elle, ne l'a pas. */
  readonly supportsTraffic = true

  /**
   * Promesse résolue partagée, renvoyée quand la session est déjà là. `ensureSession`
   * est appelé UNE FOIS PAR TUILE : allouer une promesse par tuile pour n'attendre rien
   * serait payé à chaque vague de chargement.
   */
  private static readonly READY = Promise.resolve()

  private session: string | null = null
  /** Signature de la session ÉTABLIE — mise à jour au succès seulement (cf. `ensureSession`). */
  private sessionTraffic = false
  private pending: Promise<void> | null = null
  /** Signature de la création en cours, distincte de celle de la session établie. */
  private pendingTraffic = false
  /** Instant (ms) avant lequel toute nouvelle tentative est refusée — cf. `backoffAuthMs`. */
  private retryAt = 0
  /**
   * Le gabarit porte-t-il déjà `{session}`/`{key}` ? Un proxy qui signe lui-même les
   * requêtes les place où il veut ; sinon on les ajoute en query. Résolu une fois par
   * changement de gabarit et non par tuile — `tileUrl` est appelé jusqu'à `maxRequest`
   * fois par changement de niveau de zoom.
   */
  private signsItself = false

  constructor(
    private readonly apiKey: string,
    /** Réglages de tuiles ; `defaultConfig` si le moteur n'en fournit pas. */
    private cfg: TilesConfig = defaultConfig.providers.tiles,
  ) {
    this.signsItself = cfg.tileUrl.includes('{session}') || cfg.tileUrl.includes('{key}')
  }

  /** Réglages à chaud (cf. `MapEngine.setConfig`). La session en cours reste valide. */
  setConfig(cfg: TilesConfig): void {
    this.cfg = cfg
    this.signsItself = cfg.tileUrl.includes('{session}') || cfg.tileUrl.includes('{key}')
  }

  /**
   * Garantit une session valide pour le plan (+ trafic optionnel). Le token n'est pas
   * renvoyé : il vit dans `this.session`, que `tileUrl` lit — c'est ce qui permet à
   * cette méthode de tenir le contrat `TileSource` commun au fournisseur interne, qui
   * n'a aucun token à produire.
   *
   * Volontairement NON `async` : les deux sorties rapides (session déjà là, création
   * déjà en vol) doivent rendre une promesse existante plutôt qu'en allouer une.
   */
  ensureSession(traffic: boolean): Promise<void> {
    if (this.session && this.sessionTraffic === traffic) return GoogleTileSource.READY
    // Coalesce les créations concurrentes de même type (plan / plan+trafic).
    if (this.pending && this.pendingTraffic === traffic) return this.pending
    /**
     * Fenêtre de back-off. Le cache d'échec ayant été supprimé (il condamnait le fond
     * de carte pour toute la session), chaque nouvelle vague de tuiles retenterait
     * sinon une création — inutile face à une clé refusée, qui le restera. On borne
     * donc la cadence, sans jamais rendre l'échec définitif.
     */
    if (Date.now() < this.retryAt) {
      // Différé, pas échoué : la file replanifie la tuile à `retryAt` sans lui compter un
      // essai. Un rejet ordinaire lui en brûlait trois en quelques secondes.
      return Promise.reject(new TileDeferred(this.retryAt))
    }

    this.pendingTraffic = traffic
    const p = (async () => {
      const cfg = this.cfg
      const language = resolveLocale(cfg.language)
      const region = resolveRegion(cfg.region)
      let res: Response
      try {
        res = await fetchWithPolicy(
          `${cfg.sessionUrl}?key=${encodeURIComponent(this.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mapType: cfg.mapType,
              // Omis plutôt qu'envoyés vides : sans `region`, Google déduit du contexte
              // d'appel, ce qui vaut mieux qu'un biais choisi à la place de l'hôte.
              ...(language ? { language } : {}),
              ...(region ? { region } : {}),
              ...(traffic && cfg.layerTypes.length ? { layerTypes: [...cfg.layerTypes] } : {}),
            }),
          },
          cfg.fetch,
          undefined,
          'Google createSession',
        )
      } catch (err) {
        // Refus d'identité (clé absente, invalide, API non activée, quota épuisé) :
        // réessayer dans la seconde ne sert à rien. Le reste (5xx, réseau, délai) est
        // présumé transitoire et reprend vite.
        const auth = err instanceof HttpError && AUTH_STATUS.has(err.status)
        this.retryAt = Date.now() + (auth ? cfg.backoffAuthMs : cfg.backoffTransientMs)
        throw err
      }
      const body = (await res.json()) as { session: string }

      this.retryAt = 0
      this.session = body.session
      // Après le succès SEULEMENT : un échec laisserait sinon l'objet prétendre
      // détenir une session du type demandé alors qu'il n'en a aucune, et la
      // session précédente (encore valide) serait considérée périmée.
      this.sessionTraffic = traffic
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
    const base = this.cfg.tileUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
    const session = encodeURIComponent(this.session ?? '')
    const key = encodeURIComponent(this.apiKey)
    if (this.signsItself) return base.replace('{session}', session).replace('{key}', key)
    return `${base}?session=${session}&key=${key}`

  }
}
