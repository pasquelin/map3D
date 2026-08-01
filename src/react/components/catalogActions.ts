import type { CatalogAction, CatalogSource } from '../../catalog/types'

/** Sources déjà averties d'un débordement d'actions — un avertissement par source, pas par render. */
const warned = new Set<string>()

/** Rendu partagé : une source sans action n'alloue pas un tableau vide par ligne. */
const NO_ACTIONS: readonly CatalogAction[] = []

/**
 * Actions rendues en ligne, plafonnées.
 *
 * Au-delà du plafond, c'est le NOM qui disparaît — déjà tronqué par construction. On
 * tronque donc la liste d'actions, mais en le DISANT : une action silencieusement
 * absente est un bug qu'on ne trouve qu'en production.
 *
 * Pas de garde `import.meta.env.DEV` : la lib est publiée en ESM **et** en CJS, où
 * `import.meta` n'existe pas. Un avertissement unique par source ne pollue rien.
 *
 * Hors du composant de ligne : c'est une propriété de la SOURCE. Appelée par ligne, elle
 * était recalculée autant de fois qu'il y a de lignes visibles, à chaque frame de
 * défilement, pour une valeur identique partout.
 */
export function inlineActions(source: CatalogSource, max: number): readonly CatalogAction[] {
  const all = source.actions
  if (!all || all.length === 0) return NO_ACTIONS
  if (all.length <= max) return all
  if (!warned.has(source.id)) {
    warned.add(source.id)
    console.warn(
      `[map3d] catalogue « ${source.id} » : ${all.length} actions déclarées, ${max} rendues ` +
        `(config.catalog.maxInlineActions). Les suivantes sont ignorées.`,
    )
  }
  return all.slice(0, max)
}
