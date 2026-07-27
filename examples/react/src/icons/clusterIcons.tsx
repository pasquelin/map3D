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
}

/**
 * Pictogramme d'un TYPE dans les satellites de cluster (viewBox 24, `currentColor`
 * fournie par la lib). Même décision que les sprites — elle vient du registre — mais
 * rendue en JSX, seule forme que cette API accepte.
 */
export const clusterTypeIcon = (type: string): ReactNode => GLYPHS[markerTypeSpec(type)?.glyph ?? 'warning']
