// Type declarations for Brett's window-exposed globals (set in brett/public/index.html)
interface BrettCameraState {
  mode: 'orbit' | 'pov' | 'auto' | 'freefly';
  theta: number;
  phi: number;
  radius: number;
  target: { x: number; y: number; z: number };
  povFigureId: string | null;
  povYaw: number;
  povPitch: number;
  fov: number;
  flyPos: { x: number; y: number; z: number };
  flyYaw: number;
  flyPitch: number;
  flySpeed: number;
  autoSpeed: number;
  autoPausedUntil: number;
  anim: unknown | null;
}

interface BrettBarsState {
  state: { rail: boolean; dock: boolean; top: boolean };
}

interface BrettBookmarks {
  items: Array<{ name: string; snap: unknown }>;
  render(): void;
}

interface Window {
  camera: BrettCameraState;
  easeCamera: (to: Partial<BrettCameraState>, dur?: number, easing?: string, onDone?: (() => void) | null) => void;
  snapshot: () => BrettCameraState;
  goToPreset: (n: number) => void;
  goHome: () => void;
  goFit: () => void;
  setActiveTool: (t: string) => void;
  getActiveTool: () => string;
  Bars: BrettBarsState;
  Bookmarks: BrettBookmarks;
  __xss?: number;
}
