import { initScene } from './scene';
import { STATE } from './state';
import * as mannequin from './mannequin';

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

export {};
