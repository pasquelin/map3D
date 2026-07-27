import type { ReactNode } from 'react'

import { type Glyph, markerTypeSpec } from '../config/markerTypes'

const text = (s: string): ReactNode => (
  <text x={12} y={12.5} textAnchor="middle" dominantBaseline="central" fontSize={17} fontWeight={800} fill="currentColor">
    {s}
  </text>
)

const GLYPHS: Record<Glyph, ReactNode> = {
  shield: <path d="M12 4.2l7 2.45v4.3c0 4.2-2.95 7.15-7 8.35-4.05-1.2-7-4.15-7-8.35V6.65z" fill="currentColor" />,
  dot: <circle cx={12} cy={12} r={4} fill="currentColor" />,
  warning: text('!'),
  info: text('i'),
  heart: <path d="M12 18c-2.9-2-4.7-3.9-4.7-6.1 0-1.6 1.2-2.8 2.6-2.8 1 0 1.8.5 2.1 1.3.3-.8 1.1-1.3 2.1-1.3 1.4 0 2.6 1.2 2.6 2.8 0 2.2-1.8 4.1-4.7 6.1z" fill="currentColor" />,
}

/**
 * Pictogramme d'un TYPE dans les satellites de cluster (viewBox 24, `currentColor`
 * fournie par la lib). Même décision que les sprites — elle vient du registre — mais
 * rendue en JSX, seule forme que cette API accepte.
 */
export const clusterTypeIcon = (type: string): ReactNode => GLYPHS[markerTypeSpec(type)?.glyph ?? 'warning']
