import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'

/** Point d'entrée de la démo (cf. `index.html`) : rien d'autre que le montage. */
const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
