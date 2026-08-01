import type { DataConfig } from '../types'

export const dataDefaults: DataConfig = {
  viewportDebounceMs: 500,
  positionSaveDebounceMs: 400,
  storageKeys: {
    tagFilter: 'm3d:tag-filter',
    drawSettings: 'm3d:draw-settings',
    searchHistory: 'm3d:search-history',
    plugins: 'm3d:plugins',
    templates: 'm3d:templates',
    catalog: 'm3d:catalog',
    catalogSettings: 'm3d:catalog-settings',
    preferences: 'm3d:preferences',
  },
  search: {
    minQuery: 2,
    debounceMs: 250,
    limitPerGroup: 6,
    historySize: 8,
    flyAltitude: 2_500,
    fitPadding: 60,
    resolveLimit: 20,
  },
}
