import type { PerformanceConfig } from '../types'

export const performanceDefaults: PerformanceConfig = {
  pixelRatio: 1,
  antialias: true,
  powerPreference: 'high-performance',
  // Cible 60 fps avec la marge habituelle (16,7 ms de budget) ; on ne descend qu'à
  // partir de 22 ms, soit un tiers de frame perdue, et jamais sous la demi-résolution —
  // en deçà le sol photogrammétrique devient franchement flou.
  adaptiveResolution: { enabled: true, targetFrameMs: 22, minRatio: 0.5, step: 0.1, sampleFrames: 30 },
  // 0 = maximum du matériel (typiquement 16). Le coût GPU est négligeable devant le gain :
  // c'est ce qui rend un sol lisible en vue rasante au lieu d'un moiré scintillant.
  textureAnisotropy: 0,
  // Valeurs historiques du créneau near/far posé autour du rendu des overlays, désormais
  // portées par la caméra jumelle (cf. `MapEngine.labelCamera`).
  overlayDepth: { nearMeters: 0.1, farMeters: 1e9 },
  renderOnDemand: { enabled: true, idleFrames: 3, maxIdleMs: 1_000 },
  boundsPickGrid: 5,
  boundsMargin: 0.15,
  viewportSettleFrames: 4,
  markerRecomputeMs: 90,
  // ~8 Hz : au-delà les chiffres deviennent illisibles à force de défiler, en deçà le
  // bloc semble en retard sur la carte.
  readoutRefreshMs: 120,
  /**
   * Bornes calibrées sur un budget de 16,6 ms (60 Hz). Le sens vient de l'ORDRE des
   * bornes : `ok > warn` pour ce qui porte, `ok < warn` pour ce qui pèse.
   *
   * Ne sont jugées que les grandeurs dont l'excès coûte VRAIMENT. Une latitude, un cap
   * ou une altitude n'ont pas de bonne valeur — les colorer apprendrait à ignorer la
   * couleur, qui doit rester rare pour rester lue.
   */
  statThresholds: {
    // 55 laisse passer les micro-décrochages d'un écran 60 Hz sans crier ; sous 30, le
    // mouvement de caméra devient perceptiblement saccadé.
    fps: { ok: 55, warn: 30 },
    // Sous 90 % de frames peintes, le rendu à la demande saute des images qu'on attendait.
    paintedRatio: { ok: 0.9, warn: 0.6 },
    // Chaque marker visible est un nœud DOM composé par le navigateur : c'est le poste qui
    // décroche le plus tôt, bien avant la géométrie.
    markersVisible: { ok: 400, warn: 1200 },
    // Mesuré : une tuile de volume dense en porte ~131 000 à elle seule. Le seuil vise la
    // scène entière, tuiles de fond comprises.
    triangles: { ok: 2_000_000, warn: 5_000_000 },
    drawCalls: { ok: 300, warn: 800 },
    textures: { ok: 400, warn: 900 },
    // La résolution adaptative descend sous 1 quand le GPU ne suit plus : c'est un
    // symptôme, pas un réglage — d'où un seuil qui le signale.
    resolutionScale: { ok: 1, warn: 0.75 },
    // ⚠️ Seuil ABSOLU, volontairement décorrélé des `maxBytes` : ceux-ci sont des filets
    // (256 Mio pour le fond, 448 pour le volume) qu'un hôte relève sans que sa machine
    // suive. 384 Mio est ce qu'une machine modeste encaisse sans évincer en boucle. Un
    // hôte qui abaisse ses budgets de cache doit resserrer ces bornes avec.
    tileBytes: { ok: 384 * 1024 * 1024, warn: 768 * 1024 * 1024 },
  },
  // Unifié sur la valeur des COUCHES (1e-6 / 1e-3), pas sur celle du moteur
  // (1e-7 / 1e-4) : c'est elle qui décidait réellement des re-échantillonnages, et
  // la plus fine faisait rouvrir la fenêtre pour un mouvement de ~1 cm.
  cameraMoveEpsilon: { deg: 1e-6, altitudeRatio: 1e-3, altitudeMinMeters: 1 },
  groundSample: {
    ttlMs: 2_000,
    cellDeg: 1e-4,
    // ~11 m de côté par cellule : de quoi couvrir largement une vue de ville avant purge.
    cacheMaxCells: 4_096,
    rayOriginMeters: 12_000,
    rayFarMeters: 40_000,
    radiusMeters: 18,
    samples: 8,
  },
  markerCullMarginPx: 200,
  // Plus étroite que celle des relations (0,3) : ici la bande retarde l'apparition
  // d'un décor entier, pas un simple regroupement — trop large, le seuil réglé par
  // l'hôte ne serait plus celui qu'il observe.
  markerZoomBand: 0.15,
  // ⚠️ `windowFrames`/`spawnWindowFrames` : 90 et 150 coexistaient dans le même
  // fichier (`MarkerLayer.noteCamera` et la création d'un marker) sans qu'aucune
  // intention ne distingue les deux cas. Elles sont conservées telles quelles, mais
  // nommées — la différence est maintenant lisible et réglable.
  resettle: { batch: 4, retryFrames: 30, mppBand: 1.25, windowFrames: 90, spawnWindowFrames: 150, everyNFrames: 3 },
  relations: { maxSteps: 256, stepMeters: 200, fanMaxLegs: 5, zoomBand: 0.3 },
  // Unifié sur la valeur HAUTE des trois littéraux qui coexistaient (48 pour les
  // liens et les cercles dessinés, 64 pour les zones) : aligner vers le bas aurait
  // aplati les zones, ce qui se voit. Le surcoût est de quelques sommets par cercle.
  circleSegments: 64,
  shapeGroundSamples: 16,

  groundHeightRange: [-500, 9000],
}
