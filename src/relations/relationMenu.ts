// Descripteur du menu de la feature. Il ne rend RIEN : il produit des `MenuItem`
// consommés par le `ContextMenu` existant — aucun composant de menu spécifique
// n'est créé pour les relations.
//
// Tous les compteurs affichés proviennent de `selectTargets`, exactement l'appel
// que fera le calcul réel. Un second chemin d'estimation finirait par annoncer un
// nombre de liens que la carte ne trace pas.

import { defaultConfig } from '../config/defaultConfig'
import type { RoutingPresets } from '../config/types'
import { formatLabel } from '../labels/mergeLabels'
import { makeDistanceFormatter } from '../labels/measure'
import type { MapLabels } from '../labels/types'
import type { MenuItem } from '../react/components/ContextMenu'
import { matchesSelector, selectTargets } from './core/selection'
import type { MapPoint, RelationRule } from './core/types'

export type RelationMenuContext = {
  source: MapPoint
  /** Voisinage interrogeable — clusters inclus, résolu par l'appelant. */
  candidates: readonly MapPoint[]
  rules: readonly RelationRule[]
  labels: MapLabels
  /**
   * Couleur de la pastille d'une famille. Résolue par l'appelant : une règle sans
   * couleur prend celle du marker SOURCE, que ce module n'a aucun moyen de connaître.
   * Omise, la pastille retombe sur la couleur déclarée par la règle.
   */
  colorOf?: (rule: RelationRule) => string | undefined
  /** Reçoit la règle DÉRIVÉE (preset appliqué), prête à être exécutée. */
  onRun: (rule: RelationRule) => void
  /** Paliers proposés — défauts de la lib si absent. */
  presets?: RelationMenuPresets
  /**
   * Sur-échantillonnage employé par le calcul réel — **doit** être celui de la carte.
   *
   * Le préambule de ce fichier promet que « tous les compteurs affichés proviennent de
   * `selectTargets`, exactement l'appel que fera le calcul réel ». La promesse était
   * tenue à un argument près : `presetItem` omettait celui-ci et comptait donc avec le
   * défaut, quand le moteur comptait avec la valeur réglée. Dès qu'elles différaient,
   * l'avertissement « sélection trop large » — le seul garde-fou de coût visible par
   * l'utilisateur — se déclenchait au mauvais seuil.
   */
  fastestOversample?: number
}

/**
 * Presets proposés par le menu d'une famille. Ce sont des choix MÉTIER — « les 3 plus
 * proches » n'a pas le même sens pour une flotte de camions que pour des capteurs
 * dans un bâtiment — d'où leur surcharge possible par `<Map relations={{ menu }}>`.
 *
 * Les paliers vivent dans `providers.routing.presets` : ce sont des valeurs à impact
 * facturation (un palier « 10 » à un sur-échantillonnage de 3 fait 30 origines en un
 * clic), donc leur place est avec le reste des réglages du fournisseur.
 *
 * Le type local et la constante `DEFAULT_RELATION_PRESETS` qui vivaient ici en
 * étaient un second exemplaire, exporté publiquement et libre de diverger.
 */
export type RelationMenuPresets = RoutingPresets

const withFastest = (rule: RelationRule, count: number): RelationRule => ({
  ...rule,
  selection: { ...rule.selection, mode: 'fastest', count },
})

const withRadius = (rule: RelationRule, radiusMeters: number): RelationRule => ({
  ...rule,
  // Le rayon ne peut jamais dépasser le garde-fou de coût de la règle.
  selection: {
    ...rule.selection,
    mode: 'radius',
    radiusMeters: Math.min(radiusMeters, rule.selection.maxMeters),
  },
})

/** En-tête de bloc : un item inerte, le seul mécanisme de titrage du menu. */
const heading = (label: string): MenuItem => ({ label, disabled: true })

/**
 * Construit un item de preset. Le `hint` est le résultat de la sélection RÉELLE :
 * c'est ce qui garantit que le menu et la carte comptent la même chose.
 */
function presetItem(
  label: string,
  derived: RelationRule,
  ctx: RelationMenuContext,
  isDefault: boolean,
): MenuItem {
  const count = selectTargets(ctx.source, derived, ctx.candidates, ctx.fastestOversample).length
  const { relations } = ctx.labels
  if (count === 0) return { label, hint: relations.noTargets, disabled: true }
  const hint =
    count > derived.limit.compute
      ? formatLabel(relations.tooWide, { count })
      : formatLabel(relations.targetCount, { count })
  return {
    label,
    hint,
    // Le preset par défaut de la règle est marqué, pas présélectionné : rien ne
    // part tant que l'utilisateur n'a pas cliqué.
    ...(isDefault ? { icon: ctx.labels.glyphs.check } : {}),
    onSelect: () => ctx.onRun(derived),
  }
}

/** Presets d'une famille de tags (niveau 3). */
function presetsFor(rule: RelationRule, ctx: RelationMenuContext): MenuItem[] {
  const { relations } = ctx.labels
  const presets = ctx.presets ?? defaultConfig.providers.routing.presets
  const distance = makeDistanceFormatter(ctx.labels.measure)
  const items: MenuItem[] = [heading(relations.fastestGroup)]
  for (const count of presets.fastest) {
    const isDefault = rule.selection.mode === 'fastest' && rule.selection.count === count
    items.push(presetItem(formatLabel(relations.fastest, { count }), withFastest(rule, count), ctx, isDefault))
  }
  items.push({ separator: true }, heading(relations.radiusGroup))
  for (const meters of presets.radius) {
    const isDefault = rule.selection.mode === 'radius' && rule.selection.radiusMeters === meters
    const label = formatLabel(relations.radius, { radius: distance(meters) })
    items.push(presetItem(label, withRadius(rule, meters), ctx, isDefault))
  }
  return items
}

/**
 * Entrées à greffer dans le menu contextuel d'un marker. Renvoie un tableau vide
 * quand aucune règle ne s'applique à la source — l'appelant concatène sans test.
 *
 * Les familles de tags sont posées au PREMIER niveau, sous un simple titre de
 * section. Les regrouper derrière une entrée « Distance autour › » ajoutait un cran
 * à ouvrir avant de voir quoi que ce soit — un niveau qui ne servait qu'à nommer, ce
 * qu'un titre fait sans coûter un geste.
 *
 * Les sous-niveaux restent des FONCTIONS : rien n'est calculé tant que l'utilisateur
 * n'a pas ouvert le niveau, et donc rien ne peut partir en réseau au survol.
 */
export function buildRelationMenu(ctx: RelationMenuContext): MenuItem[] {
  const applicable = ctx.rules.filter((r) => matchesSelector(ctx.source.tags, r.from))
  if (applicable.length === 0) return []
  return [
    heading(ctx.labels.relations.menuRoot),
    ...applicable.map((rule) => ({
      label: rule.label,
      swatch: ctx.colorOf ? ctx.colorOf(rule) : rule.color,
      children: () => presetsFor(rule, ctx),
    })),
  ]
}
