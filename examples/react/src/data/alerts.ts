import type { LatLng, MarkerData } from 'map3d'

import { type CityId, TEST_POINT } from './cities'
import { seedToMarker } from './toMarkers'
import type { Alert, Severity } from './types'

/* ══════════════════ ALERTES — des lat/lng réels, trois villes ══════════════════
   Rien n'est calculé : chaque alerte est un point relevé sur le terrain, avec son
   adresse. Le TYPE (`alert-<sévérité>`) et les TAGS (['alert', sévérité, ville])
   en sont dérivés — une seule saisie, donc pas de dérive possible entre la
   sévérité affichée, la couleur du marker et le filtre « Couches ». */

type AlertSeed = {
  id: number
  severity: Severity
  title: string
  address: string
  position: LatLng
  /** Viseur rouge : intervention immédiate. */
  urgent?: boolean
  /** Sonar : alerte non traitée, éteint au premier clic. */
  new?: boolean
}

/* ── PARIS ─────────────────────────────────────────────────────────────────────
   Démo des flags d'attention — toutes les combinaisons : #1 `urgent` (viseur),
   #5 `new` (sonar), #6 les deux → le viseur PRIME (le sonar n'apparaît pas). */
const PARIS_ALERTS: AlertSeed[] = [
  {
    id: 1,
    severity: 'critical',
    urgent: true,
    title: 'Intrusion — Louvre',
    address: 'Cour Napoléon, 75001 Paris',
    position: { lat: 48.8606, lng: 2.3376 },
  },
  {
    id: 2,
    severity: 'high',
    title: 'Malaise — Notre-Dame',
    address: 'Parvis Notre-Dame, 75004 Paris',
    position: { lat: 48.853, lng: 2.3499 },
  },
  {
    id: 3,
    severity: 'medium',
    title: 'Colis suspect — Tour Eiffel',
    address: 'Champ-de-Mars, 75007 Paris',
    position: { lat: 48.8584, lng: 2.2945 },
  },
  {
    id: 4,
    severity: 'low',
    title: 'Tapage — Arc de Triomphe',
    address: 'Place Charles-de-Gaulle, 75008 Paris',
    position: { lat: 48.8738, lng: 2.295 },
  },
  {
    id: 5,
    severity: 'high',
    new: true,
    title: 'Vol — Gare du Nord',
    address: '18 rue de Dunkerque, 75010 Paris',
    position: { lat: 48.8809, lng: 2.3553 },
  },
  {
    id: 6,
    severity: 'critical',
    new: true,
    urgent: true,
    title: 'Bagarre — Bastille',
    address: 'Place de la Bastille, 75011 Paris',
    position: { lat: 48.8532, lng: 2.369 },
  },
  {
    id: 7,
    severity: 'medium',
    title: 'Accident — Montmartre',
    address: '35 rue du Chevalier-de-la-Barre, 75018 Paris',
    position: { lat: 48.8867, lng: 2.3431 },
  },
  {
    id: 8,
    severity: 'low',
    title: 'Signalement — Panthéon',
    address: 'Place du Panthéon, 75005 Paris',
    position: { lat: 48.8462, lng: 2.3464 },
  },
  {
    id: 9,
    severity: 'high',
    title: 'Malaise — Père-Lachaise',
    address: '16 rue du Repos, 75020 Paris',
    position: { lat: 48.8615, lng: 2.3934 },
  },
  {
    id: 10,
    severity: 'medium',
    title: 'Colis — Trocadéro',
    address: 'Place du Trocadéro, 75016 Paris',
    position: { lat: 48.8616, lng: 2.287 },
  },
  // Même position EXACTE que #2 (Notre-Dame) : cluster inséparable quel que soit le
  // zoom — cas de test du comportement « cluster au zoom max ».
  {
    id: 11,
    severity: 'low',
    title: 'Second signalement — Notre-Dame',
    address: 'Parvis Notre-Dame, 75004 Paris',
    position: { lat: 48.853, lng: 2.3499 },
  },
  {
    id: 12,
    severity: 'high',
    new: true,
    title: 'Rixe — Gare de Lyon',
    address: 'Place Louis-Armand, 75012 Paris',
    position: { lat: 48.8443, lng: 2.373 },
  },
  {
    id: 13,
    severity: 'medium',
    title: 'Vol à la tire — Châtelet-Les Halles',
    address: '101 Porte Berger, 75001 Paris',
    position: { lat: 48.862, lng: 2.3465 },
  },
  {
    id: 14,
    severity: 'low',
    title: 'Stationnement gênant — Opéra',
    address: 'Place de l’Opéra, 75009 Paris',
    position: { lat: 48.8719, lng: 2.3316 },
  },
  {
    id: 15,
    severity: 'medium',
    title: 'Rassemblement non déclaré — République',
    address: 'Place de la République, 75003 Paris',
    position: { lat: 48.8674, lng: 2.3636 },
  },
  {
    id: 16,
    severity: 'high',
    urgent: true,
    title: 'Bagage abandonné — Saint-Lazare',
    address: '13 rue d’Amsterdam, 75008 Paris',
    position: { lat: 48.8757, lng: 2.3255 },
  },
  {
    id: 17,
    severity: 'low',
    title: 'Dégradation — Bercy',
    address: '8 boulevard de Bercy, 75012 Paris',
    position: { lat: 48.8386, lng: 2.3786 },
  },
  {
    id: 18,
    severity: 'medium',
    title: 'Alarme intrusion — La Villette',
    address: '211 avenue Jean-Jaurès, 75019 Paris',
    position: { lat: 48.8898, lng: 2.3931 },
  },
  {
    id: 19,
    severity: 'low',
    title: 'Personne en détresse — BnF',
    address: 'Quai François-Mauriac, 75013 Paris',
    position: { lat: 48.833, lng: 2.376 },
  },
  {
    id: 20,
    severity: 'critical',
    new: true,
    title: 'Départ de feu — La Défense',
    address: '1 parvis de la Défense, 92800 Puteaux',
    position: { lat: 48.8918, lng: 2.2379 },
  },
]

/* ── NICE ────────────────────────────────────────────────────────────────────── */
const NICE_ALERTS: AlertSeed[] = [
  {
    id: 30,
    severity: 'critical',
    urgent: true,
    title: 'Agression — Promenade des Anglais',
    address: '37 promenade des Anglais, 06000 Nice',
    position: { lat: 43.6949, lng: 7.2596 },
  },
  {
    id: 31,
    severity: 'high',
    new: true,
    title: 'Vol avec violence — Place Masséna',
    address: 'Place Masséna, 06000 Nice',
    position: { lat: 43.6975, lng: 7.2707 },
  },
  {
    id: 32,
    severity: 'medium',
    title: 'Rixe — Cours Saleya',
    address: 'Cours Saleya, 06300 Nice',
    position: { lat: 43.6955, lng: 7.2745 },
  },
  {
    id: 33,
    severity: 'medium',
    title: 'Intrusion navire — Port Lympia',
    address: 'Quai des Docks, 06300 Nice',
    position: { lat: 43.696, lng: 7.2865 },
  },
  {
    id: 34,
    severity: 'high',
    title: 'Bagage abandonné — Gare de Nice-Ville',
    address: 'Avenue Thiers, 06000 Nice',
    position: { lat: 43.7045, lng: 7.262 },
  },
  {
    id: 35,
    severity: 'critical',
    urgent: true,
    new: true,
    title: 'Colis suspect — Aéroport T2',
    address: 'Terminal 2, 06200 Nice',
    position: { lat: 43.6647, lng: 7.2185 },
  },
  {
    id: 36,
    severity: 'medium',
    title: 'Mouvement de foule — Allianz Riviera',
    address: 'Boulevard des Jardiniers, 06200 Nice',
    position: { lat: 43.7052, lng: 7.1925 },
  },
  {
    id: 37,
    severity: 'low',
    title: 'Personne égarée — Colline du Château',
    address: 'Montée Lesage, 06300 Nice',
    position: { lat: 43.695, lng: 7.2795 },
  },
  {
    id: 38,
    severity: 'low',
    title: 'Dégradation — Musée Matisse',
    address: '164 avenue des Arènes de Cimiez, 06000 Nice',
    position: { lat: 43.7196, lng: 7.276 },
  },
  {
    id: 39,
    severity: 'high',
    title: 'Malaise — CHU Pasteur',
    address: '30 voie Romaine, 06000 Nice',
    position: { lat: 43.7181, lng: 7.2905 },
  },
  {
    id: 40,
    severity: 'low',
    title: 'Tapage nocturne — Place Garibaldi',
    address: 'Place Garibaldi, 06300 Nice',
    position: { lat: 43.7003, lng: 7.2775 },
  },
  {
    id: 41,
    severity: 'medium',
    title: 'Alarme intrusion — Nice Étoile',
    address: '30 avenue Jean-Médecin, 06000 Nice',
    position: { lat: 43.7014, lng: 7.2696 },
  },
  {
    id: 42,
    severity: 'low',
    title: 'Objet trouvé — Parc Phoenix',
    address: '405 promenade des Anglais, 06200 Nice',
    position: { lat: 43.6685, lng: 7.213 },
  },
]

/* ── VERNON (Eure, Normandie) ─────────────────────────────────────────────────── */
const VERNON_ALERTS: AlertSeed[] = [
  {
    id: 60,
    severity: 'medium',
    title: 'Intrusion — Collégiale Notre-Dame',
    address: 'Rue Carnot, 27200 Vernon',
    position: { lat: 49.0937, lng: 1.4855 },
  },
  {
    id: 61,
    severity: 'low',
    title: 'Dégradation — Château des Tourelles',
    address: 'Route de Bizy, 27200 Vernon',
    position: { lat: 49.0916, lng: 1.479 },
  },
  {
    id: 62,
    severity: 'high',
    new: true,
    title: 'Bagage abandonné — Gare de Vernon-Giverny',
    address: 'Place Georges-Pompidou, 27200 Vernon',
    position: { lat: 49.0908, lng: 1.4747 },
  },
  {
    id: 63,
    severity: 'high',
    title: 'Malaise — Centre hospitalier',
    address: '5 rue du Docteur-Burnet, 27200 Vernon',
    position: { lat: 49.0885, lng: 1.4885 },
  },
  {
    id: 64,
    severity: 'medium',
    title: 'Rassemblement — Hôtel de ville',
    address: 'Place Barette, 27200 Vernon',
    position: { lat: 49.0941, lng: 1.4826 },
  },
  {
    id: 65,
    severity: 'critical',
    urgent: true,
    title: 'Alarme incendie — Espace Philippe-Auguste',
    address: '12 avenue Victor-Hugo, 27200 Vernon',
    position: { lat: 49.093, lng: 1.4838 },
  },
  {
    id: 66,
    severity: 'low',
    title: 'Affluence — Fondation Monet, Giverny',
    address: '84 rue Claude-Monet, 27620 Giverny',
    position: { lat: 49.0758, lng: 1.5333 },
  },
  {
    id: 67,
    severity: 'medium',
    title: 'Alarme intrusion — ZA de Saint-Marcel',
    address: "Rue de l'Industrie, 27950 Saint-Marcel",
    position: { lat: 49.0955, lng: 1.46 },
  },
  {
    id: 68,
    severity: 'low',
    title: 'Ronde à effectuer — Château de Bizy',
    address: 'Rue Ambroise-Bully, 27200 Vernon',
    position: { lat: 49.0836, lng: 1.4667 },
  },
  {
    id: 69,
    severity: 'medium',
    title: 'Véhicule suspect — Quai de la Seine',
    address: 'Quai Aristide-Briand, 27200 Vernon',
    position: { lat: 49.0946, lng: 1.4881 },
  },
]

/**
 * Point de contrôle précision, volontairement isolé (7 km de Vernon) et SANS
 * infobulle : `markerTip` s'en remet à cet id, exporté pour que les deux fichiers ne
 * s'accordent pas sur un nombre magique.
 */
export const CONTROL_POINT_ID = 99

const CONTROL_POINT: AlertSeed = {
  id: CONTROL_POINT_ID,
  severity: 'critical',
  title: 'Point de contrôle précision',
  address: 'Repère géodésique, 27950 Saint-Pierre-d’Autils',
  position: TEST_POINT,
}

// Le reste du seed EST la donnée métier : un champ ajouté à `Alert` arrive dans le
// marker sans qu'on touche à cette fabrique. Le squelette (id, title, couleur) vient de
// `seedToMarker`, commun aux trois jeux — ici ne restent que le type, les tags et les
// deux drapeaux d'attention, qui sont propres aux alertes.
const toMarkers = (seeds: AlertSeed[], city: CityId): MarkerData<Alert>[] =>
  seeds.map(({ position, urgent, new: isNew, ...alert }) =>
    seedToMarker(`alert-${alert.severity}`, position, { ...alert, city }, ['alert', alert.severity, city], {
      urgent,
      new: isNew,
    }),
  )

export const ALERTS: MarkerData<Alert>[] = [
  ...toMarkers([CONTROL_POINT], 'vernon'),
  ...toMarkers(PARIS_ALERTS, 'paris'),
  ...toMarkers(NICE_ALERTS, 'nice'),
  ...toMarkers(VERNON_ALERTS, 'vernon'),
]
