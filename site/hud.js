/*
 * Altimètre de la marge gauche. Chaque section porte son altitude en mètres
 * (`data-alt`) ; on interpole entre deux sections consécutives sur une échelle
 * LOGARITHMIQUE, parce que c'est ainsi qu'on lit une altitude de carte : passer de
 * 12 000 km à 400 km compte autant que passer de 120 m à 1,7 m.
 *
 * Lecture au scroll, écriture après — même discipline que le moteur : on relève les
 * mesures, puis on écrit dans le DOM une seule fois, sous rAF.
 */
;(() => {
  const cursor = document.querySelector('[data-altimeter-cursor]')
  const value = document.querySelector('[data-altimeter-value]')
  const unit = document.querySelector('.altimeter__unit')
  if (!cursor || !value || !unit) return

  const sections = [...document.querySelectorAll('[data-alt]')]
  if (sections.length < 2) return

  const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

  /** Repères (position verticale du haut de section, altitude) recalculés au resize. */
  let marks = []

  function measure() {
    marks = sections.map((el) => ({
      y: el.getBoundingClientRect().top + window.scrollY,
      alt: Number(el.dataset.alt),
    }))
  }

  function altitudeAt(y) {
    const first = marks[0]
    const last = marks[marks.length - 1]
    if (y <= first.y) return first.alt
    if (y >= last.y) return last.alt

    for (let i = 0; i < marks.length - 1; i++) {
      const a = marks[i]
      const b = marks[i + 1]
      if (y >= a.y && y <= b.y) {
        const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y)
        return Math.exp(Math.log(a.alt) + t * (Math.log(b.alt) - Math.log(a.alt)))
      }
    }
    return last.alt
  }

  let queued = false

  function render() {
    queued = false

    const scrollable = document.documentElement.scrollHeight - window.innerHeight
    const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0
    const metres = altitudeAt(window.scrollY + window.innerHeight / 2)

    cursor.style.top = `${progress * 100}%`
    if (metres >= 1000) {
      // Sous 10 km, l'entier seul écrase la descente (1 400 m et 1 900 m afficheraient
      // le même « 1 ») : on garde une décimale tant que le chiffre des km est unique.
      const km = metres / 1000
      value.textContent = format.format(km < 10 ? Math.round(km * 10) / 10 : Math.round(km))
      unit.textContent = 'km'
    } else {
      value.textContent = format.format(metres < 10 ? Math.round(metres * 10) / 10 : Math.round(metres))
      unit.textContent = 'm'
    }
  }

  function schedule() {
    if (queued) return
    queued = true
    requestAnimationFrame(render)
  }

  measure()
  render()
  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', () => {
    measure()
    schedule()
  })
})()

/*
 * Flèches du rail de la galerie. Le défilement lui-même est natif (scroll-snap) : ces
 * boutons ne sont qu'un confort pour les souris sans axe horizontal, et ils
 * disparaissent quand tout le rail tient déjà à l'écran.
 */
;(() => {
  // Chaque rail cherche ses boutons DANS sa propre section : deux rails cohabitent,
  // un `querySelector` global ferait piloter le premier par les flèches du second.
  for (const rail of document.querySelectorAll('[data-rail]')) setup(rail)

  function setup(rail) {
  const scope = rail.closest('.section') ?? document
  const prev = scope.querySelector('[data-rail-prev]')
  const next = scope.querySelector('[data-rail-next]')
  if (!prev || !next) return

  const step = () => rail.querySelector('.rail__item')?.getBoundingClientRect().width ?? rail.clientWidth

  function sync() {
    const overflow = rail.scrollWidth - rail.clientWidth
    const nav = prev.parentElement
    if (nav) nav.hidden = overflow < 4
    prev.disabled = rail.scrollLeft < 4
    next.disabled = rail.scrollLeft >= overflow - 4
  }

  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  prev.addEventListener('click', () => rail.scrollBy({ left: -(step() + 18), behavior }))
  next.addEventListener('click', () => rail.scrollBy({ left: step() + 18, behavior }))
  rail.addEventListener('scroll', sync, { passive: true })
  addEventListener('resize', sync)
  sync()
  }
})()
