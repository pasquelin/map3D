/**
 * Sonde de performance map3D — à lancer sur la machine qui rame.
 *
 * Rapporte les mêmes chiffres que le profil de référence (Mac 120 Hz, 29/07/2026),
 * pour savoir CE QU'IL FAUT optimiser au lieu de le deviner. Sur la machine de
 * référence le moteur ne consommait que ~1 ms de JS par frame sur 8,3 ms de budget :
 * si ce rapport est très différent ici, le classement des postes l'est aussi, et les
 * optimisations à faire ne sont pas les mêmes.
 *
 * ── Mode d'emploi ────────────────────────────────────────────────────────────
 *   1. `pnpm dev:example`, laisser la carte se stabiliser (le fond arrête de charger).
 *   2. Ouvrir la console du navigateur, puis :
 *
 *        await import('/perf-probe.js')
 *        await m3dPerf()
 *
 *      Ne pas toucher à la souris pendant la mesure (~40 s) : un geste de caméra
 *      fausse les relevés au repos.
 *
 *   3. Refaire la mesure EN CHARGE : onglet « Données » du banc de réglages,
 *      alertes = 2000, agents = 500, défibrillateurs = 2000, puis `await m3dPerf()`.
 *
 *   4. Le résultat est affiché en clair ET copié dans le presse-papier (JSON).
 *
 * Aucune écriture durable : tout ce que la sonde modifie (résolution de rendu,
 * visibilité du ciel, méthodes instrumentées) est restauré dans un `finally`, y
 * compris si elle échoue en cours de route.
 */

const FRAMES_TIMING = 180
/** Échantillon court des relevés COMPARATIFS (marge GPU, ciel) : cinq passages, on
 *  cherche un écart entre deux états, pas une statistique fine. */
const FRAMES_COMPARAISON = 120
const FRAMES_POSTES = 200
const FENETRES_LONGTASK = 3
const MS_PAR_FENETRE = 6000

/** Attend `n` frames réellement présentées (pas un timer : c'est la cadence qu'on mesure). */
const attendreFrames = (n) =>
  new Promise((res) => {
    let i = 0
    const loop = () => (++i < n ? requestAnimationFrame(loop) : res())
    requestAnimationFrame(loop)
  })

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

const percentile = (tries, p) => +tries[Math.min(tries.length - 1, Math.floor(tries.length * p))].toFixed(2)

/**
 * Instrumente `obj[cle]` et rend la fonction de restauration.
 *
 * ⚠️ Restauration par RÉAFFECTATION de l'original, jamais par `delete` : chez three,
 * `render` et `update` sont des propriétés PROPRES de l'instance (posées dans le
 * constructeur), et les supprimer casse le moteur pour de bon.
 */
const instrumenter = (obj, cle, libelle, acc, deja) => {
  if (!obj || typeof obj[cle] !== 'function') return null
  /**
   * Un même couple (objet, méthode) ne doit être enveloppé qu'UNE fois : `basemap2d` ou
   * `buildings` pourraient un jour figurer aussi dans `engine.layers`, et une double
   * enveloppe laisserait la méthode instrumentée en place après restauration — un
   * surcoût permanent posé par l'outil censé le mesurer.
   */
  if (deja.has(obj) && deja.get(obj).has(cle)) return null
  if (!deja.has(obj)) deja.set(obj, new Set())
  deja.get(obj).add(cle)
  const original = obj[cle]
  const lie = original.bind(obj)
  obj[cle] = function (...args) {
    const t = performance.now()
    const r = lie(...args)
    const a = acc[libelle] || (acc[libelle] = { ms: 0, n: 0 })
    a.ms += performance.now() - t
    a.n++
    return r
  }
  return () => {
    obj[cle] = original
  }
}

/** Carte graphique réelle — c'est elle qui décide de la marge GPU. */
const infoGPU = (renderer) => {
  try {
    const gl = renderer.getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'inconnue (extension refusée)'
  } catch {
    return 'inconnue'
  }
}

/** Cadence de l'écran : c'est le plafond, et donc le budget par frame. */
const mesurerHz = async () => {
  const t = []
  let last = performance.now()
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => requestAnimationFrame(r))
    const now = performance.now()
    t.push(now - last)
    last = now
  }
  t.sort((a, b) => a - b)
  // Médiane calculée depuis la longueur réelle, jamais depuis un indice écrit en dur :
  // changer le nombre d'échantillons ne doit pas fausser le relevé en silence.
  const median = percentile(t, 0.5)
  return { hz: Math.round(1000 / median), ms_par_frame_ecran: +median.toFixed(2) }
}

/** Temps de frame observé sur `FRAMES_TIMING` frames. */
const mesurerFrames = async (frames = FRAMES_TIMING) => {
  const ecarts = []
  let last = performance.now()
  await new Promise((res) => {
    let n = 0
    const loop = () => {
      const now = performance.now()
      ecarts.push(now - last)
      last = now
      if (++n < frames) requestAnimationFrame(loop)
      else res()
    }
    requestAnimationFrame(loop)
  })
  // Premier écart JETÉ : il court depuis l'appel, pas depuis une frame présentée, et
  // gonflait le `max_ms` d'un délai qui n'a rien d'un à-coup de rendu.
  ecarts.shift()
  const t = [...ecarts].sort((a, b) => a - b)
  return {
    fps_moyen: +(1000 / (ecarts.reduce((s, x) => s + x, 0) / ecarts.length)).toFixed(1),
    median_ms: percentile(t, 0.5),
    p95_ms: percentile(t, 0.95),
    max_ms: +t[t.length - 1].toFixed(2),
  }
}

/**
 * Tâches longues (> 50 ms) : c'est ÇA que l'utilisateur ressent comme « ça rame ».
 * Trois fenêtres et la médiane, parce qu'une fenêtre isolée varie beaucoup.
 */
const mesurerBlocages = async () => {
  const fenetres = []
  for (let i = 0; i < FENETRES_LONGTASK; i++) {
    const durees = []
    let obs
    try {
      obs = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) durees.push(e.duration)
      })
      obs.observe({ entryTypes: ['longtask'] })
    } catch {
      return { supporte: false, note: 'PerformanceObserver longtask indisponible (Safari)' }
    }
    await attendre(MS_PAR_FENETRE)
    obs.disconnect()
    fenetres.push({ taches: durees.length, ms: +durees.reduce((s, x) => s + x, 0).toFixed(0) })
  }
  const ms = fenetres.map((f) => f.ms).sort((a, b) => a - b)
  const n = fenetres.map((f) => f.taches).sort((a, b) => a - b)
  const median = ms[Math.floor(fenetres.length / 2)]
  return {
    supporte: true,
    fenetres,
    ms_bloques_median: median,
    taches_longues_median: n[Math.floor(fenetres.length / 2)],
    pct_temps_bloque: +((median / MS_PAR_FENETRE) * 100).toFixed(1),
  }
}

/** Répartition du CPU par poste du moteur, sur `FRAMES_POSTES` frames. */
const mesurerPostes = async (e) => {
  const acc = {}
  const restaurations = []
  const deja = new Map()
  try {
    restaurations.push(
      instrumenter(e.renderer, 'render', 'renderer.render (soumission WebGL)', acc, deja),
      instrumenter(e.labelRenderer, 'render', 'labelRenderer.render (overlays DOM)', acc, deja),
      instrumenter(e.controls, 'update', 'controls.update (garde au sol)', acc, deja),
      instrumenter(e.tiles, 'update', 'tiles.update (LOD 3D externe)', acc, deja),
      instrumenter(e.basemap2d, 'update', 'basemap2d.update (fond tuilé)', acc, deja),
      instrumenter(e.buildings, 'update', 'buildings.update (volume interne)', acc, deja),
    )
    for (const couche of e.layers) {
      const nom = couche.constructor.name
      restaurations.push(instrumenter(couche, 'update', `${nom}.update`, acc, deja))
      restaurations.push(instrumenter(couche, 'project', `${nom}.project`, acc, deja))
    }
    const t0 = performance.now()
    await attendreFrames(FRAMES_POSTES)
    const mur = performance.now() - t0

    const postes = Object.entries(acc)
      .map(([poste, v]) => ({ poste, ms_frame: +(v.ms / FRAMES_POSTES).toFixed(3) }))
      .filter((p) => p.ms_frame >= 0.002)
      .sort((a, b) => b.ms_frame - a.ms_frame)
    const total = postes.reduce((s, p) => s + p.ms_frame, 0)
    return {
      ms_frame_observe: +(mur / FRAMES_POSTES).toFixed(2),
      ms_js_moteur: +total.toFixed(2),
      ms_hors_moteur: +(mur / FRAMES_POSTES - total).toFixed(2),
      postes,
    }
  } finally {
    // Ordre INVERSE de la pose : c'est la seule façon de rendre chaque méthode à son
    // état d'origine si une enveloppe en recouvrait une autre.
    for (let i = restaurations.length - 1; i >= 0; i--) {
      const r = restaurations[i]
      if (r) r()
    }
  }
}

/**
 * Marge GPU : on multiplie les pixels et on regarde si le temps de frame bouge.
 * S'il ne bouge pas, le GPU n'est pas le goulot et tout travail sur les shaders
 * (ciel, matériaux) serait sans effet.
 */
const mesurerMargeGPU = async (e, budgetFrameMs) => {
  const dprInitial = e.renderer.getPixelRatio()
  const adaptInitial = e.config.performance.adaptiveResolution.enabled
  try {
    e.config.performance.adaptiveResolution.enabled = false
    /**
     * ⚠️ Neutraliser la résolution adaptative ne suffit PAS : quand elle est coupée alors
     * que son facteur est encore < 1 (le cas d'une machine qui rame, donc le nôtre), le
     * moteur le ramène à 1 à la frame suivante — et ce faisant rappelle `applyResolution()`,
     * qui REPOSE `pixelRatio` et écrase le nôtre. Mesuré : palier demandé 3, palier réel 1.
     * On lui laisse donc faire ce retour à 1 AVANT de commencer le balayage.
     */
    await attendre(400)

    /**
     * Plafond de sécurité : sur un GPU d'entrée de gamme, un tampon de rendu à ×3 peut
     * dépasser la taille de texture maximale ou la mémoire disponible, et faire perdre le
     * contexte WebGL — la carte devient blanche, et la sonde a cassé ce qu'elle mesurait.
     */
    const gl = e.renderer.getContext()
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE)
    const { width, height } = e.size
    const paliers = [1, 2, 3].filter(
      (d) => width * d <= maxTex && height * d <= maxTex && width * d * height * d <= 16e6,
    )
    const ecartes = [1, 2, 3].filter((d) => !paliers.includes(d))

    const releve = {}
    for (const dpr of paliers) {
      e.renderer.setPixelRatio(dpr)
      await attendre(400)
      // Palier RÉELLEMENT appliqué : s'il ne tient pas, on le dit au lieu de conclure à tort.
      const reel = e.renderer.getPixelRatio()
      const f = await mesurerFrames(FRAMES_COMPARAISON)
      releve[`dpr_${dpr}`] = { ms: f.median_ms, palier_reel: reel, tenu: Math.abs(reel - dpr) < 0.01 }
      if (gl.isContextLost()) return { ...releve, erreur: 'contexte WebGL perdu — relevé interrompu' }
    }

    const bas = releve[`dpr_${paliers[0]}`]
    const haut = releve[`dpr_${paliers[paliers.length - 1]}`]
    const fiable = paliers.length >= 2 && bas.tenu && haut.tenu
    const facteur = (paliers[paliers.length - 1] / paliers[0]) ** 2
    const surcout = +(haut.ms - bas.ms).toFixed(2)
    /**
     * Verdict RELATIF au budget de frame, jamais sur un seuil absolu.
     *
     * Un seuil en millisecondes ne veut rien dire sans le budget : 1,2 ms de surcoût pour
     * NEUF fois les pixels, c'est 14 % d'un budget à 8,3 ms — le GPU a une marge énorme.
     * Le même 1,2 ms sur un écran à 60 Hz mal alimenté raconterait autre chose. Le seuil
     * absolu concluait « GPU chargé » sur une machine qui ne l'est pas du tout.
     */
    const pctBudget = +((surcout / budgetFrameMs) * 100).toFixed(0)
    return {
      ...releve,
      paliers_ecartes: ecartes.length > 0 ? `${ecartes.join(', ')} (au-delà du budget de pixels)` : 'aucun',
      [`surcout_x${facteur}_pixels_ms`]: surcout,
      surcout_en_pct_du_budget: pctBudget,
      lecture: !fiable
        ? 'NON CONCLUANT — le palier demandé n’a pas tenu, ou un seul palier était possible'
        : pctBudget < 30
          ? `GPU LARGE — ×${facteur} pixels ne coûtent que ${pctBudget} % du budget : le goulot est ailleurs (CPU/React)`
          : `GPU CONTRAINT — ×${facteur} pixels coûtent ${pctBudget} % du budget : résolution et shaders comptent ici`,
    }
  } finally {
    e.renderer.setPixelRatio(dprInitial)
    e.config.performance.adaptiveResolution.enabled = adaptInitial
  }
}

/** Coût réel du ciel atmosphérique dans la vue COURANTE (nul en vue plongeante). */
/**
 * Coût du ciel, mesuré à résolution AMPLIFIÉE.
 *
 * ⚠️ À la résolution nominale et cadence bloquée par la vsync, un coût de fragment
 * inférieur à la milliseconde est indétectable : le relevé rendait 0 ms quoi qu'il
 * arrive, ce qui est exactement le pire des résultats — un chiffre faux qui a l'air
 * d'un chiffre. On multiplie donc les pixels pour rendre la différence lisible, puis
 * on la ramène à l'échelle nominale.
 */
const mesurerCiel = async (e, dprAmplifie, budgetFrameMs) => {
  if (!e.sky) return { monte: false }
  /**
   * ⚠️ On DÉTACHE le dôme de la scène — on ne touche pas à `sky.visible`.
   *
   * `MapEngine.updateSky()` repose `visible = true` à chaque frame peinte dès que
   * l'opacité est non nulle : le drapeau était donc rétabli avant même le premier
   * relevé, et la « mesure » comparait le ciel allumé avec lui-même — d'où un coût
   * de 0 ms qui ne voulait rien dire. Détaché, le dôme n'est plus parcouru par le
   * rendu, et `updateSky` peut continuer à écrire ses uniforms sans effet.
   */
  const parent = e.sky.parent
  if (!parent) return { monte: false, note: 'ciel non rattaché à la scène' }
  const dprInitial = e.renderer.getPixelRatio()
  const adaptInitial = e.config.performance.adaptiveResolution.enabled
  try {
    e.config.performance.adaptiveResolution.enabled = false
    await attendre(400)
    e.renderer.setPixelRatio(dprAmplifie)
    await attendre(400)
    const amplification = (e.renderer.getPixelRatio() / dprInitial) ** 2
    const avec = await mesurerFrames(FRAMES_COMPARAISON)
    parent.remove(e.sky)
    await attendre(300)
    const sans = await mesurerFrames(FRAMES_COMPARAISON)
    const brut = avec.median_ms - sans.median_ms
    // Verdict sur le coût RAMENÉ À L'ÉCHELLE NOMINALE et rapporté au budget : juger sur la
    // valeur amplifiée annonçait « ça vaut le coup » pour 0,044 ms réelles.
    const nominal = brut / Math.max(1, amplification)
    const pctBudget = +((nominal / budgetFrameMs) * 100).toFixed(1)
    return {
      monte: true,
      opacite: e.sky.uniforms.opacity.value,
      nuages_couverture: e.sky.uniforms.cloudCoverage.value,
      mesure_a_dpr: e.renderer.getPixelRatio(),
      cout_ms_a_ce_dpr: +brut.toFixed(2),
      cout_ms_estime_nominal: +nominal.toFixed(3),
      cout_en_pct_du_budget: pctBudget,
      note:
        brut < 0.3
          ? 'indétectable même amplifié — en vue plongeante le shader court-circuite les nuages'
          : pctBudget < 5
            ? `négligeable à l’échelle réelle (${pctBudget} % du budget) — le bake du fbm ne rapporterait rien dans CETTE vue`
            : `coût réel (${pctBudget} % du budget) — le ciel occupe l’écran ici, le bake du fbm vaut le coup`,
    }
  } finally {
    if (e.sky.parent !== parent) parent.add(e.sky)
    e.renderer.setPixelRatio(dprInitial)
    e.config.performance.adaptiveResolution.enabled = adaptInitial
  }
}

export async function m3dPerf() {
  const e = globalThis.__m3d
  if (!e) throw new Error("Moteur introuvable : lancer la sonde sur la démo map3D (window.__m3d absent).")

  const log = (m) => console.log(`%c[sonde map3D] ${m}`, 'color:#7aa2f7')
  log('démarrage — ne touchez plus à la carte pendant ~40 s')

  const s0 = e.stats()
  const ecran = await mesurerHz()
  log('1/6 cadence écran relevée')
  const frames = await mesurerFrames()
  log('2/6 temps de frame relevé')
  const postes = await mesurerPostes(e)
  log('3/6 répartition CPU relevée')
  const gpu = await mesurerMargeGPU(e, ecran.ms_par_frame_ecran)
  log('4/6 marge GPU relevée')
  // Ciel mesuré au palier le PLUS HAUT qui a tenu : c'est le seul moyen de sortir un
  // coût de fragment du bruit de la vsync (cf. `mesurerCiel`).
  const paliersTenus = Object.entries(gpu)
    .filter(([k, v]) => k.startsWith('dpr_') && v && v.tenu)
    .map(([k]) => Number(k.slice(4)))
  const ciel = await mesurerCiel(e, paliersTenus.length > 0 ? Math.max(...paliersTenus) : 1, ecran.ms_par_frame_ecran)
  log('5/6 coût du ciel relevé')
  const blocages = await mesurerBlocages()
  log('6/6 tâches longues relevées')

  const s1 = e.stats()
  const etat = e.camera.getState()
  const canvas = e.renderer.domElement

  const rapport = {
    contexte: {
      date: new Date().toISOString(),
      gpu: infoGPU(e.renderer),
      coeurs_cpu: navigator.hardwareConcurrency ?? 'inconnu',
      memoire_go: navigator.deviceMemory ?? 'inconnue',
      dpr_ecran: globalThis.devicePixelRatio,
      canvas: `${canvas.width}x${canvas.height}`,
      ...ecran,
    },
    vue: {
      altitude_m: Math.round(etat.altitude),
      mode: e.mapMode,
      fournisseur_3d: e.provider3d,
      markers_suivis: s1.overlays,
      noeuds_dom: document.querySelectorAll('.m3d-marker-anchor').length,
    },
    rendu: {
      ...frames,
      drawCalls: s1.drawCalls,
      triangles: s1.triangles,
      textures: s1.textures,
      resolutionScale: s1.resolutionScale,
      ratio_frames_peintes: +((s1.painted - s0.painted) / Math.max(1, s1.frames - s0.frames)).toFixed(2),
    },
    repartition_cpu: postes,
    marge_gpu: gpu,
    cout_ciel: ciel,
    blocages,
  }

  // Verdict : c'est lui qui dit où chercher, le reste est la pièce justificative.
  const budget = ecran.ms_par_frame_ecran
  const part = postes.ms_js_moteur / budget
  rapport.verdict =
    part > 0.6
      ? `MOTEUR SATURÉ — le JS du moteur prend ${(part * 100).toFixed(0)} % du budget de frame. Le poste dominant (${postes.postes[0]?.poste}) est la cible.`
      : blocages.supporte && blocages.pct_temps_bloque > 3
        ? `MOTEUR AU LARGE (${(part * 100).toFixed(0)} % du budget) mais ${blocages.pct_temps_bloque} % du temps bloqué par des tâches longues → le problème est hors boucle de rendu (React / données).`
        : `RIEN DE SATURÉ dans cette vue — refaire la mesure en charge (2000 alertes / 500 agents / 2000 défibs) ou dans la vue qui rame vraiment.`

  console.log('%c── RAPPORT SONDE map3D ──', 'font-weight:bold')
  console.log(rapport.verdict)
  console.table(postes.postes)
  console.log(rapport)

  /**
   * Presse-papier en BEST-EFFORT, et sous garde de temps.
   *
   * ⚠️ `clipboard.writeText()` ne rejette pas toujours quand la page n'a pas le focus :
   * il peut rester en attente indéfiniment (constaté en navigateur piloté). Sans cette
   * course, la sonde ne rendait jamais la main APRÈS avoir tout mesuré — le pire des
   * cas, puisque le rapport était déjà prêt.
   */
  const json = JSON.stringify(rapport, null, 2)
  globalThis.m3dPerfDernier = json
  const copie = await Promise.race([
    navigator.clipboard?.writeText(json).then(
      () => true,
      () => false,
    ) ?? Promise.resolve(false),
    attendre(1500).then(() => false),
  ])
  log(
    copie
      ? 'rapport copié dans le presse-papier — collez-le tel quel'
      : 'presse-papier indisponible : récupérez le rapport avec `copy(m3dPerfDernier)`',
  )
  return rapport
}

globalThis.m3dPerf = m3dPerf
console.log('%c[sonde map3D] prête — lancez : await m3dPerf()', 'color:#9ece6a;font-weight:bold')
