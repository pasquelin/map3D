#!/usr/bin/env node
/*
 * Rend la vitrine, une fois par langue, depuis le gabarit unique `site/template.html`
 * et les dictionnaires de `site/i18n/`.
 *
 * Un seul gabarit et non un fichier HTML par langue : en markdown la duplication se
 * relit (c'est le choix de `docs/`), en HTML elle dérive — une balise corrigée d'un
 * côté et oubliée de l'autre ne se voit pas. Ici la structure est commune par
 * construction, et ajouter une langue = déposer un JSON.
 *
 * Sortie : la langue par défaut à la racine, les autres dans leur dossier ISO 639-1,
 * comme `docs/fr` ↔ `docs/en`.
 *
 *   node site/build.mjs <dossier-de-sortie> [--site=https://hôte/chemin/]
 *
 * Node pur, zéro dépendance : cette page ne doit jamais avoir besoin d'un `install`.
 */
import { readFile, readdir, writeFile, mkdir, cp } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const DEFAULT_LANG = 'en'

const [outArg, ...flags] = process.argv.slice(2)
const out = resolve(process.cwd(), outArg ?? '_site')
const site = flags.find((f) => f.startsWith('--site='))?.slice('--site='.length) ?? 'https://pasquelin.github.io/map3D/'

/** Échappe ce qui part dans un attribut HTML — les libellés y côtoient des guillemets. */
const attr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** `a.b.c` → valeur, ou `undefined` si le chemin ne mène nulle part. */
const lookup = (dict, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), dict)

const locales = []
for (const file of (await readdir(join(HERE, 'i18n'))).filter((f) => f.endsWith('.json')).sort()) {
  locales.push(JSON.parse(await readFile(join(HERE, 'i18n', file), 'utf8')))
}
if (!locales.some((l) => l.meta.lang === DEFAULT_LANG)) {
  throw new Error(`Aucun dictionnaire pour la langue par défaut « ${DEFAULT_LANG} »`)
}

/* Parité des dictionnaires : une clé traduite d'un seul côté est une régression, pas
   une variante. On échoue au build plutôt que de publier un `{{...}}` visible. */
const keysOf = (node, prefix = '') =>
  Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === 'object' ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
const reference = locales.find((l) => l.meta.lang === DEFAULT_LANG)
const referenceKeys = keysOf(reference)
for (const locale of locales) {
  const missing = referenceKeys.filter((k) => lookup(locale, k) === undefined)
  const extra = keysOf(locale).filter((k) => !referenceKeys.includes(k))
  if (missing.length || extra.length) {
    throw new Error(
      `Dictionnaire « ${locale.meta.lang} » désaccordé avec « ${DEFAULT_LANG} » :` +
        (missing.length ? `\n  manquantes : ${missing.join(', ')}` : '') +
        (extra.length ? `\n  en trop : ${extra.join(', ')}` : ''),
    )
  }
}

const template = await readFile(join(HERE, 'template.html'), 'utf8')
const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))

/** Chemin public d'une langue, relatif à la racine du site. */
const pathOf = (lang) => (lang === DEFAULT_LANG ? '' : `${lang}/`)

for (const locale of locales) {
  const { lang } = locale.meta
  const dir = pathOf(lang)

  // Les autres langues déclarées aux moteurs de recherche, plus le repli x-default.
  const alternates = [
    ...locales.map((l) => `<link rel="alternate" hreflang="${l.meta.lang}" href="${site}${pathOf(l.meta.lang)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${site}" />`,
    `<link rel="canonical" href="${site}${dir}" />`,
  ].join('\n    ')

  // Le basculeur reste RELATIF là où les hreflang sont absolus : les liens doivent
  // marcher servis depuis n'importe où (preview locale, fork, domaine custom), alors
  // que les hreflang exigent l'URL canonique.
  const root = dir ? '../' : ''
  const langSwitch =
    `<span class="topbar__langs" role="group" aria-label="${attr(locale.nav.languageLabel)}">` +
    locales
      .map((l) =>
        l.meta.lang === lang
          ? `<span class="topbar__lang" aria-current="true">${l.meta.short}</span>`
          : `<a class="topbar__lang" href="${root}${pathOf(l.meta.lang)}" lang="${l.meta.lang}" hreflang="${l.meta.lang}">${l.meta.short}</a>`,
      )
      .join('') +
    '</span>'

  const values = { lang, docs: locale.meta.docs, root, version, alternates, langSwitch }

  const missing = []
  const html = template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const value = values[key] ?? lookup(locale, key)
    if (value === undefined) missing.push(key)
    // Les valeurs portent du balisage volontaire (<code>, <a>, <br />) : c'est notre
    // propre contenu, jamais une saisie extérieure.
    return value ?? ''
  })
  if (missing.length) throw new Error(`Clés absentes du dictionnaire « ${lang} » : ${[...new Set(missing)].join(', ')}`)

  await mkdir(join(out, dir), { recursive: true })
  await writeFile(join(out, dir, 'index.html'), html)
  console.log(`  ${dir || './'}index.html — ${locale.meta.name}`)
}

for (const asset of ['styles.css', 'hud.js', 'assets']) {
  await cp(join(HERE, asset), join(out, asset), { recursive: true })
}
// Sans ce fichier, Pages passe la sortie dans Jekyll et ignore tout nom en `_`.
await writeFile(join(out, '.nojekyll'), '')

console.log(`Vitrine rendue dans ${out} (${locales.length} langues, base ${site})`)
