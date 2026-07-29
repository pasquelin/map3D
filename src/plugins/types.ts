/**
 * Schéma de configuration déclaratif d'un plugin (D4). map3D en rend les contrôles
 * à l'identique dans le hub (lib) et le dev panel (exemple) — l'auteur n'écrit aucun
 * formulaire. Le schéma est la SEULE source des valeurs par défaut.
 */
export type PluginFieldBase = {
  /** Clé stable dans l'objet de config (identifiant TS). */
  key: string
  /** Libellé affiché (hub + dev panel). Donnée fournie par le plugin, pas i18n de la lib. */
  label: string
  /** Aide courte optionnelle (tooltip du contrôle). */
  help?: string
  /**
   * Ce champ influe sur la DONNÉE : le modifier relance `data.fetch`. Défaut `false`
   * = champ purement visuel → pas de refetch (cf. perf : pas d'appel API pour un
   * réglage cosmétique).
   */
  refetch?: boolean
}

export type PluginField =
  | (PluginFieldBase & { type: 'boolean'; default: boolean })
  | (PluginFieldBase & { type: 'number'; default: number; min?: number; max?: number; step?: number })
  | (PluginFieldBase & { type: 'string'; default: string; secret?: boolean; placeholder?: string })
  | (PluginFieldBase & { type: 'select'; default: string; options: Record<string, string> })

/** Valeurs de config inférées depuis le schéma (mapping type → valeur). */
export type PluginConfigOf<S extends readonly PluginField[]> = {
  [F in S[number] as F['key']]: F extends { type: 'boolean' } ? boolean : F extends { type: 'number' } ? number : string
}
