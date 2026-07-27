import { defaultConfig } from '../../config/defaultConfig'
import type { SymbolCatalog, SymbolEntry, SymbolRenderer, SymbolRenderOptions, RenderedSymbol } from '../types'

/**
 * Symbologie **MIL-STD-2525D** (SIDC 20 caractères) : catalogue prêt à l'emploi et
 * fournisseur de rendu adossé au SDK officiel `@armyc2.c5isr.renderer`.
 *
 * Le SDK pèse ~9 Mo : il est chargé par **import dynamique**, donc dans un chunk
 * séparé qui ne part qu'à la première carte qui l'utilise — un consommateur de
 * map3d qui n'affiche pas de symboles ne le télécharge jamais.
 */

/** Affiliation d'un symbole — c'est la `variant` du contrat `SymbolRenderer`. */
export type MilSymAffiliation = 'friendly' | 'hostile' | 'neutral' | 'unknown'

/**
 * Chiffre d'affiliation (« Standard Identity 2 ») du SIDC 2525D.
 *
 * Il occupe le **4e** chiffre, pas le 3e — celui-ci porte le *contexte* (0 réalité,
 * 1 exercice, 2 simulation). Écrire l'affiliation en 3e position produit un symbole
 * de contexte non standard : graphisme décoré, dimensions et **point d'ancrage
 * différents** (≈ 5 px de décalage vertical constaté), l'affiliation restant celle
 * du catalogue. C'est le bug de `applySidcAffiliation` côté operator
 * (`substring(0, 2) + char + substring(3)`), à ne pas reproduire à la migration.
 */
const AFFILIATION_CHAR: Record<MilSymAffiliation, string> = {
  friendly: '3',
  hostile: '6',
  neutral: '4',
  unknown: '1',
}

/** Couleur dominante de chaque affiliation (repérage dans une palette). */
export const MILSYM_AFFILIATION_COLORS: Record<MilSymAffiliation, string> = {
  friendly: '#00A8FF',
  hostile: '#FF3031',
  neutral: '#00E200',
  unknown: '#FFFF00',
}

/** Entrée du catalogue MIL-STD : une entrée générique + son SIDC. */
export type MilSymEntry = SymbolEntry & { sidc: string }

/** Applique une affiliation à un SIDC, sur le 4e chiffre (cf. `AFFILIATION_CHAR`). */
export function applyAffiliation(sidc: string, affiliation: MilSymAffiliation): string {
  return sidc.substring(0, 3) + AFFILIATION_CHAR[affiliation] + sidc.substring(4)
}

// 80 icônes ponctuelles, 11 graphiques tactiques
const ICONS: MilSymEntry[] = [
  { key: 'commandPost', sidc: '10031000001100000000', category: 'installations', label: 'Poste de commandement', description: 'PC / centre de commandement' },
  { key: 'medicalAidStation', sidc: '10031000001614000000', category: 'installations', label: 'Médical / PMA', description: 'Poste médical avancé / zone de soins' },
  { key: 'hospital', sidc: '10032000001207020000', category: 'installations', label: 'Hôpital', description: 'Centre hospitalier / structure médicale' },
  { key: 'fireStation', sidc: '10032000001122010000', category: 'installations', label: 'Caserne de pompiers', description: 'Centre de secours / caserne' },
  { key: 'policeStation', sidc: '10032000001121070000', category: 'installations', label: 'Commissariat', description: 'Commissariat de police / gendarmerie' },
  { key: 'prison', sidc: '10032000001121080000', category: 'installations', label: 'Prison', description: 'Établissement pénitentiaire' },
  { key: 'emergencyOperations', sidc: '10032000001122020000', category: 'installations', label: 'Urgences', description: 'Centre opérationnel d’urgence' },
  { key: 'depot', sidc: '10032000001120000000', category: 'installations', label: 'Dépôt', description: 'Dépôt de matériel / stockage' },
  { key: 'fixedSite', sidc: '10032000001100000000', category: 'installations', label: 'Point fixe', description: 'Installation / point fixe générique' },
  { key: 'checkpoint', sidc: '10032500001303000000', category: 'installations', label: 'Checkpoint', description: 'Point de contrôle / barrage' },
  { key: 'entryControl', sidc: '10032500001309000000', category: 'installations', label: 'Point de contrôle entrée', description: 'Point de contrôle d’accès / filtrage' },
  { key: 'helipad', sidc: '10032000001213050000', category: 'installations', label: 'Héliport / DZ', description: 'Zone d’atterrissage hélicoptère' },
  { key: 'airport', sidc: '10032000001213010000', category: 'installations', label: 'Aéroport / Aérodrome', description: 'Aéroport / base aérienne' },
  { key: 'placeOfWorship', sidc: '10032000001210040000', category: 'installations', label: 'Lieu de culte', description: 'Institution religieuse' },
  { key: 'school', sidc: '10032000001204020000', category: 'installations', label: 'École', description: 'Établissement scolaire' },
  { key: 'governmentBuilding', sidc: '10032000001206000000', category: 'installations', label: 'Bâtiment gouvernemental', description: 'Site gouvernemental / mairie' },
  { key: 'telecom', sidc: '10032000001212020000', category: 'installations', label: 'Télécommunications', description: 'Infrastructure télécom / antenne' },
  { key: 'powerInfrastructure', sidc: '10032000001205010000', category: 'installations', label: 'Infrastructure électrique', description: 'Réseau électrique / transformateur' },
  { key: 'waterInfrastructure', sidc: '10032000001214100000', category: 'installations', label: 'Point eau', description: 'Infrastructure d’eau / château d’eau' },
  { key: 'indoorVenue', sidc: '10032000001210010000', category: 'installations', label: 'Lieu public fermé', description: 'Salle de spectacle / stade couvert' },
  { key: 'outdoorVenue', sidc: '10032000001210020000', category: 'installations', label: 'Lieu public ouvert', description: 'Stade / parc / lieu de rassemblement' },
  { key: 'station', sidc: '10032000001213070000', category: 'installations', label: 'Gare', description: 'Gare ferroviaire / routière' },
  { key: 'police', sidc: '10031000002007000000', category: 'units', label: 'Police', description: 'Unité de police / gendarmerie' },
  { key: 'fieldUnit', sidc: '10031000001200000000', category: 'units', label: 'Unité terrain', description: 'Unité générique au sol' },
  { key: 'engineering', sidc: '10031000001407000000', category: 'units', label: 'Génie / technique', description: 'Équipe technique / génie civil' },
  { key: 'logistics', sidc: '10031000001636000000', category: 'units', label: 'Logistique', description: 'Point logistique / ravitaillement' },
  { key: 'searchAndRescue', sidc: '10031000001418000000', category: 'units', label: 'Recherche et sauvetage', description: 'Équipe de recherche et sauvetage' },
  { key: 'firefighters', sidc: '10031000001410000000', category: 'units', label: 'Pompiers', description: 'Unité de lutte contre les incendies' },
  { key: 'medical', sidc: '10031000001613000000', category: 'units', label: 'Médical', description: 'Unité médicale / équipe de soins' },
  { key: 'security', sidc: '10031000001417000000', category: 'units', label: 'Sécurité', description: 'Unité de sécurité / protection' },
  { key: 'investigation', sidc: '10031000001403000000', category: 'units', label: 'Investigation', description: 'Investigation criminelle / police judiciaire' },
  { key: 'eod', sidc: '10031000001408000000', category: 'units', label: 'Déminage / EOD', description: 'Neutralisation explosifs / déminage' },
  { key: 'k9', sidc: '10031000001405000000', category: 'units', label: 'Équipe cynophile', description: 'Maître-chien / brigade canine' },
  { key: 'reconnaissance', sidc: '10031000001213000000', category: 'units', label: 'Reconnaissance', description: 'Équipe de reconnaissance / éclaireurs' },
  { key: 'civilianOrganization', sidc: '10031100001104000000', category: 'units', label: 'Organisation civile', description: 'Organisation / groupe civil (ONG, association)' },
  { key: 'civilianIndividual', sidc: '10031100001103000000', category: 'units', label: 'Individu civil', description: 'Personne civile identifiée' },
  { key: 'vehicle', sidc: '10031500001401000000', category: 'equipment', label: 'Véhicule', description: 'Véhicule d’intervention / utilitaire' },
  { key: 'ambulance', sidc: '10031500002301000000', category: 'equipment', label: 'Ambulance', description: 'Ambulance / véhicule médical' },
  { key: 'fireVehicle', sidc: '10031500002302000000', category: 'equipment', label: 'Véhicule pompiers', description: 'Véhicule de pompiers / incendie' },
  { key: 'policeVehicle', sidc: '10031500001707000000', category: 'equipment', label: 'Véhicule police', description: 'Véhicule de police / gendarmerie' },
  { key: 'bus', sidc: '10031500001405000000', category: 'equipment', label: 'Bus', description: 'Bus / transport collectif' },
  { key: 'civilianVehicle', sidc: '10031500001601000000', category: 'equipment', label: 'Véhicule civil', description: 'Automobile civile' },
  { key: 'medicalVehicle', sidc: '10031500001402000000', category: 'equipment', label: 'Véhicule médical', description: 'Véhicule médical (non ambulance)' },
  { key: 'transmissions', sidc: '10031000001110000000', category: 'equipment', label: 'Transmissions', description: 'Communications / relais radio' },
  { key: 'surveillance', sidc: '10031000001216000000', category: 'equipment', label: 'Surveillance', description: 'Poste de surveillance / observation' },
  { key: 'radar', sidc: '10031500002203000000', category: 'equipment', label: 'Radar', description: 'Radar / capteur de détection' },
  { key: 'sensor', sidc: '10031500002201000000', category: 'equipment', label: 'Capteur', description: 'Capteur / détecteur' },
  { key: 'generator', sidc: '10031500002007000000', category: 'equipment', label: 'Générateur', description: 'Groupe électrogène' },
  { key: 'taser', sidc: '10031500001119000000', category: 'equipment', label: 'Taser', description: 'Arme non létale / Taser' },
  { key: 'waterCannon', sidc: '10031500001120000000', category: 'equipment', label: 'Canon à eau', description: 'Canon à eau / maintien de l’ordre' },
  { key: 'bridge', sidc: '10031500001301000000', category: 'equipment', label: 'Pont / passerelle', description: 'Pont mobile / passerelle de franchissement' },
  { key: 'helicopter', sidc: '10031000001206000000', category: 'air', label: 'Hélicoptère', description: 'Hélicoptère (police, SAMU, gendarmerie)' },
  { key: 'drone', sidc: '10031000001219000000', category: 'air', label: 'Drone', description: 'Drone de surveillance / UAV' },
  { key: 'airplane', sidc: '10031000001208000000', category: 'air', label: 'Avion', description: 'Aéronef à voilure fixe' },
  { key: 'riot', sidc: '10034000001101100000', category: 'events', label: 'Émeute', description: 'Émeute / troubles civils' },
  { key: 'demonstration', sidc: '10034000001201000000', category: 'events', label: 'Manifestation', description: 'Manifestation / rassemblement' },
  { key: 'arson', sidc: '10034000001101020000', category: 'events', label: 'Incendie criminel', description: 'Incendie volontaire / arson' },
  { key: 'explosion', sidc: '10034000001106000000', category: 'events', label: 'Explosion', description: 'Explosion / détonation' },
  { key: 'bomb', sidc: '10034000001102000000', category: 'events', label: 'Bombe', description: 'Bombe / engin explosif' },
  { key: 'bombThreat', sidc: '10034000001102010000', category: 'events', label: 'Alerte à la bombe', description: 'Menace / alerte à la bombe' },
  { key: 'gunshots', sidc: '10034000001104000000', category: 'events', label: 'Coups de feu', description: 'Tirs / fusillade' },
  { key: 'homicide', sidc: '10034000001101080000', category: 'events', label: 'Homicide', description: 'Homicide / crime de sang' },
  { key: 'arrest', sidc: '10034000001101010000', category: 'events', label: 'Arrestation', description: 'Interpellation / arrestation' },
  { key: 'robbery', sidc: '10034000001101160000', category: 'events', label: 'Vol / Braquage', description: 'Vol à main armée / braquage' },
  { key: 'narcotics', sidc: '10034000001101050000', category: 'events', label: 'Stupéfiants', description: 'Activité liée aux stupéfiants' },
  { key: 'suspiciousActivity', sidc: '10034000001101230000', category: 'events', label: 'Activité suspecte', description: 'Comportement / activité suspecte' },
  { key: 'body', sidc: '10034000001101210000', category: 'events', label: 'Corps / dépouille', description: 'Découverte de corps' },
  { key: 'ied', sidc: '10034000001103000000', category: 'events', label: 'IED', description: 'Engin explosif improvisé' },
  { key: 'vandalism', sidc: '10034000001101140000', category: 'events', label: 'Vandalisme', description: 'Vandalisme / dégradations / pillage' },
  { key: 'sabotage', sidc: '10034000001101220000', category: 'events', label: 'Sabotage', description: 'Sabotage' },
  { key: 'rallyPoint', sidc: '10032500001314000000', category: 'control', label: 'Point de ralliement', description: 'Point de regroupement / ralliement' },
  { key: 'startPoint', sidc: '10032500001316000000', category: 'control', label: 'Point de départ', description: 'Point de départ / début de mission' },
  { key: 'releasePoint', sidc: '10032500001315000000', category: 'control', label: 'Point de libération', description: 'Point de fin de mission / libération' },
  { key: 'contactPoint', sidc: '10032500001305000000', category: 'control', label: 'Point de contact', description: 'Point de contact / rendez-vous' },
  { key: 'pointOfInterest', sidc: '10032500001313000000', category: 'control', label: 'Point d’intérêt', description: 'Point d’intérêt / POI' },
  { key: 'waypoint', sidc: '10032500001318000000', category: 'control', label: 'Waypoint', description: 'Point de passage / waypoint' },
  { key: 'observationPost', sidc: '10032500001601000000', category: 'control', label: 'Poste d’observation', description: 'Poste d’observation / vigie' },
  { key: 'distressCall', sidc: '10032500001308000000', category: 'control', label: 'Appel de détresse', description: 'SOS / appel de détresse' },
  { key: 'casualtyCollectionPoint', sidc: '10032500003205000000', category: 'control', label: 'Point de collecte victimes', description: 'Point de collecte des blessés / CCP' },
  { key: 'trafficControlPost', sidc: '10032500003214000000', category: 'control', label: 'Poste régulation trafic', description: 'Poste de régulation de la circulation / TCP' },
]

const TACTICAL_GRAPHICS: MilSymEntry[] = [
  { key: 'perimeter', sidc: '10032500001101000000', category: 'tactical-graphics', label: 'Périmètre', description: 'Périmètre de sécurité / limite (Boundary)', multiPoint: true, minPoints: 2, color: '#FF6B00' },
  { key: 'phaseLine', sidc: '10032500001401000000', category: 'tactical-graphics', label: 'Ligne de phase', description: 'Ligne de progression / phase (Phase Line)', multiPoint: true, minPoints: 2, color: '#2196F3' },
  { key: 'route', sidc: '10032500001102000000', category: 'tactical-graphics', label: 'Itinéraire', description: 'Itinéraire d’approche / route (Light Line)', multiPoint: true, minPoints: 2, color: '#4CAF50' },
  { key: 'limitOfAdvance', sidc: '10032500001409000000', category: 'tactical-graphics', label: 'Limite de progression', description: 'Ligne de limite / ne pas dépasser (Limit of Advance)', multiPoint: true, minPoints: 2, color: '#E91E63' },
  { key: 'holdingLine', sidc: '10032500001415000000', category: 'tactical-graphics', label: 'Ligne de maintien', description: 'Ligne de maintien / position (Holding Line)', multiPoint: true, minPoints: 2, color: '#9C27B0' },
  { key: 'areaOfOperations', sidc: '10032500001201000000', category: 'tactical-graphics', label: 'Zone d’intervention', description: 'Zone d’intervention / opération (Area of Operations)', multiPoint: true, minPoints: 3, color: '#2196F3' },
  { key: 'areaOfInterest', sidc: '10032500001202000000', category: 'tactical-graphics', label: 'Zone d’intérêt', description: 'Zone d’intérêt / surveillance (Named Area of Interest)', multiPoint: true, minPoints: 3, color: '#FF9800' },
  { key: 'assemblyArea', sidc: '10032500001502000000', category: 'tactical-graphics', label: 'Zone de regroupement', description: 'Point de rassemblement / regroupement (Assembly Area)', multiPoint: true, minPoints: 3, color: '#4CAF50' },
  { key: 'objective', sidc: '10032500001517000000', category: 'tactical-graphics', label: 'Objectif', description: 'Zone ou point objectif (Objective)', multiPoint: true, minPoints: 3, color: '#F44336' },
  { key: 'targetedAreaOfInterest', sidc: '10032500001203000000', category: 'tactical-graphics', label: 'Zone de recherche', description: 'Zone de recherche / ratissage (Targeted Area of Interest)', multiPoint: true, minPoints: 3, color: '#00BCD4' },
  { key: 'restrictedOperationsZone', sidc: '10032500001710000000', category: 'tactical-graphics', label: 'Zone d’exclusion', description: 'Zone interdite / exclusion (Restricted Operations Zone)', multiPoint: true, minPoints: 3, color: '#E91E63' },
]

/** Toutes les entrées : icônes ponctuelles puis graphiques tactiques multi-points. */
export const MILSYM_ENTRIES: MilSymEntry[] = [...ICONS, ...TACTICAL_GRAPHICS]

/** Catalogue MIL-STD-2525D prêt pour `<DrawLayer symbols={{ catalog }}>`. */
export const MILSYM_CATALOG: SymbolCatalog = {
  id: 'mil-std-2525d',
  entries: MILSYM_ENTRIES,
  variantColors: MILSYM_AFFILIATION_COLORS,
}

const BY_KEY = new Map(MILSYM_ENTRIES.map((e) => [e.key, e]))

/** SIDC d'une clé de catalogue, affiliation appliquée. */
export function milSymSidc(key: string, affiliation: MilSymAffiliation = 'friendly'): string | null {
  const entry = BY_KEY.get(key)
  return entry ? applyAffiliation(entry.sidc, affiliation) : null
}

type MilSymModule = typeof import('@armyc2.c5isr.renderer/mil-sym-ts-web')

// Le SDK n'est PAS idempotent à l'initialisation : la promesse est mémoïsée au niveau
// du module pour que plusieurs cartes (ou plusieurs providers) n'appellent jamais
// `initialize()` deux fois.
let modulePromise: Promise<MilSymModule> | null = null

function loadMilSym(): Promise<MilSymModule> {
  modulePromise ??= import('@armyc2.c5isr.renderer/mil-sym-ts-web').then(async (mod) => {
    if (!mod.isReady()) await mod.initialize()
    return mod
  })
  return modulePromise
}

export type MilSymRendererOptions = {
  /** Affiliation par défaut quand `render` ne reçoit pas de `variant` (défaut `friendly`). */
  affiliation?: MilSymAffiliation
  /** Taille de rendu par défaut en px (défaut 40). */
  size?: number
  /** Notifiée si le SDK ne charge pas — sinon l'échec est silencieux (placeholders). */
  onError?: (error: unknown) => void
  /**
   * Plafond du cache de vignettes rendues (défaut `providers.symbols.cacheMaxEntries`).
   * `0` = illimité — l'ancien comportement, à n'utiliser que sur un catalogue borné
   * affiché à taille fixe.
   */
  cacheMaxEntries?: number
}

/**
 * Fournisseur de rendu MIL-STD pour `<DrawLayer symbols={{ renderer }}>`.
 *
 * `render` est synchrone par contrat : il renvoie `null` tant que le SDK n'est pas
 * chargé (la couche affiche un placeholder puis se re-rend sur `ready`), et sert
 * ensuite depuis un cache par SIDC+taille — le rendu SVG du SDK est coûteux et il est
 * appelé à chaque rendu React.
 */
export function createMilSymRenderer(opts: MilSymRendererOptions = {}): SymbolRenderer {
  const defaultAffiliation = opts.affiliation ?? 'friendly'
  const defaultSize = opts.size ?? 40
  const maxEntries = opts.cacheMaxEntries ?? defaultConfig.providers.symbols.cacheMaxEntries
  /**
   * `Map` = ordre d'insertion garanti : la première clé itérée est la plus ancienne.
   * Le plafond est nécessaire — la clé combine SIDC ET taille, or la taille varie avec
   * le zoom pour les vignettes : sans borne, la table croissait indéfiniment, chaque
   * entrée retenant un SVG rendu.
   */
  const cache = new Map<string, RenderedSymbol>()
  let mod: MilSymModule | null = null

  const ready = loadMilSym()
    .then((m) => {
      mod = m
    })
    .catch((error: unknown) => {
      opts.onError?.(error)
    })

  return {
    ready,
    render: (key, options?: SymbolRenderOptions): RenderedSymbol | null => {
      if (!mod) return null
      const affiliation = (options?.variant as MilSymAffiliation | undefined) ?? defaultAffiliation
      const size = options?.size ?? defaultSize
      const sidc = milSymSidc(key, affiliation)
      if (!sidc) return null

      const cacheKey = `${sidc}/${size}`
      const cached = cache.get(cacheKey)
      if (cached) {
        // Réinsertion = promotion : l'éviction est un vrai LRU, pas un FIFO qui
        // jetterait l'entrée la plus ancienne même si c'est la plus consultée.
        cache.delete(cacheKey)
        cache.set(cacheKey, cached)
        return cached
      }

      try {
        const attributes = new Map<string, string>([[mod.MilStdAttributes.PixelSize, String(size)]])
        const info = mod.MilStdIconRenderer.getInstance().RenderSVG(sidc, new Map(), attributes)
        if (!info) return null
        const rendered = anchorAtCenter(
          info.getSVG(),
          info.getSymbolCenterX(),
          info.getSymbolCenterY(),
          info.getImageBounds().getWidth(),
          info.getImageBounds().getHeight(),
        )
        cache.set(cacheKey, rendered)
        if (maxEntries > 0 && cache.size > maxEntries) {
          const oldest = cache.keys().next()
          if (!oldest.done) cache.delete(oldest.value)
        }
        return rendered
      } catch (error) {
        opts.onError?.(error)
        return null
      }
    },
  }
}

/**
 * Réenveloppe le SVG du SDK dans un carré dont le CENTRE est le point d'ancrage du
 * symbole — le contrat de `RenderedSymbol`.
 *
 * Pourquoi ce n'est pas cosmétique : l'ancre MIL-STD n'est pas le centre de l'image
 * (un poste de commandement pend sous son mât, une flèche part de sa pointe). Poser
 * le centre de l'image sur la coordonnée décalerait le symbole de plusieurs pixels
 * par rapport au terrain, et l'erreur grandirait avec la taille de rendu.
 *
 * Le côté du carré est `2 × max(distance de l'ancre à chaque bord)` : c'est la plus
 * petite boîte centrée sur l'ancre qui contient encore tout le dessin. Le SVG
 * d'origine est imbriqué tel quel (SVG accepte un `<svg>` enfant positionné) plutôt
 * que réécrit : aucune analyse de son contenu, donc rien à casser.
 */
function anchorAtCenter(svg: string, cx: number, cy: number, w: number, h: number): RenderedSymbol {
  const side = 2 * Math.max(cx, w - cx, cy, h - cy)
  // Dimensions inexploitables (SDK en échec) : on rend le SVG tel quel plutôt que de
  // produire un viewBox dégénéré.
  if (!Number.isFinite(side) || side <= 0) return { svg, size: Math.max(w, h) || 40 }
  const x = side / 2 - cx
  const y = side / 2 - cy
  // La balise ouvrante est cherchée où qu'elle soit, et non ancrée au tout premier
  // caractère : le SDK peut préfixer une déclaration XML ou un espace, auquel cas un
  // motif ancré échouerait SANS ERREUR — le symbole serait alors rendu sans décalage
  // d'ancrage, donc discrètement décalé par rapport au terrain. La déclaration
  // éventuelle est retirée au passage : elle est invalide dans un SVG imbriqué.
  const openTag = svg.search(/<svg[\s>]/)
  if (openTag < 0) return { svg, size: Math.max(w, h) || 40 }
  const inner = `<svg x="${round(x)}" y="${round(y)}"${svg.slice(openTag + 4)}`
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(side)} ${round(side)}" width="${round(side)}" height="${round(side)}">${inner}</svg>`,
    size: Math.round(side),
  }
}

const round = (n: number): number => Math.round(n * 100) / 100
