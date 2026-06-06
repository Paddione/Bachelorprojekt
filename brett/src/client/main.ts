import { initScene } from './scene';
import { STATE } from './state';

(window as any).STATE = STATE;               // inline code still reads window.STATE
const sceneApi = initScene();
(window as any).scene = sceneApi.scene;       // inline code reads bare `scene`
(window as any).camera = sceneApi.camera;
(window as any).renderer = sceneApi.renderer;
(window as any).floor = sceneApi.floor;
(window as any).__brettFloor = sceneApi.floor;
(window as any).updateCameraFromOrbit = sceneApi.updateCameraFromOrbit;
export {};
