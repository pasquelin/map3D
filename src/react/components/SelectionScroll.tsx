import type { ReactNode } from 'react'

/**
 * Conteneur de défilement UNIQUE, partagé par le panneau de sélection ET la loupe. Une
 * seule zone scrollable (jamais de scroll par bloc), bornée en hauteur, sans défilement
 * horizontal parasite. Le contenu (groupes, listes de lignes) vit DEDANS, à l'identique des
 * deux côtés — c'est le point de partage qui garantit « même code » entre loupe et sélecteur.
 */
export function SelectionScroll({ children }: { children: ReactNode }) {
  return <div className="m3d-selscroll">{children}</div>
}
