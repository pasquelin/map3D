import type { SkyConfig } from '../types'

export const skyDefaults: SkyConfig = {
  enabled: true,
  // Ciel clair et franc par défaut : turbidité basse, bleu de Rayleigh soutenu.
  turbidity: 2,
  rayleigh: 1.2,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8,
  // Couverture modérée, nuages statiques (pas d'animation temporelle).
  clouds: { coverage: 0.35, density: 0.4, scale: 0.0002, elevation: 0.5 },
  // Fondu haut dans la descente : au-delà de 500 km, espace étoilé pur ; sous 90 km,
  // ciel plein. La bande couvre toute l'entrée en atmosphère sans jamais toucher la
  // vue globe (altitude ≈ rayon terrestre).
  fade: { start: 500_000, end: 90_000 },
  // 0 = heure de montage, figée (cf. SkyConfig.date).
  date: 0,
}
