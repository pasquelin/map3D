import { Component, type CSSProperties, type ReactNode } from 'react'

import { clearStoredPartial } from '../config/configSchema'

/* ══════════════════ TRAPPE DE SECOURS DU BANC D'ESSAI ══════════════════
   Le panneau persiste ses réglages, et la carte les relit au montage suivant. Un réglage
   qui la fait échouer se rejouerait donc à chaque rechargement — et le bouton « Tout
   réinitialiser » vit DANS le panneau, c'est-à-dire derrière la panne. Sans cette
   trappe, la seule issue est de vider le stockage depuis la console.

   `loadStoredPartial` filtre déjà ce qui n'a pas la nature de sa feuille ; il reste ce
   qu'aucun filtre ne peut prévoir — une combinaison de valeurs pourtant valides une à
   une. C'est ce cas-là que cet écran attrape. Une application réelle mettrait la même
   chose autour de sa carte, à ceci près qu'elle n'aurait pas de réglages à oublier. */

type Props = { children: ReactNode }
type State = { error: Error | null }

export class MapErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error) {
    console.error('[map] montage impossible — réglages en cause ?', error)
  }

  override render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div role="alert" style={STYLES.host}>
        <h1 style={STYLES.title}>La carte n’a pas pu être montée</h1>
        <p style={STYLES.text}>
          Le banc d’essai relit les réglages du dernier montage : si l’un d’eux est en cause, les oublier remet la démo
          d’aplomb.
        </p>
        <pre style={STYLES.trace}>{error.message}</pre>
        <button
          type="button"
          style={STYLES.button}
          onClick={() => {
            clearStoredPartial()
            window.location.reload()
          }}
        >
          Oublier les réglages et recharger
        </button>
      </div>
    )
  }
}

/** En dur, et c'est voulu : cet écran doit s'afficher même si le thème est en cause. */
const STYLES = {
  host: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    padding: 32,
    flex: '1 1 0%',
    minWidth: 0,
    overflow: 'auto',
    font: '14px/1.5 system-ui, sans-serif',
    color: '#e2e8f0',
    background: '#0d1415',
  },
  title: { margin: 0, fontSize: 18, fontWeight: 600 },
  text: { margin: 0, maxWidth: '52ch', color: '#94a3b8' },
  trace: {
    margin: 0,
    padding: 12,
    maxWidth: '100%',
    overflowX: 'auto',
    borderRadius: 6,
    background: 'rgba(148,163,184,0.12)',
    color: '#f8b4b4',
  },
  button: {
    padding: '8px 14px',
    border: '1px solid rgba(148,163,184,0.35)',
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>
