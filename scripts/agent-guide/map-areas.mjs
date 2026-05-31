// scripts/agent-guide/map-areas.mjs
// Emitter-owned presentation metadata for the territory map lanes.
// Components opt onto the map by setting `area: <one of these ids>`.
export const TERRITORY_AREAS = [
  { id: 'dienste',   label_de: 'Dienste',             order: 1 },
  { id: 'plattform', label_de: 'Plattform & Cluster', order: 2 },
  { id: 'daten',     label_de: 'Daten & Geheimnisse', order: 3 },
];
export const TERRITORY_AREA_IDS = new Set(TERRITORY_AREAS.map((a) => a.id));
