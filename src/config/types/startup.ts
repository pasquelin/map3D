// ⑥ startup — intro et disponibilité.

export type StartupConfig = {
  /** Durée du vol d'introduction (globe → position initiale), en secondes. */
  introDuration: number
  /** Attente maximale des tuiles avant de lancer l'intro malgré tout. */
  introMaxWaitMs: number
  /** Attente maximale avant d'émettre `ready` de force. */
  readyMaxWaitMs: number
  /**
   * Fondu de l'overlay à la fin de l'intro. Pendant de `introDuration`, qui était
   * exposé alors que son fondu de sortie vivait dans la feuille de styles.
   */
  introFadeMs: number
  /** Altitude de départ de l'intro, en rayons terrestres (vue globe). */
  introAltitudeFactor: number
  /**
   * Taille de repli (px) quand le conteneur n'est pas encore mesuré au montage —
   * conteneur masqué, hydratation SSR, layout différé.
   *
   * ⚠️ Ce n'est pas cosmétique : ce couple fixe le premier `aspect` de la caméra,
   * donc la première projection, avant que le `ResizeObserver` ne rende la main. Il
   * était écrit `800`/`600` au fil du code, sans que rien ne le nomme.
   */
  fallbackSize: readonly [number, number]
}
