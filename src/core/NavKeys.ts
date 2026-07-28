// Déplacement au clavier : état des touches maintenues, et l'axe qui en résulte.
//
// À part des raccourcis de la barre (`react/components/shortcuts`), qui sont des
// commandes PONCTUELLES déclenchées au `keydown`. Ici, une touche maintenue produit un
// mouvement CONTINU : l'état vit entre les frames, et c'est la boucle du moteur qui le
// consomme, proportionnellement au temps écoulé. Un `keydown` répété par le système ne
// peut pas rendre ça — la vitesse dépendrait de la configuration clavier de l'utilisateur.
//
// Le module ne connaît ni three.js ni la caméra : il rend un axe, le moteur décide de ce
// qu'il en fait. C'est ce qui permettra au mode vol (cf. `MapEngine.applyKeyNav`) de
// réutiliser exactement les mêmes liaisons avec un autre modèle de déplacement.

import type { NavigateShortcuts } from '../config/types'

/**
 * Vrai si l'événement vient d'un champ de saisie (input, textarea, contenteditable) :
 * aucun raccourci ne doit jamais voler la frappe.
 *
 * Vit ici, dans le cœur, et non dans la couche React : le moteur en a besoin sans
 * dépendre d'elle. `react/components/shortcuts` le ré-exporte pour ses appelants.
 */
export function inTextInput(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

/**
 * Touche « nue » d'un raccourci : la key en minuscules, ou `null` si l'événement ne doit
 * rien déclencher — ⌘/Ctrl/Alt appartiennent au navigateur et aux commandes d'édition, et
 * une saisie en cours ne se fait jamais voler la frappe.
 *
 * Maj n'y figure pas : c'est un modificateur de raccourci légitime (ici l'accélération du
 * déplacement). Unique implémentation de la garde, pour la barre comme pour le clavier de
 * navigation ; `react/components/shortcuts` la ré-exporte.
 */
export function plainKey(e: KeyboardEvent): string | null {
  return e.metaKey || e.ctrlKey || e.altKey || inTextInput(e) ? null : e.key.toLowerCase()
}

/**
 * Touche dont le comportement NATIF est de faire défiler la page — la seule catégorie
 * qu'un déplacement de carte a une raison de consommer. Les clés sont normalisées en
 * minuscules par `plainKey`, d'où le préfixe.
 */
function isArrowKey(key: string): boolean {
  return key.startsWith('arrow')
}

/** Direction demandée, dans le repère de la VUE : +1 = avant / droite. */
export type NavAxis = {
  forward: number
  right: number
  /** Modificateur d'accélération maintenu. */
  boost: boolean
}

const IDLE: NavAxis = { forward: 0, right: 0, boost: false }

/**
 * Axe résultant des touches maintenues. Fonction pure : c'est la table de vérité du
 * déplacement, et elle se teste sans DOM ni caméra.
 *
 * Deux touches opposées maintenues s'annulent — plutôt que de faire gagner la dernière
 * pressée, qui obligerait à retenir un ordre d'appui.
 *
 * `out` est un scratch fourni par l'appelant : ce chemin est parcouru à chaque frame de
 * tout déplacement, et rendre un objet neuf y allouait 60 fois par seconde. Omis (usage
 * de test), un objet est alloué à la volée.
 */
export function navAxis(pressed: ReadonlySet<string>, keys: NavigateShortcuts, out?: NavAxis): NavAxis {
  const forward = anyPressed(pressed, keys.forward) - anyPressed(pressed, keys.backward)
  const right = anyPressed(pressed, keys.right) - anyPressed(pressed, keys.left)
  if (forward === 0 && right === 0) return IDLE
  const boost = anyPressed(pressed, keys.boost) === 1
  if (!out) return { forward, right, boost }
  out.forward = forward
  out.right = right
  out.boost = boost
  return out
}

/**
 * Boucle indexée plutôt que `bound.some((k) => …)` : ce chemin est parcouru à chaque
 * frame, et la fermeture de rappel y était allouée cinq fois — y compris clavier au repos.
 */
function anyPressed(pressed: ReadonlySet<string>, bound: readonly string[]): number {
  for (let i = 0; i < bound.length; i++) if (pressed.has(bound[i]!)) return 1
  return 0
}

/**
 * Suit les touches de navigation maintenues sur `window`.
 *
 * Écoute la fenêtre et non le canvas : ce dernier devrait porter le focus pour recevoir
 * des touches, ce qui obligerait l'utilisateur à cliquer la carte avant de pouvoir s'y
 * déplacer. C'est d'ailleurs la limite du mode vol intégré de `GlobeControls`, qui écoute
 * son `domElement`.
 */
export class NavKeys {
  private readonly pressed = new Set<string>()
  private keys: NavigateShortcuts
  /**
   * Qui demande la coupure, et non un simple booléen.
   *
   * Le déplacement est rendu quand PERSONNE ne le suspend. Un drapeau partagé laissait le
   * dernier appelant décider pour tous : le `<DrawLayer>` démonté rendait les flèches à la
   * caméra alors qu'un autre consommateur — ou l'hôte lui-même — les avait coupées.
   */
  private readonly suspendedBy = new Set<string>()
  /** Scratch de `axis()` : un objet réutilisé, jamais une allocation par frame. */
  private readonly scratch: NavAxis = { forward: 0, right: 0, boost: false }

  constructor(keys: NavigateShortcuts) {
    this.keys = keys
  }

  setConfig(keys: NavigateShortcuts): void {
    this.keys = keys
    // Les anciennes liaisons ne seront jamais relâchées : on repart d'un état neutre,
    // sinon une touche renommée resterait « maintenue » pour toujours.
    this.pressed.clear()
  }

  /**
   * Coupe le suivi pour `owner`, et relâche ce qui était maintenu — sans ce relâchement,
   * une touche enfoncée au moment de la coupure ferait repartir la carte à la
   * réactivation. Le déplacement ne reprend qu'une fois TOUTES les suspensions levées.
   */
  setEnabled(enabled: boolean, owner: string): void {
    const had = this.suspendedBy.size !== 0
    if (enabled) this.suspendedBy.delete(owner)
    else this.suspendedBy.add(owner)
    if (!had && this.suspendedBy.size !== 0) this.pressed.clear()
  }

  /** Le déplacement au clavier est-il rendu à la caméra ? */
  get enabled(): boolean {
    return this.suspendedBy.size === 0
  }

  /** Axe courant, ou `null` si rien n'est demandé — le moteur s'épargne alors tout calcul. */
  axis(): NavAxis | null {
    // Cas courant, appelé à chaque frame : rien de maintenu, rien à calculer.
    if (!this.enabled || this.pressed.size === 0) return null
    const a = navAxis(this.pressed, this.keys, this.scratch)
    return a === IDLE ? null : a
  }

  bind(): void {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    // Un changement d'onglet ou de fenêtre ne délivre PAS le `keyup` : sans ça, la carte
    // partirait en translation infinie au retour.
    window.addEventListener('blur', this.releaseAll)
  }

  unbind(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.releaseAll)
    this.pressed.clear()
  }

  /** Toutes les touches liées, à plat — pour savoir si un événement nous concerne. */
  private isBound(key: string): boolean {
    const k = this.keys
    return (
      k.forward.includes(key) ||
      k.backward.includes(key) ||
      k.left.includes(key) ||
      k.right.includes(key) ||
      k.boost.includes(key)
    )
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const key = plainKey(e)
    if (!this.enabled || key === null || !this.isBound(key)) return
    /**
     * Une autre couche a déjà pris la touche (déplacement d'une sélection de dessin,
     * parcours d'une liste de résultats) : on ne double pas son action. La garde tient
     * quel que soit l'ordre d'enregistrement des écouteurs, contrairement à un simple
     * `stopPropagation` entre eux.
     */
    if (e.defaultPrevented) return
    this.pressed.add(key)
    /**
     * Seules les FLÈCHES sont consommées — ce sont les seules dont le comportement natif
     * (défiler la page) entre en conflit avec le déplacement.
     *
     * Les lettres, elles, laissent passer l'événement : la carte écoute `window`, donc
     * consommer `z`/`q`/`s`/`d` volait ces touches à l'application hôte partout dans la
     * page, y compris loin de la carte. Rien n'est perdu côté carte — la touche est déjà
     * enregistrée ci-dessus.
     */
    if (isArrowKey(key)) e.preventDefault()
  }

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.key.toLowerCase())
  }

  private readonly releaseAll = (): void => {
    this.pressed.clear()
  }
}
