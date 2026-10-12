import type { WsDeps } from './ws-handler';
import {
  handleAdminSessionCreate,
  handleAdminHandoffToken,
  handleAdminRoundStop,
  handleAdminRoundPause,
  handleAdminCoachingStepsSet,
  handleAdminRoundStart,
  handleSessionUndo,
  handleSessionRedo,
} from './ws-admin-session';
import {
  handleAdminAssignRole,
  handleAdminAssignFigure,
  handleFigureTypeSet,
  handleFigureHideSet,
  handleAdminSpotlightSet,
  handleAdminDimSet,
  handleAdminFreezeSet,
} from './ws-admin-figures';
// handleAssignRole lives in ws-admin-figures.ts; re-exported here so the
// ws-handler → index → test import chain keeps resolving.
export { handleAssignRole } from './ws-admin-figures';
import {
  handleAdminSetOptik,
  handleAdminSetTemplate,
  handleAdminSetBoardTemplate,
  handleAdminResetBoardToDefault,
} from './ws-admin-templates';
import {
  handleAnchorCreate,
  handleAnchorDelete,
  handleZoneCreate,
  handleZoneUpdate,
  handleZoneDelete,
  handleLineCreate,
  handleLineDelete,
  handleLineTypeSet,
} from './ws-admin-board';

export async function handleAdminMessage(ws: any, msg: any, adminRoom: string, deps: WsDeps): Promise<void> {
  switch (msg.type) {
    case 'admin_kick': {
      if (typeof msg.playerId !== 'string') return;
      for (const sock of deps.rooms.get(adminRoom) || []) {
        if (sock._playerId === msg.playerId) {
          try {
            sock.close();
          } catch {}
          break;
        }
      }
      break;
    }
    case 'admin_broadcast': {
      const websiteUrl = process.env.WEBSITE_INTERNAL_URL || 'http://website.website.svc.cluster.local:4321';
      fetch(`${websiteUrl}/api/admin/brett/broadcast`, {
        method: 'POST',
        headers: { 'x-internal-admin': process.env.BRETT_INTERNAL_ADMIN_SECRET || '' },
      }).catch((err: any) => console.error('[brett] admin_broadcast failed:', err.message));
      break;
    }
    case 'admin_session_create':
      handleAdminSessionCreate(ws, msg, adminRoom, deps);
      break;
    case 'admin_handoff_token':
      handleAdminHandoffToken(ws, msg, adminRoom, deps);
      break;
    case 'admin_round_stop':
      handleAdminRoundStop(ws, msg, adminRoom, deps);
      break;
    case 'admin_round_pause':
      handleAdminRoundPause(ws, msg, adminRoom, deps);
      break;
    case 'admin_coaching_steps_set':
      handleAdminCoachingStepsSet(ws, msg, adminRoom, deps);
      break;
    case 'admin_round_start':
      handleAdminRoundStart(ws, msg, adminRoom, deps);
      break;
    case 'admin_assign_role':
      handleAdminAssignRole(ws, msg, adminRoom, deps);
      break;
    case 'admin_assign_figure':
      handleAdminAssignFigure(ws, msg, adminRoom, deps);
      break;
    case 'admin_set_optik':
      handleAdminSetOptik(ws, msg, adminRoom, deps);
      break;
    case 'figure_type_set':
      handleFigureTypeSet(ws, msg, adminRoom, deps);
      break;
    case 'session_undo':
      handleSessionUndo(ws, msg, adminRoom, deps);
      break;
    case 'session_redo':
      handleSessionRedo(ws, msg, adminRoom, deps);
      break;
    case 'admin_set_template':
      await handleAdminSetTemplate(ws, msg, adminRoom, deps);
      break;
    case 'admin_set_board_template':
      await handleAdminSetBoardTemplate(ws, msg, adminRoom, deps);
      break;
    case 'admin_reset_board_to_default':
      await handleAdminResetBoardToDefault(ws, msg, adminRoom, deps);
      break;
    case 'admin_spotlight_set':
      handleAdminSpotlightSet(ws, msg, adminRoom, deps);
      break;
    case 'admin_dim_set':
      handleAdminDimSet(ws, msg, adminRoom, deps);
      break;
    case 'admin_freeze_set':
      handleAdminFreezeSet(ws, msg, adminRoom, deps);
      break;
    case 'anchor_create':
      handleAnchorCreate(ws, msg, adminRoom, deps);
      break;
    case 'anchor_delete':
      handleAnchorDelete(ws, msg, adminRoom, deps);
      break;
    case 'zone_create':
      handleZoneCreate(ws, msg, adminRoom, deps);
      break;
    case 'zone_update':
      handleZoneUpdate(ws, msg, adminRoom, deps);
      break;
    case 'zone_delete':
      handleZoneDelete(ws, msg, adminRoom, deps);
      break;
    case 'figure_hide_set':
      handleFigureHideSet(ws, msg, adminRoom, deps);
      break;
    case 'line_create':
      handleLineCreate(ws, msg, adminRoom, deps);
      break;
    case 'line_delete':
      handleLineDelete(ws, msg, adminRoom, deps);
      break;
    case 'line_type_set':
      handleLineTypeSet(ws, msg, adminRoom, deps);
      break;
  }
}

export function startIdleSweep(deps: { checkAllSessions: () => any[]; broadcast: (room: string, msg: any) => void; schedulePersist: (room: string) => void }): NodeJS.Timeout {
  const timer = setInterval(() => {
    if (process.env.MOCK_DB === 'true') return;
    const results = deps.checkAllSessions();
    for (const r of results) {
      if (r.ended) {
        deps.broadcast(r.room, {
          type: 'session_phase_change',
          phase: 'ended',
          transitionedAt: new Date().toISOString(),
          reason: 'idle-timeout',
        });
        deps.broadcast(r.room, { type: 'session_ended', reason: 'idle-timeout' });
        deps.schedulePersist(r.room);
      }
    }
  }, 60_000);
  if (timer.unref) timer.unref();
  return timer;
}
