/**
 * Régénère le « jeu complet de libellés » de `docs/fr/LABELS.md` et `docs/en/LABELS.md`
 * depuis `src/labels/defaultLabels.ts`, et vérifie que les deux références restent le
 * miroir de la source.
 *
 * Généré et non écrit : le bloc tenu à la main couvrait 8 groupes sur 33 et n'existait
 * que d'un côté. Ici le même objet est rendu dans les deux langues, entre deux marqueurs
 * HTML, et `--check` échoue s'il a dérivé — comme `make-llms.mjs` pour `llms-full.txt`.
 *
 * Il n'y a pas de jeu anglais dans la source : le bloc est le jeu FRANÇAIS livré, à
 * copier puis traduire. Les fonctions (`plural`) sont rendues par leur source.
 *
 * `--check` vérifie aussi ce que la génération ne couvre pas, la partie manuelle :
 *   - FR et EN ont les mêmes sections `## `, dans le même ordre ;
 *   - chaque clé de `defaultLabels` est documentée dans les deux langues ;
 *   - chaque clé documentée existe encore dans `defaultLabels` (pas de libellé fantôme).
 *
 *   node scripts/make-labels-doc.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const SOURCE = 'src/labels/defaultLabels.ts'
const DOCS = ['docs/fr/LABELS.md', 'docs/en/LABELS.md']
const START = '<!-- labels:full:start -->'
const END = '<!-- labels:full:end -->'

/**
 * Le fichier est du TypeScript, mais sans enum ni namespace, et son seul import est un
 * `import type` : une fois les types retirés, il s'évalue seul, sans loader ni dépendance.
 * `stripTypeScriptTypes` (Node ≥ 22.13) évite le drapeau `--experimental-strip-types`.
 */
async function chargerDefaults() {
  const ts = readFileSync(resolve(root, SOURCE), 'utf8')
  const js = stripTypeScriptTypes(ts)
  const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`)
  return module.defaultLabels
}

/** Règle Prettier : guillemets simples, sauf si la chaîne en contient sans contenir de doubles. */
function chaine(s) {
  const corps = s.replace(/\\/g, '\\\\')
  if (corps.includes("'") && !corps.includes('"')) return `"${corps}"`
  return `'${corps.replace(/'/g, "\\'")}'`
}

const IDENT = /^[A-Za-z_$][\w$]*$/
const cle = (k) => (IDENT.test(k) ? k : chaine(k))

function rendre(valeur, indent) {
  if (typeof valeur === 'string') return chaine(valeur)
  if (typeof valeur === 'function') {
    // La source est déjà du JS (types retirés) ; on la ré-indente sous la clé courante.
    return String(valeur)
      .split('\n')
      .map((l, i) => (i === 0 ? l : indent + l))
      .join('\n')
  }
  if (Array.isArray(valeur)) return `[${valeur.map((v) => rendre(v, indent)).join(', ')}]`
  if (valeur && typeof valeur === 'object') {
    const entrees = Object.entries(valeur)
    if (entrees.length === 0) return '{}'
    const dedans = indent + '  '
    return `{\n${entrees.map(([k, v]) => `${dedans}${cle(k)}: ${rendre(v, dedans)},\n`).join('')}${indent}}`
  }
  return String(valeur)
}

function bloc(labels) {
  return [
    '```ts',
    "import type { MapLabels } from '@pasquelin/map3d'",
    '',
    `export const labels: MapLabels = ${rendre(labels, '')}`,
    '```',
  ].join('\n')
}

/** Toutes les feuilles, en chemins pointés (`controls.pan`) — ce que la doc cite en première colonne. */
function feuilles(objet, prefixe = '') {
  return Object.entries(objet).flatMap(([k, v]) => {
    const chemin = prefixe ? `${prefixe}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) return feuilles(v, chemin)
    return [chemin]
  })
}

function existe(objet, chemin) {
  let courant = objet
  for (const seg of chemin.split('.')) {
    if (courant === null || typeof courant !== 'object' || !(seg in courant)) return false
    courant = courant[seg]
  }
  return true
}

/** Le texte hors marqueurs : c'est lui qu'on contrôle, le bloc généré ne se cite pas lui-même. */
function partieManuelle(texte) {
  return texte.replace(new RegExp(`${START}[\\s\\S]*?${END}`), '')
}

function clesDocumentees(texte) {
  const cles = new Set()
  for (const ligne of partieManuelle(texte).split('\n')) {
    if (!ligne.startsWith('| `')) continue
    const premiere = ligne.slice(1).split('|')[0]
    for (const [, k] of premiere.matchAll(/`([\w.-]+)`/g)) cles.add(k)
  }
  return cles
}

/** Une section par groupe, nommée par sa clé ; un titre en prose (traduit) ne compte que par sa position. */
function sections(texte) {
  return partieManuelle(texte)
    .split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => l.match(/^## `([^`]+)`/)?.[1] ?? '(prose)')
}

const check = process.argv.includes('--check')
const labels = await chargerDefaults()
const attendu = bloc(labels)
const erreurs = []

const textes = DOCS.map((doc) => {
  const chemin = resolve(root, doc)
  const texte = readFileSync(chemin, 'utf8')
  const a = texte.indexOf(START)
  const b = texte.indexOf(END)
  if (a === -1 || b === -1 || b < a) {
    erreurs.push(`${doc} : marqueurs ${START} / ${END} absents ou inversés.`)
    return { doc, texte }
  }
  const regenere = `${texte.slice(0, a + START.length)}\n${attendu}\n${texte.slice(b)}`
  if (check) {
    if (regenere !== texte) erreurs.push(`${doc} : le jeu complet de libellés est périmé.`)
  } else if (regenere !== texte) {
    writeFileSync(chemin, regenere)
    console.log(`${doc} : jeu complet écrit (${Object.keys(labels).length} groupes).`)
  }
  return { doc, texte: regenere }
})

// Parité entre les deux langues : mêmes sections, même ordre.
const [fr, en] = textes.map((t) => sections(t.texte))
if (fr.length !== en.length || fr.some((s, i) => s !== en[i])) {
  erreurs.push(
    `Sections FR (${fr.length}) et EN (${en.length}) diffèrent :\n  FR ${fr.join(', ')}\n  EN ${en.join(', ')}`,
  )
}

// Miroir de la source, dans les deux sens.
const source = new Set(feuilles(labels))
for (const { doc, texte } of textes) {
  const documentees = clesDocumentees(texte)
  const manquantes = [...source].filter((k) => !documentees.has(k))
  const fantomes = [...documentees].filter((k) => !existe(labels, k))
  if (manquantes.length) erreurs.push(`${doc} : clés de defaultLabels non documentées : ${manquantes.join(', ')}`)
  if (fantomes.length) erreurs.push(`${doc} : clés documentées absentes de defaultLabels : ${fantomes.join(', ')}`)
}

if (erreurs.length) {
  for (const e of erreurs) console.error(e)
  if (check) console.error('Lancer `pnpm labels:doc`, corriger la partie manuelle, et versionner le résultat.')
  process.exit(1)
}

console.log(
  check ? 'LABELS.md (fr, en) à jour et en miroir de defaultLabels.' : 'LABELS.md (fr, en) en miroir de defaultLabels.',
)
