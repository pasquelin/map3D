// Écriture de texte sans reflow inutile — partagé par les couches qui alimentent un bloc
// DOM depuis la passe `project()` (`ReadoutLayer`, `StatsLayer`).
//
// Extrait parce qu'il était recopié mot pour mot dans les deux, commentaire compris : deux
// copies, c'est deux fois la même précaution à retenir, et une seule qu'on pense à corriger.

/**
 * Écrit une valeur en évitant le reflow d'une écriture identique — le cas le PLUS
 * fréquent : un bloc de lecture réécrit les mêmes chiffres tant que rien ne bouge.
 */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text
}
