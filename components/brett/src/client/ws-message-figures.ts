import { STATE, currentUser, getWs, isWsReady, getScene } from './state';
import type { ServerMessage } from '../types/messages';
import { updateExportCache } from './ui/export';
import * as mannequin from './mannequin';
import { PRESETS } from './presets';
import { toExportFig } from './ws-export-mappers';

// Figure-lifecycle cases of onWsMessage (add/update/move/jump/delete,
// possession, notes, hidden). Everything except the appearance injector is
// module-importable; the injector stays owned by ws-client.ts (cycle with
// appearance.ts) and arrives via context, like SnapshotCtx.
export interface FigureMsgCtx {
  applyAppearance: (fig: any, a: any) => void;
}

export function handleFigureMessage(msg: ServerMessage, ctx: FigureMsgCtx): void {
  switch (msg.type) {
    case 'add': {
      if (STATE.figures.find(f => f.id === msg.figure.id)) break;
      const fig = mannequin.makeMannequin(msg.figure.id, { x: msg.figure.x, z: msg.figure.z });
      (fig as any)._serverPossessor = (msg.figure as any).possessor ?? null;
      if (msg.figure.appearance) {
        ctx.applyAppearance(fig, msg.figure.appearance);
      }
      STATE.figures.push(fig);
      // Export-Cache mit aktuellen STATE.figures synchronisieren:
      updateExportCache({ figures: STATE.figures.map(toExportFig) });
      break;
    }
    case 'update': {
      const fig = STATE.figures.find(f => f.id === msg.id);
      if (!fig) break;
      const c = msg.changes || {};
      if (c.preset && PRESETS[c.preset]) {
        for (const name of mannequin.BONE_NAMES) {
          fig.bone[name].targetRot.x = PRESETS[c.preset][name].x;
          fig.bone[name].targetRot.z = PRESETS[c.preset][name].z;
        }
      }
      if (c.boneOverrides !== undefined) {
        fig.boneOverrides = { ...c.boneOverrides };
      }
      if (c.appearance !== undefined) {
        ctx.applyAppearance(fig, c.appearance);
      }
      // E2: Figuren-Opacity live übernehmen (Selektions-Dim berücksichtigen).
      if ((c as any).opacity !== undefined) {
        (fig as any).opacity = (c as any).opacity;
        mannequin.applyFigureOpacity(fig, STATE.selectedId === fig.id ? 1.0 : 0.55);
      }
      // Export-Cache mit aktuellen STATE.figures synchronisieren:
      updateExportCache({ figures: STATE.figures.map(toExportFig) });
      break;
    }
    case 'move': {
      const fig = STATE.figures.find(f => f.id === msg.id);
      if (!fig) break;
      fig.root.position.x = msg.x;
      fig.root.position.z = msg.z;
      if (typeof msg.facingY === 'number') {
        fig.facingY = msg.facingY;
        fig.root.rotation.y = fig.facingY;
      }
      mannequin.resolveCollisions(fig, mannequin.BOUNCE_K_DRAG);
      // Export-Cache mit aktuellen STATE.figures synchronisieren:
      updateExportCache({ figures: STATE.figures.map(toExportFig) });
      break;
    }

    case 'jump': {
      const fig = STATE.figures.find(f => f.id === msg.id);
      if (fig && !fig.jumping) {
        mannequin.startJump(fig);
      }
      break;
    }

    case 'delete': {
      const idx = STATE.figures.findIndex(f => f.id === msg.id);
      if (idx >= 0) {
        try {
          mannequin.disposeMannequin(STATE.figures[idx]);
          getScene().scene.remove(STATE.figures[idx].root);
        } catch { /* pre-scene */ }
        // Billboard-Cleanup (Feature-Flag sf-t000469)
        import('./ui/hud').then(m => {
          if (typeof (m as any).clearFigureNoteBillboard === 'function') {
            (m as any).clearFigureNoteBillboard(msg.id);
          }
        }).catch(() => {});
        STATE.figures.splice(idx, 1);
      }
      // Export-Cache mit aktuellen STATE.figures synchronisieren:
      updateExportCache({ figures: STATE.figures.map(toExportFig) });
      break;
    }

    case 'figure_possessed': {
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) (fig as any)._serverPossessor = msg.playerId;
      // Start POV if it's our own possession
      if (msg.playerId === currentUser.userId) {
        // E5: POV starten und Panel mit unserer Instanzwelt versorgen — das
        // Panel darf state/pov-camera nicht selbst importieren (der Build
        // dupliziert diese Module über die Multi-Entry-Chunks; eine
        // Zweitinstanz sähe currentUser='anon' und leere Figuren).
        Promise.all([import('./pov-camera'), import('./ui/pov-panel')]).then(([pov, panel]) => {
          pov.startPov(msg.figureId);
          panel.refreshPovPanelForOwnPossession(msg.figureId, msg.playerId, {
            figures: () => STATE.figures.map(f => ({ id: f.id, label: (f as any).label, color: (f as any).color })),
            sendRelease: (figureId: string) => {
              const ws = getWs();
              if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'figure_release', figureId }));
            },
            switchPov: (figureId: string) => {
              const prev = pov.getPovFigureId();
              pov.switchPov(figureId);
              const ws = getWs();
              if (isWsReady() && ws && prev !== figureId) {
                if (prev) ws.send(JSON.stringify({ type: 'figure_release', figureId: prev }));
                ws.send(JSON.stringify({ type: 'figure_possess', figureId }));
              }
            },
            setPovMode: pov.setPovMode,
            isMeta: pov.isMeta,
            getPovFigureId: pov.getPovFigureId,
          });
        });
      }
      break;
    }
    case 'figure_released': {
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) (fig as any)._serverPossessor = null;
      // Stop POV if it was our possession — but only if the released figure
      // is still the active POV figure (a switchPov releases the OLD figure
      // after the new POV already started; that echo must not kill it).
      if (msg.playerId === currentUser.userId) {
        Promise.all([import('./pov-camera'), import('./ui/pov-panel')]).then(([pov, panel]) => {
          if (pov.getPovFigureId() === msg.figureId || pov.getPovFigureId() === null) {
            pov.stopPov();
            panel.unmountPovPanel();
          }
        });
      }
      break;
    }

    case 'figure_note_changed': {
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) {
        (fig as any).note = msg.note;
        // Panel aktualisieren wenn diese Figur gerade selektiert ist
        if (STATE.selectedId === msg.figureId) {
          const noteArea = document.getElementById('fig-note-textarea') as HTMLTextAreaElement | null;
          if (noteArea) noteArea.value = msg.note;
        }
        // Billboard update (Feature-Flag sf-t000469)
        const feats: Record<string, boolean> =
          (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
        if (feats['sf-t000469']) {
          import('./ui/hud').then(m => {
            if (typeof (m as any).setFigureNoteBillboard === 'function') {
              (m as any).setFigureNoteBillboard(msg.figureId, msg.note);
            }
          }).catch(() => {});
        }
      }
      break;
    }

    case 'figure_hidden_changed': {
      // E9: NUR der Leiter erhält diese Message (Server übersetzt sie für
      // Nicht-Leiter in add/delete). Lokalen hidden-State + Visuals aktualisieren.
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) {
        (fig as any).hidden = msg.hidden;
        mannequin.applyFigureOpacity(fig, STATE.selectedId === fig.id ? 1.0 : 0.55);
        mannequin.updateHiddenBadge(fig);
      }
      break;
    }

    default:
      break;
  }
}
