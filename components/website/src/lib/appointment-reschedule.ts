// components/website/src/lib/appointment-reschedule.ts
// F3/A4 (bp-api-handler-fanout): reine Service-Extraktion aus
// pages/api/anfrage/[token]/umbuchung.ts — keine Logikänderung.
// Die POST-Route orchestriert nur noch (Rate-Limit, Guards, DB, Notify);
// Payload-Bau und Storno-Merge sind hier als testbare Einheiten.
import { berlinDayKey, berlinWallMinutes } from './caldav-cache';
import type { AppointmentRequest } from './appointment-requests';

export function wallDisplay(minutes: number): string {
  const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
  const mins = (minutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

/** Baut das Payload der neuen (umbgebuchten) Anfrage — hängt an der alten via supersedesId. */
export function buildReschedulePayload(
  req: AppointmentRequest,
  oldPayload: Record<string, unknown>,
  start: Date,
  end: Date,
  newToken: string,
  newSlotClaimed: boolean,
): { payload: Record<string, unknown>; newDisplay: string } {
  const newDisplay = `${wallDisplay(berlinWallMinutes(start))} - ${wallDisplay(berlinWallMinutes(end))}`;
  const newPayload: Record<string, unknown> = {
    name: req.name,
    email: req.email,
    phone: req.phone,
    type: typeof oldPayload.type === 'string' ? oldPayload.type : 'termin',
    typeLabel: typeof oldPayload.typeLabel === 'string' ? oldPayload.typeLabel : 'Termin vor Ort',
    slotStart: start.toISOString(),
    slotEnd: end.toISOString(),
    slotDisplay: newDisplay,
    date: berlinDayKey(start),
    serviceKey: req.serviceKey,
    serviceSnapshot: req.serviceSnapshot,
    message: req.message,
    token: newToken,
    state: 'offen',
    idempotencyKey: null,
    slotClaimed: newSlotClaimed,
    supersedesId: req.id,
  };
  return { payload: newPayload, newDisplay };
}

/** Storno-Merge für die abgelöste Anfrage (wird per || in die Payload geschrieben). */
export function supersededCancelMerge(): string {
  return JSON.stringify({
    state: 'storniert',
    outcome: 'storniert',
    cancelledAt: new Date().toISOString(),
    cancelNote: 'Durch Umbuchung ersetzt.',
  });
}
