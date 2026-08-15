import * as THREE from 'three';

export interface ModerationVisualState {
  spotlight: string | null;
  dim: string | null;
  freeze: boolean;
}

const SPOTLIGHT_EMISSIVE = new THREE.Color(0xc8a96e);
const DIM_OPACITY = 0.18;
const FREEZE_TINT = new THREE.Color(0x7dc8f7);

export function updateModerationVisuals(figures: any[], state: ModerationVisualState): void {
  const hasModeration = state.spotlight !== null || state.dim !== null || state.freeze;

  for (const fig of figures) {
    const isSpotlit = state.spotlight !== null && fig.id === state.spotlight;
    const isDimTarget = state.dim !== null && fig.id === state.dim;
    const shouldGlow  = isSpotlit || isDimTarget;
    const shouldDim   = (state.spotlight !== null && !isSpotlit) ||
                        (state.dim !== null && !isDimTarget);

    if (fig.freezeSprite) {
      fig.freezeSprite.visible = state.freeze;
    }

    if (hasModeration && !fig._moderationCache) {
      fig._moderationCache = new Map<string, { color: THREE.Color; emissive: THREE.Color; opacity: number; transparent: boolean }>();
      fig.root.traverse((o: any) => {
        if (o.isMesh && o.material && !o.userData.isContact && o !== fig.ring && o !== fig.possessionRing) {
          const m = o.material;
          fig._moderationCache.set(o.uuid, {
            color: m.color.clone(),
            emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
            opacity: m.opacity ?? 1,
            transparent: m.transparent ?? false,
          });
        }
      });
    }

    if (!hasModeration && fig._moderationCache) {
      fig.root.traverse((o: any) => {
        if (o.isMesh && o.material && !o.userData.isContact && o !== fig.ring && o !== fig.possessionRing) {
          const cached = fig._moderationCache.get(o.uuid);
          if (cached) {
            o.material.color.copy(cached.color);
            if (o.material.emissive) o.material.emissive.copy(cached.emissive);
            o.material.opacity = cached.opacity;
            o.material.transparent = cached.transparent;
            o.material.needsUpdate = true;
          }
        }
      });
      fig._moderationCache = null;
      continue;
    }

    if (!hasModeration) continue;

    fig.root.traverse((o: any) => {
      if (o.isMesh && o.material && !o.userData.isContact && o !== fig.ring && o !== fig.possessionRing) {
        const m = o.material;
        if (shouldGlow && m.emissive) {
          m.emissive.copy(SPOTLIGHT_EMISSIVE);
          (m as any).emissiveIntensity = 0.55;
          m.opacity = 1.0;
          m.transparent = false;
        }
        if (shouldDim) {
          m.opacity = DIM_OPACITY;
          m.transparent = true;
          if (m.emissive) m.emissive.set(0x000000);
        }
        if (state.freeze) {
          const cached = fig._moderationCache?.get(o.uuid);
          const baseColor = cached ? cached.color : m.color;
          m.color.copy(baseColor).lerp(FREEZE_TINT, 0.3);
        }
        m.needsUpdate = true;
      }
    });
  }
}

export function clearModerationVisuals(figures: any[]): void {
  updateModerationVisuals(figures, { spotlight: null, dim: null, freeze: false });
}
