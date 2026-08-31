import { describe, expect, it } from 'vitest'

import { drawToolsOf } from './MapSurfaces'

describe('drawToolsOf', () => {
  it('sans rien fourni, laisse la couche appliquer son défaut', () => {
    expect(drawToolsOf(undefined, undefined)).toBeUndefined()
  })

  it("retombe sur la barre quand `draw.tools` n'est pas fourni", () => {
    expect(drawToolsOf({}, { tools: ['select', 'polygon'] })).toEqual(['select', 'polygon'])
  })

  it('laisse dissocier affichage et autorisation quand les deux sont fournis', () => {
    expect(drawToolsOf({ tools: ['polygon'] }, { tools: ['select', 'polygon'] })).toEqual(['polygon'])
  })

  it('respecte une liste vide explicite plutôt que de la traiter comme absente', () => {
    expect(drawToolsOf({ tools: [] }, { tools: ['polygon'] })).toEqual([])
  })

  it('sans barre, ne contraint rien', () => {
    expect(drawToolsOf({}, false)).toBeUndefined()
  })

  it('sans dessin, ne rend aucun outil', () => {
    expect(drawToolsOf(false, { tools: ['polygon'] })).toBeUndefined()
  })
})
