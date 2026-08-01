/**
 * Symbologie **MIL-STD-2525D** (SIDC 20 caractères) : barrel qui ré-exporte le
 * catalogue de données (`milSymCatalog.ts`, sans dépendance au SDK) et la mécanique
 * de rendu (`milSymRenderer.ts`, qui charge `@armyc2.c5isr.renderer` en import
 * dynamique — chunk séparé de ~9 Mo, jamais téléchargé sans symboles à l'écran).
 */
export * from './milSymCatalog'
export * from './milSymRenderer'
