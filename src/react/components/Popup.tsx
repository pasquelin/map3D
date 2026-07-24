import type { ReactNode } from 'react'

export type PopupProps = { children: ReactNode }

/** Bulle d'information (InfoWindow). Positionnée par le nœud parent. */
export function Popup({ children }: PopupProps) {
  return (
    <div className="m3d-popup">
      <div className="m3d-popup-inner">{children}</div>
    </div>
  )
}
