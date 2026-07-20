// brett/src/client/board-dblclick.ts — pure dblclick-on-floor decision (T002006).
// No `state`/`ws-client` imports — pure function, context injected (T001931).

export type DblclickFloorAction = { kind: 'spawn'; x: number; z: number };

/**
 * Entscheidet die Aktion für einen Doppelklick auf freien Boden.
 * Doppelklick spawnt IMMER eine neue Figur — unabhängig von der Selektion.
 * (Der frühere Selektions-Teleport verhinderte Mehrfach-Spawn; Bewegen bleibt Drag.)
 */
export function dblclickFloorAction(target: { x: number; z: number }): DblclickFloorAction {
  return { kind: 'spawn', x: target.x, z: target.z };
}
