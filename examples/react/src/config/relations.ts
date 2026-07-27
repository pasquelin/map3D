import type { RelationRule } from 'map3d'

/** Plafonds communs aux quatre règles : ce qui varie d'une règle à l'autre, c'est `selection`. */
const LIMIT = { compute: 15, render: 10 }

/* ══════════════════ RELATIONS — le SEUL endroit où vit le métier ══════════════════
   Le moteur de relations ne connaît que des tags, des couleurs et des libellés :
   « alerte », « agent » et « user » n'apparaissent que dans cette configuration,
   jamais dans la lib. */
export const RELATION_RULES: RelationRule[] = [
  {
    id: 'alert-to-agents',
    label: 'Agents',
    from: { any: ['alert'] },
    // Un agent déjà sur place n'est pas un renfort mobilisable.
    to: { any: ['user'], none: ['onsite'] },
    mode: 'DRIVE',
    selection: { mode: 'fastest', count: 3, maxMeters: 15000 },
    limit: LIMIT,
  },
  {
    id: 'agent-to-alerts',
    label: 'Alertes',
    from: { any: ['user'] },
    to: { any: ['alert'] },
    // `color` volontairement omis : démontre la couleur par défaut de
    // `<RelationLayer defaultColor>`.
    mode: 'DRIVE',
    selection: { mode: 'fastest', count: 3, maxMeters: 15000 },
    limit: LIMIT,
  },
  {
    id: 'agent-to-agents',
    label: 'Autres agents',
    from: { any: ['user'] },
    // La source est toujours exclue de ses propres cibles par `selectTargets`.
    to: { any: ['user'] },
    mode: 'DRIVE',
    selection: { mode: 'fastest', count: 3, maxMeters: 15000 },
    limit: LIMIT,
  },
  {
    id: 'agent-to-critical',
    label: 'Alertes critiques',
    from: { any: ['user'] },
    to: { all: ['alert', 'critical'] },
    mode: 'DRIVE',
    selection: { mode: 'radius', radiusMeters: 3000, maxMeters: 15000 },
    limit: LIMIT,
  },
]
