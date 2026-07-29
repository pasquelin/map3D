import { describe, expect, it } from 'vitest'
import { dashedStrokeMaterial, edgeMaterial, fillMaterial, strokeMaterial, volumeMaterial } from './geometry'

/**
 * Le test de profondeur des matériaux PLATS est une politique de vue, décidée par le
 * moteur et lue à la CONSTRUCTION (cf. `flatMaterial`).
 *
 * Ce qui est verrouillé ici n'est pas une valeur mais l'absence de valeur en dur : un
 * défaut recodé dans la fabrique rendrait à nouveau impossible de tenir le réglage, les
 * drapes étant reconstruits à tout instant par le resettle LOD.
 */
describe('profondeur des matériaux plats', () => {
  it('honore la politique demandée, dans les deux sens', () => {
    expect(fillMaterial(0x2e7cf6, false, 0.1).depthTest).toBe(false)
    expect(fillMaterial(0x2e7cf6, true, 0.1).depthTest).toBe(true)
    expect(strokeMaterial(0x2e7cf6, false).depthTest).toBe(false)
    expect(strokeMaterial(0x2e7cf6, true).depthTest).toBe(true)
    const dashOpts = { opacity: 1, dash: 0, gap: 0, gapOpacity: 0.3 }
    expect(dashedStrokeMaterial([0x2e7cf6], { ...dashOpts, depthTest: false }).depthTest).toBe(false)
    expect(dashedStrokeMaterial([0x2e7cf6], { ...dashOpts, depthTest: true }).depthTest).toBe(true)
  })

  it('n’écrit jamais la profondeur, quelle que soit la politique', () => {
    // Sans quoi les faces d'une même annotation translucide s'occulteraient entre elles.
    expect(fillMaterial(0xffffff, true, 0.5).depthWrite).toBe(false)
    expect(strokeMaterial(0xffffff, true).depthWrite).toBe(false)
  })

  it('laisse volumes et arêtes tester la profondeur en toute circonstance', () => {
    // Ils ne suivent PAS la politique des surfaces plates : un volume doit toujours être
    // occulté par le bâti qui passe devant lui. Les confondre est ce qui rendait le
    // balayage global faux en sortie de mode piéton.
    expect(volumeMaterial(0xffffff, 0.2).depthTest).toBe(true)
    expect(edgeMaterial(0xffffff).depthTest).toBe(true)
  })
})
