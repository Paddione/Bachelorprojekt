// brett/src/client/mannequin-visuals.ts
// Possession- und Moderation-Visuals für Figuren.

export { updateModerationVisuals, clearModerationVisuals, type ModerationVisualState } from './mannequin-moderation';

/** Update all figure possession rings + floating labels based on _serverPossessor. */
export function updatePossessionVisuals(figures: any[], currentUserId: string): void {
  const now = performance.now();
  for (const fig of figures) {
    const possessor: string | null = fig._serverPossessor ?? null;
    const isMine = possessor === currentUserId;
    const isOthers = possessor && possessor !== currentUserId;

    if (!possessor) {
      // Free figure — dashed brass ring (pulsing)
      fig.possessionRing.visible = true;
      fig.possessionRing.material.opacity = 0.3 + Math.sin(now * 0.003) * 0.12;
      fig.possessionRing.material.color.set(0xc8a96e); // brass
      fig.labelSprite.visible = false;
    } else if (isMine) {
      // Own possession — solid brass ring + label
      fig.possessionRing.visible = true;
      fig.possessionRing.material.opacity = 0.75;
      fig.possessionRing.material.color.set(0xc8a96e); // brass
      updatePossessorLabel(fig, 'ICH', '#c8a96e');
    } else if (isOthers) {
      // Foreign possession — sage ring + name label
      fig.possessionRing.visible = true;
      fig.possessionRing.material.opacity = 0.5;
      fig.possessionRing.material.color.set(0x7fa37a); // sage
      const name = possessor.length > 12 ? possessor.slice(0, 12) + '…' : possessor;
      updatePossessorLabel(fig, name, '#7fa37a');
    }
  }
}

function updatePossessorLabel(fig: any, text: string, hexColor: string): void {
  const upperText = text.toUpperCase();
  // Cache: Bei unverändertem Text kein Canvas-Redraw und kein needsUpdate.
  if (fig._lastLabelText === upperText) {
    fig.labelSprite.visible = true;
    return;
  }
  fig._lastLabelText = upperText;
  const canvas = fig.labelSprite.material.map.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 18px "Geist Mono", monospace';
  ctx.fillStyle = hexColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(upperText, 128, 32);
  fig.labelSprite.material.map.needsUpdate = true;
  fig.labelSprite.visible = true;
}

export function clearPossessionVisuals(fig: any): void {
  fig.possessionRing.visible = false;
  fig.labelSprite.visible = false;
  fig._lastLabelText = undefined;  // Cache invalidieren
}
