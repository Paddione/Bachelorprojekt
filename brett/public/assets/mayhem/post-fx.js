// brett/public/assets/mayhem/post-fx.js
// P4.1 — ACESFilmic tone-mapping + screen-space bloom approximation.
// Ships without Three.js addons: uses native renderer tone-mapping + a lightweight
// CSS canvas-filter bloom that composites above the WebGL canvas.
//
// Usage:
//   window.__brettPostFx = PostFx.init(renderer);
//   // In resize handler:
//   window.__brettPostFx?.resize(w, h);
//   // In tick (replaces renderer.render):
//   window.__brettPostFx?.render(scene, camera);
//   // or: renderer.render(scene, camera); // still works — bloom adds on top

'use strict';

const PostFx = (() => {
  let _renderer = null;
  let _bloomCanvas = null;
  let _bloomCtx = null;
  let _enabled = true;

  /**
   * Initialise post-fx.
   * @param {THREE.WebGLRenderer} renderer
   * @returns {{ render: Function, resize: Function, setEnabled: Function }}
   */
  function init(renderer) {
    _renderer = renderer;

    // ── P4.1a: ACESFilmic tone-mapping ─────────────────────────────────────
    // THREE.ACESFilmicToneMapping = 4 (bundled three.min.js constant)
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    // ── P4.1b: CSS-filter bloom overlay ────────────────────────────────────
    // A <canvas> sits on top of the WebGL canvas. Each frame we copy the
    // emissive-bright pixels (those above a brightness threshold) and apply a
    // CSS blur + screen blend, mimicking UnrealBloomPass at near-zero perf cost.
    _bloomCanvas = document.createElement('canvas');
    _bloomCanvas.id = 'brett-bloom-overlay';
    _bloomCanvas.style.cssText = [
      'position:absolute',
      'top:36px',
      'left:0',
      'pointer-events:none',
      'mix-blend-mode:screen',
      'filter:blur(8px) brightness(1.4)',
      'opacity:0.55',
      'z-index:2',
    ].join(';');
    document.body.appendChild(_bloomCanvas);
    _bloomCtx = _bloomCanvas.getContext('2d');

    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    _bloomCanvas.width  = Math.ceil(w / 4);   // quarter-res for perf
    _bloomCanvas.height = Math.ceil(h / 4);

    return { render, resize, setEnabled };
  }

  /**
   * Call instead of (or after) renderer.render().
   * Extracts bright pixels from the WebGL canvas and paints them to the
   * bloom overlay — the CSS blur + screen blend does the rest.
   */
  function render(scene, camera) {
    _renderer.render(scene, camera);
    if (!_enabled || !_bloomCtx) return;

    const src = _renderer.domElement;
    const bw = _bloomCanvas.width, bh = _bloomCanvas.height;

    // Draw the rendered frame at quarter resolution
    _bloomCtx.drawImage(src, 0, 0, bw, bh);

    // Threshold: keep only bright pixels (approximate emissive glow)
    const imgData = _bloomCtx.getImageData(0, 0, bw, bh);
    const data = imgData.data;
    const THRESHOLD = 160; // 0–255; ~0.63 linear
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      if (lum < THRESHOLD) {
        data[i] = data[i+1] = data[i+2] = data[i+3] = 0; // discard dark pixels
      }
    }
    _bloomCtx.putImageData(imgData, 0, 0);
  }

  function resize(w, h) {
    if (!_bloomCanvas) return;
    _bloomCanvas.style.width  = w + 'px';
    _bloomCanvas.style.height = h + 'px';
    _bloomCanvas.width  = Math.ceil(w / 4);
    _bloomCanvas.height = Math.ceil(h / 4);
  }

  function setEnabled(on) {
    _enabled = on;
    if (_bloomCanvas) _bloomCanvas.style.display = on ? '' : 'none';
  }

  return { init };
})();

window.BrettPostFx = PostFx;
