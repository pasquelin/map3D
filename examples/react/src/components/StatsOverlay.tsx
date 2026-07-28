import type { MapEngine } from 'map3d'
import { useEffect, useRef } from 'react'
import Stats from 'stats.js'

/** Triangles/appels lisibles : 1 234 567 → « 1.2M », 12 345 → « 12.3k ». */
const fmt = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n)

/**
 * Moniteur de performance, monté en haut à droite de la carte.
 *
 * FPS / ms / Mo via stats.js (un panneau à la fois, clic pour cycler), complété par
 * les compteurs `renderer.info` de three.js — appels de rendu, triangles, géométries,
 * textures — que stats.js n'expose pas.
 *
 * La mesure reste EXTERNE au moteur : on ne se greffe pas dans sa boucle, on pilote
 * notre propre `requestAnimationFrame` et on LIT le renderer public (`engine.renderer`).
 * Aucune API de la lib n'est touchée.
 *
 * Monté en enfant de `<Map>` (comme `DrawDebug`), il atterrit dans `.m3d-root`
 * (`position:relative`) — d'où l'ancrage absolu en bas à droite, loin de la barre
 * d'outils (à gauche) et des contrôles de navigation (en haut à droite).
 */
export function StatsOverlay({ engine }: { engine: MapEngine | null }) {
  // Latest ref : le moteur arrive APRÈS le premier render (capté à `ready`), mais la
  // boucle rAF n'est montée qu'une fois. Elle lit toujours la dernière valeur sans se
  // relancer — le motif assumé de la lib, plutôt qu'une dépendance qui recréerait la boucle.
  const engineRef = useRef(engine)
  engineRef.current = engine

  const hostRef = useRef<HTMLDivElement>(null)
  const infoRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const info = infoRef.current
    if (!host || !info) return

    const stats = new Stats()
    stats.showPanel(0) // 0 : FPS (le panneau ms/Mo se rejoint au clic)
    // stats.js se pose en `fixed` coin haut-gauche par défaut : on le REND relatif pour
    // l'empiler dans notre conteneur ancré à droite, et cliquable au-dessus de la carte.
    stats.dom.style.position = 'relative'
    stats.dom.style.cursor = 'pointer'
    stats.dom.style.pointerEvents = 'auto'
    host.prepend(stats.dom)

    let raf = 0
    let lastInfo = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      stats.update()
      // Les compteurs three.js bougent lentement : ~4 Hz suffit et évite de brasser le
      // DOM 60 fois par seconde. Le canvas de stats.js, lui, tourne à pleine cadence.
      if (t - lastInfo < 250) return
      lastInfo = t
      const r = engineRef.current?.renderer
      info.textContent = r
        ? `calls ${r.info.render.calls}\ntris  ${fmt(r.info.render.triangles)}\ngeom  ${r.info.memory.geometries}\ntex   ${r.info.memory.textures}`
        : '— en attente —'
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      stats.dom.remove()
    }
  }, [])

  return (
    // `pointerEvents:none` sur le conteneur laisse les gestes carte passer sous le bloc
    // de compteurs ; seul le panneau stats.js le réactive pour rester cliquable.
    <div
      ref={hostRef}
      style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      <pre
        ref={infoRef}
        style={{
          margin: 0,
          padding: 8,
          font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#0ff',
          background: 'rgba(0,0,0,.8)',
          whiteSpace: 'pre',
        }}
      >
        — en attente —
      </pre>
    </div>
  )
}
