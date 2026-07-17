// brett/src/server/hidden-filter.ts
// E9 — Verdecktes Arbeiten: server-seitige, per-Empfänger-Rolle gefilterte
// Sichtbarkeit von hidden-Figuren. SICHERHEITSKRITISCH: hidden-Figurendaten
// dürfen einen Nicht-Leiter (stellvertreter/beobachter/gast/zuschauer) NIE
// erreichen — weder im Snapshot noch als Broadcast. Filterung passiert
// ausschließlich am Broadcast-/Snapshot-Rand; der persistierte State bleibt roh.
//
// Reines Modul: importiert nur Typen. Keine DB-/Netzwerk-Abhängigkeit.

import type { Figure, Role } from '../types/state';
import type { ServerMessage } from '../types/messages';

/** Nur der `leiter` sieht hidden-Figuren. Jede andere Rolle wird gefiltert. */
function isLeader(role: Role): boolean {
  return role === 'leiter';
}

export function isFigureHidden(fig: any): boolean {
  return !!(fig && fig.hidden);
}

/**
 * Strippt hidden-Figuren für jede Rolle außer `leiter`. Der Leiter erhält den
 * vollständigen Figurensatz (rendert sie halbtransparent + Badge, E9-Client).
 */
export function filterSnapshotFigures(figures: Figure[], role: Role): Figure[] {
  if (isLeader(role)) return figures;
  return figures.filter((f) => !isFigureHidden(f));
}

type FigureLookup = (id: string) => any | null | undefined;

/**
 * Übersetzt eine figurenbezogene Broadcast-Message für eine Empfänger-Rolle.
 * - Leiter: unveränderte Message (volle Sichtbarkeit).
 * - Nicht-Leiter:
 *     • `figure_hidden_changed hidden:true`  → `{type:'delete', id}` (Figur verschwindet).
 *     • `figure_hidden_changed hidden:false` → `{type:'add', figure}` (Figur erscheint).
 *     • move/update/jump/figure_* auf eine AKTUELL hidden Figur → `null` (unterdrückt).
 *     • `add` einer hidden Figur → `null`.
 *     • alles andere → unverändert durchgereicht.
 */
export function translateBroadcastForRole(
  msg: any,
  role: Role,
  figureLookup: FigureLookup,
): ServerMessage | null {
  if (isLeader(role)) return msg as ServerMessage;

  if (msg && msg.type === 'figure_hidden_changed') {
    if (msg.hidden) {
      return { type: 'delete', id: msg.figureId };
    }
    const fig = figureLookup(msg.figureId);
    if (!fig || isFigureHidden(fig)) return null;
    return { type: 'add', figure: fig as Figure };
  }

  // `add` einer bereits als hidden markierten Figur (Server-autoritativ): unterdrücken.
  if (msg?.type === 'add' && isFigureHidden(msg.figure)) return null;

  // Figurenbezogene Messages, die eine hidden Figur betreffen, unterdrücken.
  const targetId: string | undefined =
    typeof msg?.id === 'string' ? msg.id
    : typeof msg?.figureId === 'string' ? msg.figureId
    : undefined;
  if (targetId !== undefined) {
    const fig = figureLookup(targetId);
    if (fig && isFigureHidden(fig)) return null;
  }

  return msg as ServerMessage;
}

// ── Wiring-Helfer ────────────────────────────────────────────────────────────
// Minimale Deps-Teilmenge, damit sowohl ws-connection als auch ws-admin-commands
// role-aware broadcasten können, ohne die Translate-/Lookup-Verdrahtung zu duplizieren.
interface FigureAwareDeps {
  broadcastRoleAware: (
    room: string,
    msg: any,
    resolveRoleForWs: (ws: any) => Role,
    translate: (msg: any, role: Role) => any | null,
    exclude?: any,
  ) => void;
  buildStateFromMutations: (room: string) => any;
  figureMaps: Map<string, Map<string, any>>;
  resolveRole: (ws: any, roles: Record<string, Role>) => Role;
}

/** Rolle eines Peers am Broadcast-Punkt — Guest/Zuschauer sind NIE Leiter. */
function resolvePeerRole(peer: any, roles: Record<string, Role>, resolveRole: FigureAwareDeps['resolveRole']): Role {
  if (peer?._isGuest || peer?._isZuschauer) return 'zuschauer';
  return resolveRole(peer, roles);
}

/**
 * Broadcastet eine figurenbezogene Message role-aware: pro Empfänger wird die
 * Rolle aufgelöst und `translateBroadcastForRole` angewandt. Nicht-Leiter
 * erhalten hidden-Figurendaten nie.
 */
export function broadcastFigureAware(deps: FigureAwareDeps, room: string, msg: any, exclude?: any): void {
  const roles: Record<string, Role> = deps.buildStateFromMutations(room)?.roles ?? {};
  const figMap = deps.figureMaps.get(room);
  const lookup: FigureLookup = (id) => figMap?.get(id) ?? null;
  deps.broadcastRoleAware(
    room,
    msg,
    (peer) => resolvePeerRole(peer, roles, deps.resolveRole),
    (m, role) => translateBroadcastForRole(m, role, lookup),
    exclude,
  );
}
