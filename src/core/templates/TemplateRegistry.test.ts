import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TemplateRegistry } from './TemplateRegistry'
import type { Template } from './types'

const KEY = 'test:templates'
const emptyDraw = { type: 'FeatureCollection' as const, features: [] }

const tpl = (id: string, origin: Template['origin'] = 'local'): Template => ({
  id,
  name: id,
  origin,
  content: { draw: emptyDraw },
})

beforeEach(() => localStorage.clear())

describe('TemplateRegistry', () => {
  it('sauve, liste et relaie l’event save', () => {
    const reg = new TemplateRegistry(KEY, 0)
    const onSave = vi.fn()
    reg.onSave = onSave
    const v0 = reg.version
    reg.save(tpl('a'))
    expect(reg.list().map((t) => t.id)).toEqual(['a'])
    expect(reg.version).toBeGreaterThan(v0)
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('n’émet aucun event en mode silent (anti-écho API)', () => {
    const reg = new TemplateRegistry(KEY, 0)
    const onSave = vi.fn()
    reg.onSave = onSave
    reg.save(tpl('a'), { silent: true })
    expect(onSave).not.toHaveBeenCalled()
    expect(reg.get('a')).toBeDefined()
  })

  it('persiste UNIQUEMENT les templates locaux et les relit', () => {
    const reg = new TemplateRegistry(KEY, 0)
    reg.save(tpl('local-1', 'local'))
    reg.save(tpl('api-1', 'api'))
    reg.dispose() // flush la persistance débouncée

    const reloaded = new TemplateRegistry(KEY, 0)
    expect(reloaded.list().map((t) => t.id)).toEqual(['local-1'])
    expect(reloaded.get('local-1')?.origin).toBe('local')
  })

  it('remove supprime et relaie l’event', () => {
    const reg = new TemplateRegistry(KEY, 0)
    const onRemove = vi.fn()
    reg.onRemove = onRemove
    reg.save(tpl('a'))
    reg.remove('a')
    expect(reg.get('a')).toBeUndefined()
    expect(onRemove).toHaveBeenCalledWith('a')
  })

  it('setAll remplace toute la collection, silencieux par défaut (synchro API)', () => {
    const reg = new TemplateRegistry(KEY, 0)
    const onSave = vi.fn()
    reg.onSave = onSave
    reg.save(tpl('old'))
    onSave.mockClear()
    reg.setAll([tpl('api-1', 'api'), tpl('api-2', 'api')])
    expect(reg.list().map((t) => t.id)).toEqual(['api-1', 'api-2'])
    expect(onSave).not.toHaveBeenCalled()
  })

  it('rename change le nom et relaie save', () => {
    const reg = new TemplateRegistry(KEY, 0)
    const onSave = vi.fn()
    reg.save(tpl('a'))
    reg.onSave = onSave
    reg.rename('a', 'Nouveau nom')
    expect(reg.get('a')?.name).toBe('Nouveau nom')
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('notifyApply relaie sans muter l’état', () => {
    const reg = new TemplateRegistry(KEY, 0)
    const onApply = vi.fn()
    reg.onApply = onApply
    reg.notifyApply('a', 'replace')
    expect(onApply).toHaveBeenCalledWith('a', 'replace')
  })
})
