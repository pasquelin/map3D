import { type ReactNode, useState } from 'react'

export type MenuItem =
  | { separator: true }
  | {
      icon?: ReactNode
      label: string
      onSelect?: () => void
      children?: MenuItem[]
      separator?: false
    }

export type ContextMenuProps = {
  items: MenuItem[]
  header?: ReactNode
  onClose: () => void
}

type LevelProps = { items: MenuItem[]; onClose: () => void }

/** Liste d'items d'un niveau (sans panneau) — récursif pour les sous-menus. */
function MenuLevel({ items, onClose }: LevelProps) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      {items.map((it, i) => {
        if (it.separator) return <div className="m3d-menu-sep" key={`sep-${i}`} />
        const hasChildren = !!it.children?.length
        return (
          <div
            key={it.label + i}
            className="m3d-menu-item"
            role="menuitem"
            tabIndex={0}
            // Ouvre le sous-menu au survol et ferme les frères de même niveau.
            onPointerEnter={() => setOpen(hasChildren ? i : null)}
            onClick={(e) => {
              e.stopPropagation()
              if (!hasChildren) {
                it.onSelect?.()
                onClose()
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !hasChildren) {
                it.onSelect?.()
                onClose()
              }
            }}
          >
            {it.icon && <span className="m3d-menu-icon">{it.icon}</span>}
            <span className="m3d-menu-label">{it.label}</span>
            {hasChildren && <span className="m3d-menu-arrow">›</span>}
            {hasChildren && open === i && (
              <div className="m3d-menu-sub m3d-menu-panel">
                <MenuLevel items={it.children!} onClose={onClose} />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

/** Menu contextuel arborescent (profondeur illimitée, ouverture au survol). */
export function ContextMenu({ items, header, onClose }: ContextMenuProps) {
  return (
    <div className="m3d-menu-panel" role="menu">
      {header && (
        <div style={{ padding: '8px 10px 9px', borderBottom: '1px solid var(--m3d-border)', marginBottom: 4 }}>
          {header}
        </div>
      )}
      <MenuLevel items={items} onClose={onClose} />
    </div>
  )
}
