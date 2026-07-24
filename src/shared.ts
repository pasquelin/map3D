// Primitives géographiques partagées par toutes les couches (core, data, providers).

export type LatLng = { lat: number; lng: number }

/** Cadre géographique (aligné sur `MapViewport.bounds` d'operator). */
export type Bounds = { north: number; south: number; east: number; west: number }
