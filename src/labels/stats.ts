// Formatage du panneau de diagnostic — module PUR, comme `readout.ts` : il ne dépend que
// des libellés, ni de three ni de React. C'est ce qui le rend testable sans monter de
// carte, et réutilisable par un hôte qui préfère afficher ces valeurs ailleurs.

import type { StatField } from '../core/viewStats'
import type { ReadoutField } from './readout'
import { formatLabel } from './mergeLabels'
import type { MapLabels } from './types'

/** Les grandeurs du panneau, mises en forme et prêtes à écrire dans le DOM. */
export type StatFormatter = {
  /** Nombre entier d'éléments, avec séparateurs de milliers. */
  count: (value: number) => string
  /** Ratio 0…1 rendu en pourcentage. */
  percent: (ratio: number) => string
  /** Octets, en unité lisible (cf. `labels.stats.byteUnits`). */
  bytes: (value: number) => string
  /** Facteur d'échelle — deux décimales, largeur stable. */
  scale: (value: number) => string
  /** La bonne mise en forme pour cette grandeur, quelle qu'elle soit. */
  field: (field: StatField, value: number) => string
}

/**
 * Grandeurs exprimées en octets. Table plutôt que test sur le nom : un champ ajouté
 * demain doit être classé sciemment, pas attrapé par une correspondance de chaîne qui
 * marcherait par accident.
 */
const BYTE_FIELDS = new Set<StatField>(['tileBytes'])

/** Grandeurs qui sont des ratios 0…1, à rendre en pourcentage. */
const RATIO_FIELDS = new Set<StatField>(['paintedRatio'])

/** Grandeurs à décimales — un compte n'en a pas, un facteur d'échelle si. */
const SCALE_FIELDS = new Set<StatField>(['resolutionScale', 'fps'])

/**
 * Formateurs du panneau. À construire UNE fois par jeu de libellés : `Intl.NumberFormat`
 * coûte cher à créer, et le panneau se rafraîchit en boucle tant qu'il est ouvert.
 */
export function makeStatFormatter(labels: MapLabels): StatFormatter {
  const { percentFormat, byteUnits } = labels.stats
  // La locale des NOMBRES suit celle des mesures, pas celle des coordonnées : un compte de
  // markers se lit comme une distance (séparateurs de la langue), pas comme une valeur
  // qu'on recopierait dans une requête. Cf. le JSDoc de `readout.numberLocale`.
  const raw = labels.measure.numberLocale
  const locale = raw === 'auto' ? undefined : raw

  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  // Minimum ET maximum : sans le minimum, une décimale nulle disparaît, la largeur du
  // nombre change, et la ligne tressaute à chaque rafraîchissement.
  const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const twoDecimals = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const count = (value: number): string => (Number.isFinite(value) ? integer.format(value) : '—')

  const percent = (ratio: number): string =>
    Number.isFinite(ratio) ? formatLabel(percentFormat, { value: integer.format(ratio * 100) }) : '—'

  const bytes = (value: number): string => {
    if (!Number.isFinite(value)) return '—'
    let n = value
    let unit = 0
    // S'arrête à la dernière unité fournie : un hôte qui n'en déclare que deux verra des
    // milliers de Ko plutôt qu'une unité inventée.
    while (n >= 1024 && unit < byteUnits.length - 1) {
      n /= 1024
      unit++
    }
    // Les octets bruts n'ont pas de décimale ; au-delà, une seule suffit à situer.
    return `${unit === 0 ? integer.format(n) : decimal.format(n)} ${byteUnits[unit] ?? ''}`.trim()
  }

  const scale = (value: number): string => (Number.isFinite(value) ? twoDecimals.format(value) : '—')

  return {
    count,
    percent,
    bytes,
    scale,
    field: (field, value) => {
      if (BYTE_FIELDS.has(field)) return bytes(value)
      if (RATIO_FIELDS.has(field)) return percent(value)
      if (SCALE_FIELDS.has(field)) return field === 'fps' ? decimal.format(value) : scale(value)
      return count(value)
    },
  }
}

/**
 * Grandeurs nommées par `readout` et non par `stats` — SOURCE UNIQUE.
 *
 * Le panneau ne redit pas la caméra : `readout` la nommait déjà, et deux libellés pour une
 * même grandeur se traduiraient tôt ou tard différemment. Cette liste est aussi ce qui
 * répartit les cellules entre les deux couches (cf. `<StatsPanel>`) — la dupliquer là-bas
 * ferait qu'un champ ajouté d'un côté partirait silencieusement à la mauvaise couche.
 */
const CAMERA_FIELDS: ReadonlySet<StatField> = new Set<ReadoutField>([
  'latitude',
  'longitude',
  'altitude',
  'zoom',
  'heading',
  'tilt',
])

/** Cette grandeur est-elle nommée et calculée par le bloc de lecture ? */
export function isCameraField(field: StatField): field is ReadoutField {
  return CAMERA_FIELDS.has(field)
}

/**
 * Nom affiché d'une grandeur.
 *
 * Aucun cast : le prédicat suffit à départager les deux arbres de libellés, et c'est ce qui
 * fait qu'une clé renommée casse à la COMPILATION plutôt que de retomber en silence sur
 * l'identifiant brut.
 */
export function statLabel(labels: MapLabels, field: StatField): string {
  return isCameraField(field) ? labels.readout[field] : labels.stats[field]
}
