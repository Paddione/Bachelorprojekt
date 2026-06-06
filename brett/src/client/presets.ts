import { STATE } from './state';
import { BONE_NAMES } from './mannequin';
import { sendUpdate } from './ws-client';

export const PRESETS: Record<string, Record<string, { x: number; z: number }>> = {
  stand: {
    hips:{x:0,z:0}, head:{x:0,z:0},
    lShoulder:{x:0,z: 0.05}, rShoulder:{x:0,z:-0.05},
    lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:0,z:0}, rHip:{x:0,z:0},
    lKnee:{x:0,z:0}, rKnee:{x:0,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
  kneel: {
    hips:{x:0,z:0}, head:{x:-0.05,z:0},
    lShoulder:{x:0.1,z: 0.25}, rShoulder:{x:0.1,z:-0.25},
    lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:-1.3,z:0}, rHip:{x:-1.3,z:0},
    lKnee:{x: 1.7,z:0}, rKnee:{x: 1.7,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
  prone: {
    hips:{x:-1.5,z:0}, head:{x:0.2,z:0},
    lShoulder:{x:-1.2,z: 0.1}, rShoulder:{x:-1.2,z:-0.1},
    lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:0,z:0}, rHip:{x:0,z:0},
    lKnee:{x:0,z:0}, rKnee:{x:0,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
  crawl: {
    hips:{x:-1.4,z:0}, head:{x:0.15,z:0},
    lShoulder:{x:-1.3,z: 0.05}, rShoulder:{x:-1.3,z:-0.05},
    lElbow:{x:0.1,z:0}, rElbow:{x:0.1,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:-1.3,z:0}, rHip:{x:-1.3,z:0},
    lKnee:{x: 1.55,z:0}, rKnee:{x: 1.55,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
  slump: {
    hips:{x:-0.7,z:0}, head:{x:0.5,z:0},
    lShoulder:{x:0.6,z: 0.35}, rShoulder:{x:0.6,z:-0.35},
    lElbow:{x:0.4,z:0}, rElbow:{x:0.4,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:-1.4,z:0}, rHip:{x:-1.4,z:0},
    lKnee:{x: 1.3,z:0}, rKnee:{x: 1.3,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
  tpose: {
    hips:{x:0,z:0}, head:{x:0,z:0},
    lShoulder:{x:0,z: 1.5708}, rShoulder:{x:0,z:-1.5708},
    lElbow:{x:0,z:0}, rElbow:{x:0,z:0},
    lWrist:{x:0,z:0}, rWrist:{x:0,z:0},
    lHip:{x:0,z:0}, rHip:{x:0,z:0},
    lKnee:{x:0,z:0}, rKnee:{x:0,z:0},
    lAnkle:{x:0,z:0}, rAnkle:{x:0,z:0},
  },
};

export function applyPreset(figId: string, presetKey: string): void {
  const fig = STATE.figures.find(f => f.id === figId);
  if (!fig || !PRESETS[presetKey]) return;
  const p = PRESETS[presetKey];
  for (const name of BONE_NAMES) {
    fig.bone[name].targetRot.x = p[name].x;
    fig.bone[name].targetRot.z = p[name].z;
  }

  sendUpdate(fig, { preset: presetKey });
}
