import type { PluginField } from '../../plugins/types'

/**
 * Auto-rendu des contrôles depuis le schéma déclaratif (D4). Contrôles DOM natifs thémés
 * (classes `m3d-*`), aucune dépendance externe. `secret` → `type=password`, jamais copié.
 * Rendu à l'identique dans le hub (lib) et le dev panel (exemple) — même source, le schéma.
 */
export function PluginConfigControls({
  schema,
  config,
  onChange,
}: {
  schema: readonly PluginField[]
  config: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}) {
  return (
    <div className="m3d-plugin-config">
      {schema.map((f) => (
        <label key={f.key} className="m3d-plugin-field" title={f.help}>
          <span className="m3d-plugin-field-label">{f.label}</span>
          {renderControl(f, config[f.key], (v) => onChange({ [f.key]: v }))}
        </label>
      ))}
    </div>
  )
}

function renderControl(field: PluginField, value: unknown, set: (v: unknown) => void) {
  switch (field.type) {
    case 'boolean':
      return (
        <input
          type="checkbox"
          className="m3d-plugin-checkbox"
          checked={Boolean(value)}
          onChange={(e) => set(e.target.checked)}
        />
      )
    case 'number':
      return (
        <span className="m3d-plugin-number">
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={Number(value)}
            onChange={(e) => set(e.target.valueAsNumber)}
          />
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={Number(value)}
            onChange={(e) => set(e.target.valueAsNumber)}
          />
        </span>
      )
    case 'string':
      return (
        <input
          type={field.secret ? 'password' : 'text'}
          className="m3d-plugin-input"
          placeholder={field.placeholder}
          value={String(value ?? '')}
          // secret : autocomplete off, jamais dans le presse-papier/logs
          autoComplete={field.secret ? 'off' : undefined}
          onChange={(e) => set(e.target.value)}
        />
      )
    case 'select':
      return (
        <select className="m3d-plugin-select" value={String(value)} onChange={(e) => set(e.target.value)}>
          {Object.entries(field.options).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      )
  }
}
