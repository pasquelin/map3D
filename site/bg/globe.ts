/*
 * Fond de la vitrine : un globe de particules, rendu avec three.js — la bibliothèque
 * que le site présente. Aucune image n'est chargée : `assets/globe.bin` ne contient que
 * des coordonnées (Int16, centièmes de degré), semées hors ligne sur les terres émergées.
 *
 * Trois nuages, et c'est leur superposition qui fait lire une planète :
 *  1. une TRAME de sphère complète, très faible. Sans elle, la rotation amène le
 *     Pacifique face à l'écran et le globe disparaît — un trou noir au milieu de la
 *     page. Avec elle, les océans restent piqués de points et le volume ne se perd
 *     jamais ;
 *  2. les TERRES, brillantes, qui dessinent les continents par-dessus la trame ;
 *  3. un HALO orbital plus lâche, qui donne la profondeur du champ.
 *
 * Le scroll ne fait pas que tourner le globe : il pousse une ONDE du pôle nord vers le
 * pôle sud, qui soulève et allume les particules qu'elle traverse. La vitesse de scroll
 * ajoute une impulsion de rotation, amortie — la planète a de l'inertie.
 *
 * Contraintes tenues, parce qu'un décor qui coûte cher n'est plus un décor :
 * - un draw call par nuage, aucune allocation dans la boucle de frame ;
 * - la boucle s'arrête quand l'onglet passe en arrière-plan ;
 * - `prefers-reduced-motion` rend UNE frame, puis se tait ;
 * - sans WebGL, on ne monte rien et la page reste exactement ce qu'elle était.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three'

type Nuage = { points: Points; material: ShaderMaterial }

const TRAME_COUNT = 9000
const HALO_COUNT = 1600
const HALO_INTERIEUR = 1.14
const HALO_EXTERIEUR = 1.7
const LUNE_COUNT = 900
/** Rapport des rayons Terre/Lune, le vrai (0,273) — la distance, elle, est mise en scène. */
const LUNE_RAYON = 0.273
const ETOILES_COUNT = 700

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uBreath;
  uniform float uWaveY;
  uniform float uWaveGain;
  uniform float uFlat;
  attribute float aSeed;
  varying float vFace;
  varying float vTwinkle;
  varying float vWave;

  void main() {
    vec3 dir = normalize(position);

    // Onde de latitude : une bande gaussienne centrée sur uWaveY, poussée par le scroll
    // du pôle nord au pôle sud. Elle n'agit QUE sur la lumière et la taille du point —
    // déplacer les particules bosselait la sphère, et une planète cabossée n'est plus
    // une planète.
    vWave = exp(-pow((dir.y - uWaveY) * 3.2, 2.0)) * uWaveGain;

    // Respiration : moins d'un pour cent d'écart, déphasé par la graine. C'est ce qui
    // empêche le globe de paraître figé quand personne ne scrolle.
    float breath = uBreath * sin(uTime * 0.55 + aSeed * 6.2831);
    vec3 p = position * (1.0 + breath);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);

    // Une particule qui nous fait face brille ; celles du limbe s'éteignent. C'est ce
    // qui donne le volume, sans aucune lumière ni géométrie de sphère.
    vec3 n = normalize(mat3(modelViewMatrix) * dir);
    vFace = mix(smoothstep(-0.3, 0.85, n.z), 1.0, uFlat);
    vTwinkle = 0.5 + 0.5 * sin(uTime * 1.6 + aSeed * 12.9898);

    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.8 + 0.4 * vTwinkle + 1.5 * vWave) * (2.6 / max(0.35, -mv.z));
  }
`

const FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform vec3 uCold;
  uniform vec3 uWarm;
  uniform vec3 uFlare;
  uniform float uOpacity;
  varying float vFace;
  varying float vTwinkle;
  varying float vWave;

  void main() {
    // Point rond à bord doux : un carré se verrait, un disque net crénellerait.
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c);
    if (d2 > 0.25) discard;
    float core = smoothstep(0.25, 0.005, d2);

    vec3 col = mix(uCold, uWarm, vFace * (0.55 + 0.45 * vTwinkle));
    col = mix(col, uFlare, clamp(vWave * 1.4, 0.0, 1.0));
    float a = core * uOpacity * (0.1 + 0.9 * vFace) * (1.0 + 2.2 * vWave);
    gl_FragColor = vec4(col, a);
  }
`

/** Graine déterministe : deux chargements donnent le même ciel, rien n'est tiré au sort. */
const graine = (i: number): number => ((i * 2654435761) % 1000) / 1000

function versGeometrie(positions: Float32Array, seeds: Float32Array): BufferGeometry {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  geo.setAttribute('aSeed', new BufferAttribute(seeds, 1))
  return geo
}

/** Les terres, depuis les latitudes/longitudes stockées en centièmes de degré. */
function geometrieTerres(buffer: ArrayBuffer): BufferGeometry {
  const brut = new Int16Array(buffer)
  const n = brut.length / 2
  const positions = new Float32Array(n * 3)
  const seeds = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const lat = ((brut[i * 2] ?? 0) / 100) * (Math.PI / 180)
    const lng = ((brut[i * 2 + 1] ?? 0) / 100) * (Math.PI / 180)
    const cos = Math.cos(lat)
    positions[i * 3] = cos * Math.sin(lng)
    positions[i * 3 + 1] = Math.sin(lat)
    positions[i * 3 + 2] = cos * Math.cos(lng)
    seeds[i] = graine(i)
  }
  return versGeometrie(positions, seeds)
}

/**
 * Répartition de Fibonacci sur une coquille : uniforme en surface, sans les paquets aux
 * pôles d'une grille lat/lng ni la régularité visible d'un damier.
 * `rayonMin === rayonMax` donne une sphère ; un intervalle donne un nuage épais.
 */
function geometrieCoquille(count: number, rayonMin: number, rayonMax: number): BufferGeometry {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const doré = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const anneau = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = doré * i
    const t = graine(i * 7 + 3)
    const r = rayonMin + (rayonMax - rayonMin) * t
    positions[i * 3] = r * Math.cos(theta) * anneau
    positions[i * 3 + 1] = r * y
    positions[i * 3 + 2] = r * Math.sin(theta) * anneau
    seeds[i] = t
  }
  return versGeometrie(positions, seeds)
}

type Reglage = {
  taille: number
  opacite: number
  souffle: number
  onde: number
  /** 1 = pas d'atténuation au limbe (étoiles). */
  plat?: number
}

function materiau(froid: Color, chaud: Color, eclat: Color, r: Reglage): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    // Additif : les particules superposées s'additionnent au lieu de se masquer, ce qui
    // allume naturellement les zones denses (côtes, archipels) et le cœur de l'onde.
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: r.taille },
      uPixelRatio: { value: 1 },
      uOpacity: { value: r.opacite },
      uBreath: { value: r.souffle },
      uWaveY: { value: 2 },
      uWaveGain: { value: r.onde },
      uFlat: { value: r.plat ?? 0 },
      uCold: { value: froid },
      uWarm: { value: chaud },
      uFlare: { value: eclat },
    },
  })
}

function jeton(nom: string, repli: string): Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nom).trim()
  return new Color(v.length > 0 ? v : repli)
}

async function monter(): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.className = 'backdrop'
  canvas.setAttribute('aria-hidden', 'true')

  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' })
  } catch {
    return // pas de WebGL : la page se passe très bien de décor
  }

  // `import.meta.url` passe par une variable : sous sa forme littérale,
  // `new URL('…', import.meta.url)` est réécrit par Vite en référence d'asset, alors que
  // ce fichier est déjà posé dans `site/assets/` et ne doit pas être rebundlé.
  const ici = import.meta.url
  const reponse = await fetch(new URL('globe.bin', ici))
  if (!reponse.ok) return
  const terresGeo = geometrieTerres(await reponse.arrayBuffer())

  document.body.prepend(canvas)
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()
  const camera = new PerspectiveCamera(38, 1, 0.1, 20)
  camera.position.z = 3.05

  const groupe = new Group()
  // Axe incliné comme celui d'une planète : un globe parfaitement droit a l'air d'un
  // diagramme, pas d'un monde.
  groupe.rotation.z = -0.41
  scene.add(groupe)

  const froid = jeton('--globe', '#0e659a')
  const chaud = jeton('--balise', '#1acbc4')
  const eclat = new Color('#bdfff6')

  const monte = (geo: BufferGeometry, r: Reglage): Nuage => {
    const material = materiau(froid, chaud, eclat, r)
    const points = new Points(geo, material)
    groupe.add(points)
    return { points, material }
  }

  // Ordre d'ajout = ordre de rendu : la trame d'abord, les terres par-dessus.
  const trame = monte(geometrieCoquille(TRAME_COUNT, 1, 1), {
    taille: 1.25,
    opacite: 0.17,
    souffle: 0.004,
    onde: 0.7,
  })
  const terres = monte(terresGeo, { taille: 2.7, opacite: 0.95, souffle: 0.009, onde: 1 })
  const halo = monte(geometrieCoquille(HALO_COUNT, HALO_INTERIEUR, HALO_EXTERIEUR), {
    taille: 1.7,
    opacite: 0.32,
    souffle: 0.03,
    onde: 0.45,
  })

  // La Lune : même matière, échelle réelle par rapport à la Terre. Son groupe est un
  // enfant de la SCÈNE et non du globe — elle doit garder sa propre orbite quand la
  // planète tourne sur elle-même.
  const lune = new Group()
  scene.add(lune)
  const luneMat = materiau(froid, chaud, eclat, { taille: 1.9, opacite: 0.72, souffle: 0.006, onde: 0.5 })
  const lunePoints = new Points(geometrieCoquille(LUNE_COUNT, LUNE_RAYON, LUNE_RAYON), luneMat)
  lune.add(lunePoints)

  // Les étoiles : loin derrière, sans limbe (`plat`), et hors de tout groupe mobile.
  const etoilesMat = materiau(new Color('#4d6f8a'), new Color('#e8f6ff'), eclat, {
    taille: 5.2,
    opacite: 0.5,
    souffle: 0,
    onde: 0,
    plat: 1,
  })
  const etoiles = new Points(geometrieCoquille(ETOILES_COUNT, 6, 9.5), etoilesMat)
  scene.add(etoiles)

  const nuages = [trame, terres, halo, { points: lunePoints, material: luneMat }]
  const doux = matchMedia('(prefers-reduced-motion: reduce)')

  function redimensionner(): void {
    const w = innerWidth
    const h = innerHeight
    // Cap à 1.5 : au-delà, on paie quatre fois les pixels pour un décor que personne ne
    // regarde de près.
    const dpr = Math.min(devicePixelRatio, 1.5)
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    for (const n of nuages) n.material.uniforms.uPixelRatio!.value = dpr

    // Sur large écran le globe se pose du côté opposé à la colonne de texte — donc à
    // droite en lecture normale, à gauche en arabe — et reste ENTIER : rogné, on n'y
    // reconnaît plus une planète. Sa dérive au scroll est appliquée dans la frame.
    sens = document.documentElement.dir === 'rtl' ? -1 : 1
    large = w >= 900
    groupe.position.y = large ? 0.02 : 0.18
    groupe.scale.setScalar(large ? 0.84 : 0.82)
    lune.scale.setScalar(large ? 0.84 : 0.7)
    canvas.style.opacity = large ? '0.9' : '0.5'
  }

  let large = true
  /** +1 en lecture gauche-droite, -1 en arabe : tout le décor se miroite avec la page. */
  let sens = 1
  let debut = 0
  let anime = 0
  let scrollPrec = scrollY
  /** Impulsion de rotation héritée de la vitesse de scroll, amortie frame après frame. */
  let elan = 0
  let rotation = 0

  function frame(now: number): void {
    anime = 0
    if (debut === 0) debut = now
    const t = (now - debut) / 1000

    // Le scroll est LU ici, une fois par frame : un handler qui écrirait dans three.js
    // referait le travail plusieurs fois entre deux images.
    const course = document.documentElement.scrollHeight - innerHeight
    const avancement = course > 0 ? Math.min(1, Math.max(0, scrollY / course)) : 0
    const vitesse = (scrollY - scrollPrec) / Math.max(1, innerHeight)
    scrollPrec = scrollY

    // Inertie : un coup de molette lance la planète, elle ralentit ensuite toute seule.
    elan = elan * 0.92 + vitesse * 1.6
    rotation += 0.0016 + elan * 0.06

    // La planète part à droite et dérive vers le centre : sans ça, toute la page
    // penche du même côté du début à la fin.
    const derive = large ? (0.74 - avancement * 0.62) * sens : 0
    groupe.position.x = derive
    groupe.rotation.y = rotation + avancement * Math.PI * 0.9
    groupe.rotation.x = -0.16 + avancement * 0.24
    camera.position.z = 3.05 + avancement * 0.45
    halo.points.rotation.y = -t * 0.05
    halo.points.rotation.x = t * 0.02

    // Orbite de la Lune, dans un plan incliné : le scroll l'avance d'un demi-tour, si
    // bien qu'elle passe de l'autre côté de la Terre au fil de la page.
    const phase = t * 0.075 + avancement * Math.PI * 1.15
    lune.position.set(
      derive + Math.cos(phase) * 2.05 * sens,
      0.42 + Math.sin(phase * 0.7) * 0.22,
      Math.sin(phase) * 1.15 - 0.2,
    )
    lunePoints.rotation.y = t * 0.05

    // Les étoiles dérivent à contre-sens, très lentement : c'est ce qui donne la
    // parallaxe sans qu'on puisse dire d'où elle vient.
    etoiles.rotation.y = -t * 0.006
    etoiles.rotation.x = -0.1

    // L'onde descend du pôle nord au pôle sud sur toute la hauteur de page, et brille
    // d'autant plus qu'on scrolle vite.
    const waveY = 1.35 - avancement * 2.7
    const gain = 0.35 + Math.min(1, Math.abs(elan) * 7)
    for (const n of nuages) {
      n.material.uniforms.uTime!.value = t
      n.material.uniforms.uWaveY!.value = waveY
    }
    etoilesMat.uniforms.uTime!.value = t
    terres.material.uniforms.uWaveGain!.value = gain
    trame.material.uniforms.uWaveGain!.value = gain * 0.7
    halo.material.uniforms.uWaveGain!.value = gain * 0.45
    luneMat.uniforms.uWaveGain!.value = gain * 0.5

    renderer.render(scene, camera)
    if (!doux.matches && !document.hidden) anime = requestAnimationFrame(frame)
  }

  function relancer(): void {
    if (anime === 0 && !doux.matches && !document.hidden) anime = requestAnimationFrame(frame)
  }

  addEventListener('resize', () => {
    redimensionner()
    if (doux.matches) requestAnimationFrame(frame)
    else relancer()
  })
  // Un onglet en arrière-plan ne doit rien coûter : rAF s'y endort déjà, mais on coupe
  // aussi le nôtre pour ne pas rendre une frame de rattrapage au retour.
  document.addEventListener('visibilitychange', relancer)
  doux.addEventListener('change', () => {
    if (doux.matches) cancelAnimationFrame(anime)
    else relancer()
    requestAnimationFrame(frame)
  })
  // Sans animation, le scroll ne redessine plus : on rend à la demande.
  addEventListener('scroll', () => doux.matches && requestAnimationFrame(frame), { passive: true })

  redimensionner()
  requestAnimationFrame(frame)
}

void monter()
