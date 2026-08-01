import * as THREE from 'three'

/**
 * Matériau plat plaqué au sol (trait comme remplissage).
 *
 * `depthTest` est un PARAMÈTRE, jamais une constante, et il est obligatoire : les deux
 * réglages sont justes, mais pas dans la même vue.
 * — Vue orbitale (`false`) : l'annotation se dessine par-dessus les tuiles 3D, sinon une
 *   forme au sol est occluse par le relief et devient invisible.
 * — Vue au ras du sol (`true`) : on est DEDANS, et la même règle la ferait recouvrir tout
 *   l'écran, bâtiments compris, qui prendraient sa teinte translucide.
 *
 * La politique est décidée par le moteur et lue ICI, à la construction. Un balayage qui
 * corrigerait les matériaux après coup ne peut PAS tenir : un resettle de drapage
 * reconstruit les meshes une frame plus tard, et les rebâtit avec le réglage par défaut.
 */
function flatMaterial(color: THREE.ColorRepresentation, depthTest: boolean, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity,
    depthTest,
    depthWrite: false,
  })
}

/**
 * Opacité de bordure par défaut d'une forme dessinée.
 *
 * SOURCE UNIQUE : cette valeur était réécrite en littéral à cinq endroits
 * (`strokeMaterial`, `DrawLayer.strokeOpacityOf`, et trois aperçus de
 * `DrawSettingsPanel`). Un défaut produit changé à un seul de ces endroits laissait
 * l'aperçu du panneau mentir sur ce que le tracé allait réellement donner.
 */
export const DEFAULT_STROKE_OPACITY = 0.95

/** La règle de mesure est volontairement plus discrète que les autres tracés. */
export const MEASURE_STROKE_OPACITY = 0.85

/** Matériau de trait plaqué au sol. `depthTest` : cf. `flatMaterial`. */
export function strokeMaterial(
  color: THREE.ColorRepresentation,
  depthTest: boolean,
  opacity = DEFAULT_STROKE_OPACITY,
): THREE.MeshBasicMaterial {
  return flatMaterial(color, depthTest, opacity)
}

/**
 * Trait pointillé, dont le motif DÉFILE — le « marching ants » de la sélection,
 * transposé à un ruban 3D.
 *
 * Le pointillé est découpé dans le fragment shader à partir de l'abscisse curviligne
 * (`ribbon(…, withDistance)`), et l'animation n'est qu'un décalage d'uniforme. Les
 * deux alternatives ont été écartées :
 * — `dashPattern()` (découpe géométrique) ne s'anime qu'en re-triangulant le ruban à
 *   chaque frame, pour chaque trait ;
 * — `LineDashedMaterial` rend un trait d'un pixel (WebGL ignore `linewidth`) et ne
 *   sait pas s'épaissir en mètres monde.
 *
 * L'espace entre deux tirets n'est pas VIDE : il garde la couleur du trait, à
 * `gapOpacity` près. Le trait reste ainsi une ligne continue — on voit encore ce
 * qu'il relie — et cette continuité ne coûte ni second maillage ni contour d'une
 * autre couleur, qui trancherait sur la teinte porteuse de sens.
 *
 * Longueurs en UNITÉS MONDE (mètres), comme l'épaisseur du ruban : c'est l'appelant
 * qui convertit ses pixels écran à la résolution courante.
 */
export type DashedMaterial = THREE.MeshBasicMaterial & {
  /** Uniformes vivants du motif — mutables par frame, sans recompiler le programme. */
  readonly dash: {
    dash: { value: number }
    gap: { value: number }
    offset: { value: number }
    gapOpacity: { value: number }
    /** Couleurs parcourues par les tirets successifs — tableau de taille fixe. */
    colors: { value: THREE.Color[] }
    /** Combien de ces couleurs sont réellement utilisées (1 = trait uni). */
    count: { value: number }
  }
}

/**
 * Couleurs qu'un même trait peut alterner. Fixe, parce que la taille du tableau est
 * compilée DANS le shader : la faire varier recompilerait un programme par cardinal.
 * Au-delà, le motif reboucle sur les huit premières — huit relations ouvertes sur un
 * même couple de markers n'ont déjà plus rien de lisible.
 */
export const MAX_DASH_COLORS = 8

export function dashedStrokeMaterial(
  colors: readonly THREE.ColorRepresentation[],
  // Objet d'options et non paramètres positionnels : `dash`, `gap` et `gapOpacity` sont trois
  // nombres voisins qu'un ordre inversé mélangerait sans que le compilateur bronche.
  opts: { depthTest: boolean; opacity: number; dash: number; gap: number; gapOpacity: number },
): DashedMaterial {
  const { depthTest, opacity, dash, gap, gapOpacity } = opts
  // `color` du matériau = MULTIPLICATEUR, pas la teinte : la teinte vient du tableau
  // d'uniformes. C'est ce qui laisse `applyColor` assombrir un trait survolé sans
  // avoir à réécrire toutes ses couleurs (blanc = intact).
  const material = flatMaterial(0xffffff, depthTest, opacity) as DashedMaterial
  const uniforms = {
    dash: { value: dash },
    gap: { value: gap },
    offset: { value: 0 },
    gapOpacity: { value: gapOpacity },
    colors: { value: Array.from({ length: MAX_DASH_COLORS }, () => new THREE.Color()) },
    count: { value: 1 },
  }
  Object.defineProperty(material, 'dash', { value: uniforms })
  setDashColors(material, colors)
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDash = uniforms.dash
    shader.uniforms.uGap = uniforms.gap
    shader.uniforms.uOffset = uniforms.offset
    shader.uniforms.uGapOpacity = uniforms.gapOpacity
    shader.uniforms.uColors = uniforms.colors
    shader.uniforms.uCount = uniforms.count
    shader.vertexShader = `attribute float aDist;\nvarying float vDist;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vDist = aDist;',
    )
    shader.fragmentShader =
      'varying float vDist;\nuniform float uDash;\nuniform float uGap;\nuniform float uOffset;\n' +
      `uniform float uGapOpacity;\nuniform vec3 uColors[${MAX_DASH_COLORS}];\nuniform int uCount;\n${shader.fragmentShader}`.replace(
        // Greffé sur `color_fragment`, donc juste après la déclaration de
        // `diffuseColor`.
        //
        // L'espace entre deux tirets est ATTÉNUÉ, jamais écarté (`discard`) : le
        // trait garderait sinon des trous, et redeviendrait une file de tirets
        // flottants sans rien qui relie ses extrémités. L'atténuation est relative,
        // donc un lien estompé par son rang estompe aussi ses espaces.
        //
        // Les tirets SUCCESSIFS parcourent le tableau de couleurs : c'est ainsi qu'un
        // trait unique porte les N relations qui relient le même couple de markers.
        // Le cycle vaut donc N périodes, et l'indice se lit dans le même modulo que
        // la phase — un seul reste à calculer pour les deux.
        '#include <color_fragment>',
        '#include <color_fragment>\n' +
          '  float m3dPeriod = uDash + uGap;\n' +
          '  if (m3dPeriod > 0.0) {\n' +
          '    float m3dT = mod(vDist - uOffset, m3dPeriod * float(uCount));\n' +
          '    float m3dIdx = floor(m3dT / m3dPeriod);\n' +
          '    if (m3dT - m3dIdx * m3dPeriod > uDash) diffuseColor.a *= uGapOpacity;\n' +
          `    for (int i = 0; i < ${MAX_DASH_COLORS}; i++) {\n` +
          '      if (float(i) == m3dIdx) diffuseColor.rgb *= uColors[i];\n' +
          '    }\n' +
          '  }\n',
      )
  }
  // Sans clé distincte, Three réutilise le programme du matériau plein compilé avant
  // lui (même signature de matériau) et le pointillé n'apparaît jamais. Constante :
  // TOUS les traits pointillés de la carte partagent alors UN seul programme compilé.
  material.customProgramCacheKey = () => 'm3d-dashed'
  return material
}

/** Réécrit les couleurs parcourues par un trait — sans toucher au programme compilé. */
export function setDashColors(material: DashedMaterial, colors: readonly THREE.ColorRepresentation[]): void {
  const { colors: slots, count } = material.dash
  const n = Math.min(Math.max(colors.length, 1), MAX_DASH_COLORS)
  for (let i = 0; i < n; i++) slots.value[i]!.set(colors[i] ?? 0xffffff)
  count.value = n
}

/**
 * Matériau d'une surface **volumétrique** (murs et couvercle d'un prisme).
 *
 * Contrairement à `flatMaterial`, il TESTE la profondeur : un volume doit être
 * occulté par le bâti qui passe devant lui, sinon il flotte par-dessus la ville.
 * Il n'ÉCRIT pas la profondeur en revanche — sans quoi les faces d'un même prisme
 * s'occulteraient entre elles et on ne verrait plus au travers.
 */
export function volumeMaterial(color: THREE.ColorRepresentation, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
  })
}

/**
 * Matériau des **arêtes** d'un volume : un trait de 1 px, constant quel que soit le
 * zoom et sans aucune conversion px→mètres.
 *
 * WebGL ignore `linewidth` et rend toujours 1 pixel : ce qui est d'ordinaire une
 * limitation est ici exactement l'effet recherché. Un ruban (`ribbon`) donnerait au
 * contraire une épaisseur en mètres, qu'il faudrait reconvertir à chaque
 * changement de résolution — et qui ne vaudrait jamais 1 px pile.
 */
export function edgeMaterial(color: THREE.ColorRepresentation, opacity = 0.9): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
  })
}

/** Matériau de remplissage plaqué au sol. `depthTest` : cf. `flatMaterial`. */
export function fillMaterial(
  color: THREE.ColorRepresentation,
  depthTest: boolean,
  opacity: number,
): THREE.MeshBasicMaterial {
  return flatMaterial(color, depthTest, opacity)
}
