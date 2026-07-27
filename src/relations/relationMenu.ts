// Descripteur du menu de la feature. Il ne rend RIEN : il produit des `MenuItem`
// consommés par le `ContextMenu` existant — aucun composant de menu spécifique
// n'est créé pour les relations.
//
// Tous les compteurs affichés proviennent de `selectTargets`, exactement l'appel
// que fera le calcul réel. Un second chemin d'estimation finirait par annoncer un
// nombre de liens que la carte ne trace pas.

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
}

/** Presets du bloc « les plus rapides » — nombre de liens conservés au final. */
const FASTEST_PRESETS: readonly number[] = [3, 5, 10]
/** Presets du bloc « dans un rayon » (mètres). */
const RADIUS_PRESETS: readonly number[] = [500, 1000, 3000]

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
  const count = selectTargets(ctx.source, derived, ctx.candidates).length
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
    ...(isDefault ? { icon: '✓' } : {}),
    onSelect: () => ctx.onRun(derived),
  }
}

/** Presets d'une famille de tags (niveau 3). */
function presetsFor(rule: RelationRule, ctx: RelationMenuContext): MenuItem[] {
  const { relations } = ctx.labels
  const distance = makeDistanceFormatter(ctx.labels.measure)
  const items: MenuItem[] = [heading(relations.fastestGroup)]
  for (const count of FASTEST_PRESETS) {
    const isDefault = rule.selection.mode === 'fastest' && rule.selection.count === count
    items.push(presetItem(formatLabel(relations.fastest, { count }), withFastest(rule, count), ctx, isDefault))
  }
  items.push({ separator: true }, heading(relations.radiusGroup))
  for (const meters of RADIUS_PRESETS) {
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
