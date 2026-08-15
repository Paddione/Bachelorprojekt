import { writable } from 'svelte/store';

// E5 (T008017): geteilter Toggle-Zustand des Help-Overlays zwischen dem
// [?]-Toggle im Z1-Statusband und dem HelpOverlay-Layer. Beide sind separate
// Astro-Inseln (client:load) — ein lokaler $state im Statusband erreichte den
// Layer nicht, deshalb der Store (gleiche Begruendung wie factory-floor-store).
// Der Toggle aendert bewusst NICHT station/ticket/deck in der URL (Requirement
// "Help toggle opens without changing the selection").
export const helpOverlayActive = writable(false);
