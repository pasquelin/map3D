// Barrel : `MapConfig`/`PartialConfig` et tous les sous-types sont éclatés par domaine
// sous `types/` (cf. `types/index.ts`). Ce fichier ne fait que les réexporter, pour que
// chaque `from '../config/types'` existant continue de fonctionner sans changement.
//
// ⚠️ Le chemin explicite `./types/index` (et non `./types`) est nécessaire : depuis ce
// fichier lui-même nommé `types.ts`, un import `./types` serait ambigu avec ce fichier
// et se résoudrait sur lui-même plutôt que sur le dossier.
export * from './types/index'
