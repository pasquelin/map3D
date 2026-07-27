import Icon from '@mdi/react'
import type { ComponentProps } from 'react'
import { useTheme } from '../context'

/**
 * Icône @mdi à la taille du thème.
 *
 * Pourquoi ce wrapper plutôt qu'un `size` écrit au point d'appel : les sept valeurs
 * qui coexistaient dans l'UI (0.5 à 0.8) ne se distinguaient pas — c'est le constat
 * qui a donné `theme.sizing.iconSize`. Mais la clé restait morte : seul
 * `<ToolButton>` la lisait, les vingt-sept autres icônes gardaient leur littéral,
 * si bien qu'un hôte qui réglait `iconSize` ne voyait bouger que les barres.
 *
 * Passer par un composant plutôt que par `useTheme()` dans chaque fichier évite
 * d'ajouter le hook à huit composants qui n'ont sinon aucun besoin du thème — et
 * garde le point de décision unique.
 *
 * `size` reste acceptée : une icône qui doit réellement s'écarter de la convention
 * (calage sur un glyphe voisin, contrainte de gabarit) le dit explicitement, au lieu
 * de le faire par défaut.
 *
 * `aria-hidden` par défaut : dans cette UI, une icône accompagne toujours un contrôle
 * qui porte déjà son nom (`aria-label` ou libellé visible). Sans cela, un lecteur
 * d'écran annonce le graphique en plus du bouton — la même action nommée deux fois.
 * Une icône qui serait, elle, le seul porteur du sens passe `aria-hidden={false}` et
 * son propre `aria-label`.
 */
export function UiIcon({ size, ...rest }: ComponentProps<typeof Icon>) {
  const theme = useTheme()
  return <Icon aria-hidden {...rest} size={size ?? theme.sizing.iconSize} />
}
