/**
 * Neutralise le prochain `click` synthétisé après le `pointerup` d'un geste (saisie
 * au long-press, repositionnement) pour qu'il n'ouvre pas la fiche du marker qu'on
 * vient de manipuler.
 *
 * Scopé à **l'élément source** (et non `window`) : ce clic parasite n'existe que si
 * down/up tombent sur cet élément — un geste qui se relâche ailleurs ne synthétise
 * aucun clic ici, donc aucun clic sans rapport n'est jamais avalé. Auto-retiré au
 * premier clic, filet temporel sinon.
 *
 * Partagé par `useDraggable` et `useRepositionable` : les deux gestes se terminent
 * de la même façon, et la version recopiée devait être corrigée deux fois.
 */
export function suppressNextClick(el: HTMLElement): void {
  const suppress = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    el.removeEventListener('click', suppress, true)
  }
  el.addEventListener('click', suppress, true)
  window.setTimeout(() => el.removeEventListener('click', suppress, true), 400)
}
