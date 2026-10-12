import { STATE, activeLocks, getScene } from './state';
import { initLinesFromSnapshot } from './scene-lines';
import type { ServerMessage } from '../types/messages';
import type { Phase } from '../types/state';
import { updateExportCache } from './ui/export';
import * as mannequin from './mannequin';
import { PRESETS } from './presets';
import { applyLobbyServerMessage, type LobbyState } from './lobby-store';
import { applyOptikToScene } from './ui/optik';
import * as groundObjects from './ground-objects';
import { toExportFig, toExportLine } from './ws-export-mappers';
import type { ClientModerationState } from './ws-client';

// Context for the snapshot handler: the lobby/moderation stores and the
// injected callbacks live in ws-client.ts (single ownership, avoids a
// module cycle). Same getter/setter-injection pattern as ws-lobby-handlers.
export interface SnapshotCtx {
  getLobbyState: () => LobbyState;
  setLobbyState: (s: LobbyState) => void;
  onLobbyChange: (s: LobbyState) => void;
  onPhaseChange: (phase: Phase | null) => void;
  setModerationState: (s: ClientModerationState) => void;
  onModerationChange: (s: ClientModerationState) => void;
  applyAppearance: (fig: any, a: any) => void;
  setLockBadge: (id: string, name: string, color: string) => void;
  clearLockBadge: (id: string) => void;
  stiffSlider: HTMLInputElement | null;
}

type SnapshotMessage = Extract<ServerMessage, { type: 'snapshot' }>;

export function handleSnapshotMessage(msg: SnapshotMessage, ctx: SnapshotCtx): void {
  // scene may not be initialized yet when main.ts connects the WS early
  // (before bootBoard()/initScene()). Process lobby/phase parts regardless;
  // skip scene-graph mutations until the scene is ready.
  let sceneForSnapshot: ReturnType<typeof getScene> | null = null;
  try { sceneForSnapshot = getScene(); } catch { /* pre-scene lobby snapshot */ }
  // Reset world from server state
  for (const f of STATE.figures) {
    mannequin.disposeMannequin(f);
    sceneForSnapshot?.scene.remove(f.root);
  }
  STATE.figures.length = 0;
  STATE.selectedId = null;
  for (const f of (msg.figures || [])) {
    const fig = mannequin.makeMannequin(f.id, { x: f.x ?? 0, z: f.z ?? 0 });
    fig.facingY = f.facingY ?? 0;
    fig.root.rotation.y = fig.facingY;
    if (f.preset && PRESETS[f.preset]) {
      for (const name of mannequin.BONE_NAMES) {
        fig.bone[name].targetRot.x = PRESETS[f.preset][name].x;
        fig.bone[name].targetRot.z = PRESETS[f.preset][name].z;
      }
    }
    if (f.boneOverrides) {
      fig.boneOverrides = { ...f.boneOverrides };
    }
    (fig as any)._serverPossessor = (f as any).possessor ?? null;
    // Notizen aus Snapshot wiederherstellen (Slice 5, T000469)
    if ((f as any).note !== undefined) {
      (fig as any).note = (f as any).note;
    }
    // E9: hidden/opacity aus Snapshot übernehmen (nur der Leiter erhält
    // hidden-Figuren überhaupt — der Server filtert sie sonst weg).
    if ((f as any).hidden) (fig as any).hidden = true;
    if (typeof (f as any).opacity === 'number') (fig as any).opacity = (f as any).opacity;
    STATE.figures.push(fig);
    if (f.appearance) {
      ctx.applyAppearance(fig, f.appearance);
    }
    mannequin.updateHiddenBadge(fig);
  }
  if (typeof msg.stiffness === 'number') {
    STATE.stiffness = msg.stiffness;
    if (ctx.stiffSlider) {
      ctx.stiffSlider.value = String(msg.stiffness);
    }
  }
  if (STATE.figures[0]) {
    (window as any).selectFigure(STATE.figures[0].id);
  }

  // Clear all visual lock badges first
  for (const figId of activeLocks.keys()) {
    ctx.clearLockBadge(figId);
  }
  activeLocks.clear();
  // Rehydrate locks
  for (const l of (msg.locks || [])) {
    activeLocks.set(l.figureId, { userId: l.userId, name: l.name, color: l.color });
    ctx.setLockBadge(l.figureId, l.name, l.color);
  }
  // Apply persisted board-optik on mount so late-joiners/reloads render the
  // saved look (§4.1 dead seam closed end-to-end, D11).
  if (msg.optik) applyOptikToScene(msg.optik);
  // NEU T000468: Ground-Objects aus Snapshot initialisieren (DARK-LAUNCH)
  if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
    groundObjects.initGroundObjectsFromSnapshot(msg.anchors ?? [], msg.zones ?? []);
  }

  initLinesFromSnapshot(msg.lines ?? []);  // T000467
  // T000471: rehydrate moderation state from join snapshot
  if ((msg as any).moderation) {
    const next = {
      spotlight: (msg as any).moderation.spotlight ?? null,
      dim: (msg as any).moderation.dim ?? null,
      freeze: (msg as any).moderation.freeze ?? false,
    };
    ctx.setModerationState(next);
    ctx.onModerationChange(next);
  }

  // Billboard-Wiederherstellung für alle Figuren mit Notizen (Feature-Flag sf-t000469)
  {
    const feats: Record<string, boolean> =
      (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
    if (feats['sf-t000469']) {
      import('./ui/hud').then(m => {
        if (typeof (m as any).setFigureNoteBillboard === 'function') {
          for (const f of STATE.figures) {
            if ((f as any).note) {
              (m as any).setFigureNoteBillboard(f.id, (f as any).note);
            }
          }
        }
      }).catch(() => {});
    }
  }
  // FE-2: the join snapshot is the FIRST (often ONLY) state a client gets on
  // connect, and it carries the authoritative phase/sessionCode/roster. Route
  // it through the lobby reducer and drive the view-machine on a phase change
  // — exactly like the presence/session cases below — so a `?room=`/`/api/join`
  // joiner into a `lobby`-phase session lands on the lobby screen instead of
  // staring at empty board chrome.
  {
    const prevPhase = ctx.getLobbyState().phase;
    ctx.setLobbyState(applyLobbyServerMessage(ctx.getLobbyState(), msg));
    ctx.onLobbyChange(ctx.getLobbyState());
    if (ctx.getLobbyState().phase !== prevPhase) ctx.onPhaseChange(ctx.getLobbyState().phase);
  }
  // Export-Cache aktualisieren:
  updateExportCache({
    phase: (msg as any).phase ?? 'lobby',
    sessionCode: (msg as any).sessionCode ?? null,
    stiffness: (msg as any).stiffness ?? STATE.stiffness,
    figures: ((msg as any).figures ?? []).map(toExportFig),
    lines: ((msg as any).lines ?? []).map(toExportLine),
    anchors: [...((msg as any).anchors ?? [])],
    zones: [...((msg as any).zones ?? [])],
    optik: (msg as any).optik ?? null,
  });
}
