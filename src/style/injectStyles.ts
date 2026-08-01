import { CSS_BASE } from './css/base'
import { CSS_MARKERS } from './css/markers'
import { CSS_RELATIONS } from './css/relations'
import { CSS_SELECTION } from './css/selection'
import { CSS_TOOLTIPS } from './css/tooltips'
import { CSS_PANELS } from './css/panels'
import { CSS_CHASSIS } from './css/chassis'
import { CSS_DRAW_STYLE } from './css/drawStyle'
import { CSS_SETTINGS } from './css/settings'
import { CSS_LAYERS } from './css/layers'
import { CSS_CATALOG } from './css/catalog'
import { CSS_TEMPLATES } from './css/templates'
import { CSS_CONFIRM } from './css/confirm'
import { CSS_READOUT } from './css/readout'
import { CSS_SEARCH } from './css/search'
import { CSS_MENU } from './css/menu'
import { CSS_DRAG } from './css/drag'
import { CSS_DOCK } from './css/dock'
import { CSS_LENS } from './css/lens'
import { CSS_MARKER_LIST } from './css/markerList'
import { CSS_SYMBOLS } from './css/symbols'
import { CSS_TOGGLES } from './css/toggles'
import { CSS_MOTION } from './css/motion'
import { CSS_WATERMARK } from './css/watermark'

const STYLE_ID = 'm3d-styles'

/**
 * Injecte **une seule fois** par document une feuille scopée sous `.m3d-root`.
 * Aucun style global n'est posé ailleurs. SSR-safe : appelée depuis un effet,
 * jamais au niveau module. Une feuille déjà présente mais périmée (HMR en dev,
 * mise à jour de la lib sur page ouverte) est resynchronisée — sinon les
 * nouveaux composants s'affichent sans leurs styles. Comparaison de chaîne
 * directe : appelée seulement au montage d'un `<Map>`, et sûre cross-realm
 * (iframe/popup), contrairement à un `instanceof HTMLElement`.
 */
export function injectStyles(doc: Document = document): void {
  const existing = doc.getElementById(STYLE_ID)
  if (existing) {
    if (existing.textContent !== CSS) existing.textContent = CSS
    return
  }
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}

// HMR (dev) : re-synchronise la feuille dès que ce module change, sinon les
// styles ne suivraient qu'au prochain montage de `<Map>` (il faut sinon un reload
// complet à chaque retouche CSS). No-op en build : `import.meta.hot` est absent.
//
// C'est le module NEUF qu'on appelle, jamais `injectStyles` directement : ce
// callback appartient à l'ancien module, sa closure capture donc l'ANCIENNE
// constante `CSS`. L'appeler réécrivait la feuille d'avant la modification —
// autrement dit le HMR annulait précisément ce qu'il devait propager, et le
// symptôme (« mon CSS ne bouge pas ») semblait venir du navigateur.
type StyleModule = { injectStyles: (doc?: Document) => void }
const hot = (import.meta as ImportMeta & { hot?: { accept: (cb: (mod?: StyleModule) => void) => void } }).hot
if (hot) hot.accept((mod) => mod?.injectStyles())

// Assemblage dans l'ORDRE d'origine du template literal éclaté (cf. src/style/css/*.ts) —
// la concaténation reproduit octet pour octet l'ancienne constante CSS monolithique.
const CSS =
  CSS_BASE +
  CSS_MARKERS +
  CSS_RELATIONS +
  CSS_SELECTION +
  CSS_TOOLTIPS +
  CSS_PANELS +
  CSS_CHASSIS +
  CSS_DRAW_STYLE +
  CSS_SETTINGS +
  CSS_LAYERS +
  CSS_CATALOG +
  CSS_TEMPLATES +
  CSS_CONFIRM +
  CSS_READOUT +
  CSS_SEARCH +
  CSS_MENU +
  CSS_DRAG +
  CSS_DOCK +
  CSS_LENS +
  CSS_MARKER_LIST +
  CSS_SYMBOLS +
  CSS_TOGGLES +
  CSS_MOTION +
  CSS_WATERMARK
