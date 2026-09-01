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
import { existsSync } from 'node:fs'
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
// `meta` décrit la LANGUE (code, nom natif, sens de lecture) et non le contenu : une
// entrée `dir` présente sur le seul arabe n'est pas un désaccord de traduction.
const traduisible = (k) => !k.startsWith('meta.')
const referenceKeys = keysOf(reference).filter(traduisible)
for (const locale of locales) {
  const missing = referenceKeys.filter((k) => lookup(locale, k) === undefined)
  const extra = keysOf(locale).filter(traduisible).filter((k) => !referenceKeys.includes(k))
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

  // Les liens du sélecteur restent RELATIFS là où les hreflang sont absolus : ils
  // doivent marcher servis depuis n'importe où (preview locale, fork, domaine custom),
  // alors que les hreflang exigent l'URL canonique.
  const root = dir ? '../' : ''
  const langSwitch =
    `<details class="langs"><summary class="langs__current" title="${attr(locale.nav.languageLabel)}">` +
    `<span>${locale.meta.short}</span></summary>` +
    `<ul class="langs__menu" aria-label="${attr(locale.nav.languageLabel)}">` +
    locales
      .map((l) => {
        const courant = l.meta.lang === lang
        const contenu = `<i lang="${l.meta.lang}">${l.meta.name}</i><b>${l.meta.short}</b>`
        return courant
          ? `<li><span class="langs__item" aria-current="true">${contenu}</span></li>`
          : `<li><a class="langs__item" href="${root}${pathOf(l.meta.lang)}" lang="${l.meta.lang}" hreflang="${l.meta.lang}">${contenu}</a></li>`
      })
      .join('') +
    '</ul></details>'

  // Données structurées : c'est ce qui permet à un moteur de comprendre qu'il a affaire
  // à une bibliothèque logicielle, pas à une page quelconque.
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: 'map3d',
    description: locale.head.description,
    inLanguage: lang,
    url: `${site}${dir}`,
    codeRepository: 'https://github.com/pasquelin/map3D',
    programmingLanguage: 'TypeScript',
    runtimePlatform: 'React 19, three.js',
    license: 'https://polyformproject.org/licenses/noncommercial/1.0.0/',
    version,
    author: { '@type': 'Person', name: 'Alban Pasquelin' },
  })

  const localeAlternates = locales
    .filter((l) => l.meta.lang !== lang)
    .map((l) => `<meta property="og:locale:alternate" content="${l.meta.ogLocale}" />`)
    .join('\n    ')

  const values = {
    lang,
    // `dir` vient du dictionnaire : c'est une propriété de la LANGUE, pas du gabarit.
    dir: locale.meta.dir ?? 'ltr',
    docs: locale.meta.docs,
    root,
    version,
    alternates,
    langSwitch,
    jsonld,
    ogLocale: locale.meta.ogLocale,
    localeAlternates,
  }

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
// `bg.js` est bundlé à part (`pnpm build:site`) et non versionné : sans lui la page
// s'affiche très bien, mais sans décor — autant que le log le dise.
if (!existsSync(join(out, 'assets', 'bg.js'))) {
  console.warn('  ⚠ assets/bg.js absent — décor non compilé (`pnpm build:site`)')
}
// Sans ce fichier, Pages passe la sortie dans Jekyll et ignore tout nom en `_`.
await writeFile(join(out, '.nojekyll'), '')

const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
  locales
    .map((l) => {
      const liens = locales
        .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.meta.lang}" href="${site}${pathOf(a.meta.lang)}"/>`)
        .join('\n')
      return `  <url>\n    <loc>${site}${pathOf(l.meta.lang)}</loc>\n${liens}\n  </url>`
    })
    .join('\n') +
  '\n</urlset>\n'
await writeFile(join(out, 'sitemap.xml'), sitemap.replace('www.sitemap.org', 'www.sitemaps.org'))
await writeFile(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}sitemap.xml\n`)

console.log(`Vitrine rendue dans ${out} (${locales.length} langues, base ${site})`)
