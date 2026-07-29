import { mdiPuzzleOutline } from '@mdi/js'
import { useLabels } from '../context'
import { usePlugins } from '../hooks/usePlugins'
import { useAnchoredPanel } from './panelFit'
import { PluginHubPanel } from './PluginHubPanel'
import { ToolButton } from './ToolButton'
import { useToolbar } from './Toolbar'
import { useCloseWhenHidden } from './useDismiss'

/**
 * Bouton natif du hub « Plugins », rendu dans la `Toolbar` (slot `plugins`). Masqué s'il
 * n'y a AUCUN plugin enregistré. Flyout ancré (modèle `SelectToolButton`), se referme au
 * repli de la barre ou quand une autre surface native prend la main.
 *
 * `open` est CONTRÔLÉ par la `Toolbar` (pas de `useState` local) : le bouton Naviguer a
 * besoin de savoir si le hub est ouvert pour rester inactif — un état invisible depuis la
 * barre laisserait Naviguer ET le hub allumés en même temps.
 */
export function PluginHubButton({
  position,
  open,
  onOpenChange,
}: {
  position: 'left' | 'right'
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const bar = useToolbar()
  const labels = useLabels()
  const { plugins } = usePlugins()
  const [side, setFlyout] = useAnchoredPanel(position, { clampHeight: false })
  useCloseWhenHidden(bar.retracted || bar.nativeActive, () => onOpenChange(false))
  if (plugins.length === 0) return null
  return (
    <>
      <ToolButton
        icon={mdiPuzzleOutline}
        label={labels.plugins.button}
        active={open}
        onClick={() => {
          if (!open) bar.claim()
          onOpenChange(!open)
        }}
      />
      {open && (
        // Suffixe de côté `m3d-${side}` — convention des flyouts (cf. `.m3d-flyout.m3d-left/right`
        // dans `injectStyles.ts`), pas `m3d-flyout-${side}` qui ne correspond à aucune règle CSS.
        <div ref={setFlyout} className={`m3d-panel m3d-flyout m3d-${side}`}>
          <PluginHubPanel />
        </div>
      )}
    </>
  )
}
