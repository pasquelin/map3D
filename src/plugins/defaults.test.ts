import { describe, expect, it } from 'vitest'
import type { PluginField } from './types'
import { defaultsOf, filterKnown, partialOf, resolveConfig } from './defaults'

const schema: readonly PluginField[] = [
  { key: 'apiKey', type: 'string', default: '', label: 'API Key', secret: true },
  { key: 'max', type: 'number', default: 50, label: 'Maximum', min: 1, max: 100 },
  { key: 'live', type: 'boolean', default: true, label: 'Live' },
  { key: 'size', type: 'select', default: 'preview', label: 'Size', options: { thumbnail: 'T', preview: 'P' } },
]

describe('defaultsOf', () => {
  it("construit l'objet de config initial depuis les défauts du schéma", () => {
    expect(defaultsOf(schema)).toEqual({ apiKey: '', max: 50, live: true, size: 'preview' })
  })
  it('schéma absent → objet vide', () => {
    expect(defaultsOf(undefined)).toEqual({})
  })
})

describe('partialOf', () => {
  it("ne garde que l'écart aux défauts", () => {
    expect(partialOf({ apiKey: 'k', max: 50, live: false, size: 'preview' }, schema)).toEqual({
      apiKey: 'k',
      live: false,
    })
  })
})

describe('resolveConfig', () => {
  it("défauts ⊕ partiels dans l'ordre, ignore les clés inconnues du schéma", () => {
    expect(resolveConfig(schema, { max: 10, ghost: 1 }, { apiKey: 'k' })).toEqual({
      apiKey: 'k',
      max: 10,
      live: true,
      size: 'preview',
    })
  })
  it('le dernier partiel gagne', () => {
    expect(resolveConfig(schema, { max: 10 }, { max: 20 }).max).toBe(20)
  })
})

describe('filterKnown', () => {
  it('ne conserve que les clés présentes au schéma', () => {
    expect(filterKnown({ max: 3, ghost: 1 }, schema)).toEqual({ max: 3 })
  })
})
