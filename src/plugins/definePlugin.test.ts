import { describe, expect, it } from 'vitest'
import { definePlugin } from './definePlugin'

describe('definePlugin', () => {
  it('renvoie la définition telle quelle (identité) et infère la config', () => {
    const p = definePlugin({
      meta: { id: 'demo', name: 'Démo', icon: 'M', version: '1.0.0' },
      config: [{ key: 'live', type: 'boolean', default: true, label: 'En direct' }] as const,
      data: {
        fetch: (ctx) => {
          // ctx.config.live est typé boolean (vérifié à la compilation)
          const on: boolean = ctx.config.live
          return on ? [] : []
        },
      },
    })
    expect(p.meta.id).toBe('demo')
    expect(p.config?.[0]?.key).toBe('live')
  })
})
