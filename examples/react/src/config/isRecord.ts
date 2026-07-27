/**
 * Objet simple — ni `null`, ni tableau.
 *
 * Vit ici plutôt que dans `configSchema` ou `draft` parce que les deux en avaient leur
 * PROPRE copie, au caractère près : le parcours de `MapConfig` et la recopie des
 * brouillons Tweakpane posent la même question, elle n'a pas à être écrite deux fois.
 */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
