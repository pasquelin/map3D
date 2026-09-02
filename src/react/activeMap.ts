import type { MapEngine } from '../core/MapEngine'

/**
 * Carte « active » : celle qui répond aux raccourcis clavier globaux.
 *
 * Les raccourcis (outils de dessin, Suppr, Échap, plein écran, loupe…) écoutent
 * `window`, pas la carte : avec deux `<Map>` sur la même page, Suppr effaçait la
 * sélection des deux, une lettre d'outil armait le dessin des deux, `f` demandait
 * le plein écran deux fois. Ce registre désigne la carte qui a reçu le dernier
 * geste (`pointerdown` ou `focusin` dans son `.m3d-root`) ; les gestionnaires
 * globaux lui demandent `isActiveMap(engine)` avant d'agir.
 *
 * Règle capitale : **une carte seule est toujours active**, sans clic préalable —
 * le cas courant ne change pas d'un iota. La première montée est active par défaut,
 * et au démontage de l'active la première restante prend le relais.
 *
 * État de MODULE (pas de contexte React) : le registre doit être partagé entre
 * arbres React distincts, ou entre une carte sous `MapProvider` et une autre sans.
 */
const mounted: MapEngine[] = []
let active: MapEngine | null = null

/**
 * Enregistre une carte et branche sa détection d'activité sur `root`.
 * Retourne la fonction de retrait (à appeler au démontage).
 */
export const registerActiveMap = (engine: MapEngine, root: HTMLElement): (() => void) => {
  mounted.push(engine)
  if (active === null) active = engine
  const activate = () => {
    active = engine
  }
  // En CAPTURE : un composant de la carte peut stopper la propagation (menus, champs),
  // la détection ne doit pas en dépendre.
  root.addEventListener('pointerdown', activate, true)
  root.addEventListener('focusin', activate, true)
  return () => {
    root.removeEventListener('pointerdown', activate, true)
    root.removeEventListener('focusin', activate, true)
    const i = mounted.indexOf(engine)
    if (i >= 0) mounted.splice(i, 1)
    if (active === engine) active = mounted[0] ?? null
  }
}

/**
 * La carte doit-elle réagir à un raccourci global ? Lue à l'ÉVÉNEMENT, jamais capturée.
 * Une carte seule (ou un moteur hors registre : tests, usage sans React) est toujours active.
 */
export const isActiveMap = (engine: MapEngine): boolean => mounted.length <= 1 || active === engine
