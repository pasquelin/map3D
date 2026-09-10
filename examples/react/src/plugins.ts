import type { AnyPlugin } from '@pasquelin/map3d'

import { WINDY_API_KEY } from './config/env'

/* ══════════════════ PLUGINS OFFICIELS — OPTIONNELS ══════════════════
   Les plugins (geopf, windy, plan-3d) vivent dans un AUTRE dépôt, `plugingsMap3D`, attendu
   en voisin de celui-ci (`../plugingsMap3D`, cf. `examples/react/README.md`). Un clone frais
   de map3D ne l'a pas — et l'exemple doit compiler ET tourner sans lui.

   D'où `import.meta.glob` plutôt qu'un `import` statique ou un `import()` littéral : Vite
   résout ces deux-là à la transformation et ÉCHOUE quand le module manque (en dev comme au
   build). Un glob, lui, ne fait qu'énumérer ce qui existe : zéro fichier trouvé = un objet
   vide, et l'exemple démarre sans plugin. Quand le dépôt est là, chaque entrée est un import
   dynamique paresseux — les sources du plugin ne pèsent rien tant qu'on ne les demande pas.

   Les patterns sont relatifs à CE fichier, comme l'exige `import.meta.glob`. */

/** Ce que l'exemple consomme réellement de chaque paquet : une fabrique de plugin. */
type PluginFactory = (init?: { apiKey?: string }) => AnyPlugin

/** Un module trouvé par le glob (au plus un par pattern) et ce qu'on passe à sa fabrique. */
type OptionalPlugin = {
  modules: Record<string, () => Promise<PluginFactory>>
  init?: { apiKey?: string }
}

/**
 * Trois patterns et non un seul `{geopf,windy,plan-3d}` : `import` nomme l'export à
 * prendre, et il diffère d'un paquet à l'autre.
 */
const OPTIONAL_PLUGINS: readonly OptionalPlugin[] = [
  {
    modules: import.meta.glob<PluginFactory>('../../../../plugingsMap3D/packages/geopf/src/index.ts', {
      import: 'geopfBatiments',
    }),
  },
  {
    modules: import.meta.glob<PluginFactory>('../../../../plugingsMap3D/packages/windy/src/index.ts', {
      import: 'windyWebcams',
    }),
    // `init.apiKey` seede le champ `apiKey` du hub des plugins — modifiable ensuite dedans.
    init: { apiKey: WINDY_API_KEY },
  },
  {
    modules: import.meta.glob<PluginFactory>('../../../../plugingsMap3D/packages/plan-3d/src/index.ts', {
      import: 'plan3d',
    }),
  },
]

/** `true` dès qu'un des trois paquets a été trouvé — de quoi le dire dans le panneau. */
export const OPTIONAL_PLUGINS_FOUND = OPTIONAL_PLUGINS.some((p) => Object.keys(p.modules).length > 0)

/**
 * Charge les plugins trouvés. Un paquet qui casse au chargement (dépendance manquante,
 * erreur de build) n'entraîne pas les autres : il est signalé en console et ignoré.
 */
export async function loadOptionalPlugins(): Promise<AnyPlugin[]> {
  const settled = await Promise.allSettled(
    OPTIONAL_PLUGINS.map(async ({ modules, init }) => {
      const load = Object.values(modules)[0]
      if (!load) return null
      const factory = await load()
      return factory(init)
    }),
  )
  const plugins: AnyPlugin[] = []
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      if (r.value) plugins.push(r.value)
    } else console.warn('[plugins] plugin optionnel ignoré :', r.reason)
  }
  return plugins
}
