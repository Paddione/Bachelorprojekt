import { STATE } from './state';
import { updateExportCache } from './ui/export';
import * as groundObjects from './ground-objects';
import type { ServerMessage } from '../types/messages';

export function handleGroundMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'anchor_added': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyAnchorAdded(msg.anchor);
        updateExportCache({ anchors: [...STATE.anchors] });
      } else {
        // Rendering aus, aber Export-Cache soll den Anker dennoch kennen
        updateExportCache({ anchors: [...STATE.anchors, msg.anchor] });
      }
      break;
    }
    case 'anchor_removed': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyAnchorRemoved(msg.anchorId);
        updateExportCache({ anchors: [...STATE.anchors] });
      } else {
        updateExportCache({ anchors: STATE.anchors.filter(a => a.id !== msg.anchorId) });
      }
      break;
    }
    case 'zone_added': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyZoneAdded(msg.zone);
        updateExportCache({ zones: [...STATE.zones] });
      } else {
        updateExportCache({ zones: [...STATE.zones, msg.zone] });
      }
      break;
    }
    case 'zone_updated': {
      // E1: Zone verschoben/skaliert/umgestylt. Export-Cache aktualisieren.
      const nextZones = STATE.zones.map(z => (z.id === msg.zone.id ? msg.zone : z));
      if (!nextZones.some(z => z.id === msg.zone.id)) nextZones.push(msg.zone);
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyZoneUpdated(msg.zone);
        updateExportCache({ zones: [...STATE.zones] });
      } else {
        updateExportCache({ zones: nextZones });
      }
      break;
    }
    case 'zone_removed': {
      if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
        groundObjects.applyZoneRemoved(msg.zoneId);
        updateExportCache({ zones: [...STATE.zones] });
      } else {
        updateExportCache({ zones: STATE.zones.filter(z => z.id !== msg.zoneId) });
      }
      break;
    }
    default:
      break;
  }
}
