import { initScene } from './scene';
import { STATE } from './state';
import * as mannequin from './mannequin';
import * as wsClient from './ws-client';

import * as presets from './presets';

(window as any).STATE = STATE;               // inline code still reads window.STATE
const sceneApi = initScene();
(window as any).scene = sceneApi.scene;       // inline code reads bare `scene`
(window as any).camera = sceneApi.camera;
(window as any).renderer = sceneApi.renderer;
(window as any).floor = sceneApi.floor;
(window as any).__brettFloor = sceneApi.floor;
(window as any).updateCameraFromOrbit = sceneApi.updateCameraFromOrbit;

(window as any).makeMannequin = mannequin.makeMannequin;
(window as any).recolorFigure = mannequin.recolorFigure;
(window as any).tickSpring = mannequin.tickSpring;
(window as any).startJump = mannequin.startJump;
(window as any).resolveCollisions = mannequin.resolveCollisions;
(window as any).pickContact = mannequin.pickContact;
(window as any).pickMannequinBody = mannequin.pickMannequinBody;
(window as any).pickFloor = mannequin.pickFloor;
(window as any).ccdIK = mannequin.ccdIK;
(window as any).BONE_NAMES = mannequin.BONE_NAMES;
(window as any).IK_CHAINS = mannequin.IK_CHAINS;

(window as any).PRESETS = presets.PRESETS;
(window as any).applyPreset = presets.applyPreset;

mannequin.setSendMove(wsClient.sendMove);

wsClient.setLockBadgeFns({
  setFigureLockBadge: (...a) => (window as any).setFigureLockBadge(...a),
  clearFigureLockBadge: (...a) => (window as any).clearFigureLockBadge(...a),
  clearLockBadgesForUser: (...a) => (window as any).clearLockBadgesForUser(...a),
  cancelDragFor: (...a) => (window as any).cancelDragFor(...a),
});

wsClient.setApplyAppearance((fig, a) => (window as any).applyAppearanceToFig(fig, a));

(window as any).sendMove = wsClient.sendMove;
(window as any).sendJump = wsClient.sendJump;
(window as any).sendUpdate = wsClient.sendUpdate;
(window as any).sendStiffness = wsClient.sendStiffness;
(window as any).sendDelete = wsClient.sendDelete;
(window as any).sendAddFigure = wsClient.sendAddFigure;

wsClient.connectWS();

export {};
