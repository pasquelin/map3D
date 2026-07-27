export type SwatchProps = {
  /** Photo (agent, usager) — recadrée en rond, cerclée de `color`. */
  avatar?: string
  /** Pictogramme (symbole tactique, icône métier) — affiché ENTIER, jamais rogné. */
  icon?: string
  /** Couleur de la pastille de repli, et du cerclage des deux autres formes. */
  color: string
}

/**
 * Repère visuel d'une ligne de liste, toujours présent : photo > icône > pastille.
 * Partagé par l'inventaire de la loupe, le panneau de sélection et la recherche —
 * une même entité doit se reconnaître au même signe, où qu'on la rencontre.
 *
 * La distinction photo/icône n'est pas cosmétique : un pictogramme rogné en rond
 * perd ce qui le distingue, alors que c'est précisément lui qui identifie la ligne
 * (cas d'un symbole, dont le type `'symbol'` ne dit rien).
 */
export function Swatch({ avatar, icon, color }: SwatchProps) {
  if (avatar) {
    return <img className="m3d-mlavatar" src={avatar} alt="" draggable={false} style={{ borderColor: color }} />
  }
  if (icon) {
    return (
      <span className="m3d-mlicon" style={{ borderColor: color }}>
        <img src={icon} alt="" draggable={false} />
      </span>
    )
  }
  return <span className="m3d-mldot" style={{ background: color }} />
}
