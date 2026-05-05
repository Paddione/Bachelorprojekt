<script lang="ts">
  import { onMount } from 'svelte';

  let frame: HTMLDivElement;
  let stage: HTMLDivElement;
  let img: HTMLImageElement;

  let scale = 1;
  let tx = 0;
  let ty = 0;

  const MIN = 0.5;
  const MAX = 6;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  // pinch state
  let pinchStartDist = 0;
  let pinchStartScale = 1;

  function clampScale(s: number): number {
    return Math.min(MAX, Math.max(MIN, s));
  }

  function apply() {
    if (!stage) return;
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function reset() {
    scale = 1;
    tx = 0;
    ty = 0;
    apply();
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top - rect.height / 2;
    const next = clampScale(scale * factor);
    const ratio = next / scale;
    tx = px - (px - tx) * ratio;
    ty = py - (py - ty) * ratio;
    scale = next;
    apply();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(e.clientX, e.clientY, factor);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    tx += e.clientX - lastX;
    ty += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    apply();
  }

  function onPointerUp(e: PointerEvent) {
    dragging = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.hypot(dx, dy);
      pinchStartScale = scale;
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (e.touches.length === 2 && pinchStartDist > 0) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / pinchStartDist;
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const next = clampScale(pinchStartScale * factor);
      const ratio = next / scale;
      const rect = frame.getBoundingClientRect();
      const px = cx - rect.left - rect.width / 2;
      const py = cy - rect.top - rect.height / 2;
      tx = px - (px - tx) * ratio;
      ty = py - (py - ty) * ratio;
      scale = next;
      apply();
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (e.touches.length < 2) pinchStartDist = 0;
  }

  onMount(() => {
    apply();
  });
</script>

<figure class="w-topology" aria-labelledby="topology-caption">
  <div
    class="w-topology-frame"
    bind:this={frame}
    on:wheel={onWheel}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
    on:pointerleave={onPointerUp}
    on:touchstart={onTouchStart}
    on:touchmove={onTouchMove}
    on:touchend={onTouchEnd}
    role="img"
    aria-label="Interaktive Cluster-Topologie. Ziehen zum Verschieben, Mausrad oder Pinch zum Zoomen."
  >
    <div class="stage" bind:this={stage}>
      <img
        bind:this={img}
        src="/brand/korczewski/kore-assets/topology-12node.svg"
        alt="Cluster-Topologie: sechs Hetzner-Control-Planes in Helsinki und sechs Worker im Home-LAN, verbunden über einen WireGuard-Tunnel durch pk-hetzner."
        draggable="false"
        decoding="async"
        width="1280"
        height="820"
      />
    </div>

    <div class="controls" aria-hidden="false">
      <button type="button" class="ctl" on:click={() => zoomAt(frame.getBoundingClientRect().left + frame.clientWidth / 2, frame.getBoundingClientRect().top + frame.clientHeight / 2, 1.25)} aria-label="Hineinzoomen">+</button>
      <button type="button" class="ctl" on:click={() => zoomAt(frame.getBoundingClientRect().left + frame.clientWidth / 2, frame.getBoundingClientRect().top + frame.clientHeight / 2, 1 / 1.25)} aria-label="Herauszoomen">−</button>
      <button type="button" class="ctl reset" on:click={reset} aria-label="Ansicht zurücksetzen">⟲</button>
    </div>

    <div class="hint" aria-hidden="true">Ziehen · Scrollen zum Zoomen</div>
  </div>

  <figcaption id="topology-caption">
    <span class="cap-num">Fig. 01</span>
    <span class="cap-text">
      Topologie des Produktiv-Clusters: 6 Control-Planes (Hetzner&nbsp;Helsinki) und 6 Worker
      (Home-LAN, DE), gekoppelt durch <em class="em">wg0</em> über <em class="em">pk-hetzner</em>.
      System-Pods bleiben Hetzner-seitig, Nutzer-Workloads laufen auf den Workern.
    </span>
  </figcaption>
</figure>

<style>
  .w-topology {
    margin: 56px 0 0;
    padding: 0;
  }

  .w-topology-frame {
    position: relative;
    border: 1px solid var(--line, rgba(255, 255, 255, 0.07));
    border-radius: 6px;
    background:
      linear-gradient(180deg, rgba(200, 247, 106, 0.015), transparent 60%),
      var(--ink-850, #1a1326);
    padding: 28px 32px;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    user-select: none;
    min-height: 520px;
  }

  .w-topology-frame:active {
    cursor: grabbing;
  }

  .stage {
    transform-origin: center center;
    transition: transform 60ms linear;
    will-change: transform;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .stage img {
    display: block;
    width: 100%;
    height: auto;
    max-width: 1100px;
    pointer-events: none;
    -webkit-user-drag: none;
  }

  .controls {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 2;
  }

  .ctl {
    width: 30px;
    height: 30px;
    border-radius: 4px;
    border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
    background: rgba(0, 0, 0, 0.45);
    color: var(--ink-50, #e7e1d6);
    font-family: var(--mono);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    transition: border-color 120ms, background 120ms;
  }

  .ctl:hover {
    border-color: var(--copper, #b87333);
    background: rgba(0, 0, 0, 0.65);
  }

  .ctl.reset {
    font-size: 14px;
  }

  .hint {
    position: absolute;
    left: 14px;
    bottom: 10px;
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--mute, rgba(231, 225, 214, 0.45));
    pointer-events: none;
    z-index: 1;
  }

  figcaption {
    display: flex;
    gap: 18px;
    align-items: baseline;
    margin-top: 16px;
    padding: 0 4px;
  }

  .cap-num {
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--copper);
    flex-shrink: 0;
    padding-top: 2px;
  }

  .cap-text {
    font-family: var(--sans);
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--mute);
    max-width: 78ch;
  }

  @media (max-width: 720px) {
    .w-topology { margin-top: 40px; }
    .w-topology-frame { padding: 16px 14px; min-height: 360px; }
    figcaption { flex-direction: column; gap: 6px; }
    .hint { display: none; }
  }
</style>
