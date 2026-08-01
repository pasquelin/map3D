/**
 * Ciel atmosphérique procédural (modèle de Preetham + nuages), révélé en FONDU quand on
 * descend vers le sol en 3D. En vue globe (haute altitude) il est invisible : seules les
 * étoiles et le fond d'espace restent — la vue depuis l'espace n'est jamais altérée.
 *
 * Le soleil est le vrai point subsolaire calculé pour `date` ; le lieu vient du centre
 * visé, donc voyager d'un continent à l'autre change le jour/la nuit. Aucune couleur ici :
 * le ciel est calculé physiquement à partir de ces paramètres.
 */
export type SkyConfig = {
  /** Active le ciel. `false` = étoiles + fond couleur seuls (comportement d'avant). */
  enabled: boolean
  /** Voile atmosphérique : `1` = ciel limpide, `~10` = brumeux/laiteux. */
  turbidity: number
  /** Diffusion de Rayleigh — intensité du bleu du ciel. */
  rayleigh: number
  /** Diffusion de Mie — force du halo autour du soleil. */
  mieCoefficient: number
  /** Directionnalité de Mie (0..1) — concentration du halo solaire. */
  mieDirectionalG: number
  clouds: {
    /** Couverture nuageuse : `0` = ciel dégagé, `1` = couvert. */
    coverage: number
    /** Opacité des nuages (0..1). */
    density: number
    /** Échelle du motif de nuages (plus petit = nuages plus grands). */
    scale: number
    /** Élévation apparente de la couche (0..1). */
    elevation: number
  }
  /**
   * Fondu étoiles → ciel, en **altitude caméra (m)**. Au-dessus de `start` : ciel
   * invisible (vue globe intacte). En dessous de `end` : ciel plein. Entre les deux :
   * fondu progressif. `start` doit être > `end`.
   */
  fade: {
    start: number
    end: number
  }
  /**
   * Instant (ms epoch, comme `Date.now()`) qui fixe la position du soleil. `0` = l'heure
   * de montage de la carte, figée. Une valeur > 0 fige un instant précis (déterministe).
   */
  date: number
}
