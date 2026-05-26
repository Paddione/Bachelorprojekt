'use strict';

(function () {
  function makeFrostnovaTexture() {
    const THREE = window.THREE;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');

    g.clearRect(0, 0, 256, 256);

    const cx = 128, cy = 128;

    // Draw central soft halo
    const halo = g.createRadialGradient(cx, cy, 5, cx, cy, 95);
    halo.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    halo.addColorStop(0.3, 'rgba(111, 168, 216, 0.25)'); // stille-blau
    halo.addColorStop(1, 'rgba(111, 168, 216, 0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(cx, cy, 95, 0, Math.PI * 2);
    g.fill();

    // Draw 6 main snowflake arms
    g.strokeStyle = '#6fa8d8'; // stille-blau
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Main arm
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + cos * 85, cy + sin * 85);
      g.stroke();

      // Branches at distance 45
      const bx1 = cx + cos * 45;
      const by1 = cy + sin * 45;
      const angleL = angle + Math.PI / 6;
      const angleR = angle - Math.PI / 6;

      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(bx1, by1);
      g.lineTo(bx1 + Math.cos(angleL) * 22, by1 + Math.sin(angleL) * 22);
      g.moveTo(bx1, by1);
      g.lineTo(bx1 + Math.cos(angleR) * 22, by1 + Math.sin(angleR) * 22);
      g.stroke();

      // Branches at distance 70
      const bx2 = cx + cos * 70;
      const by2 = cy + sin * 70;
      g.beginPath();
      g.moveTo(bx2, by2);
      g.lineTo(bx2 + Math.cos(angleL) * 14, by2 + Math.sin(angleL) * 14);
      g.moveTo(bx2, by2);
      g.lineTo(bx2 + Math.cos(angleR) * 14, by2 + Math.sin(angleR) * 14);
      g.stroke();
    }

    // Draw hexagonal inner ring
    g.lineWidth = 2.5;
    g.beginPath();
    for (let i = 0; i <= 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = cx + Math.cos(angle) * 28;
      const y = cy + Math.sin(angle) * 28;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();

    // Draw central white-hot hexagonal core
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = cx + Math.cos(angle) * 11;
      const y = cy + Math.sin(angle) * 11;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();

    // Tiny sparks
    g.fillStyle = '#6fa8d8';
    const sparks = [
      { x: cx - 55, y: cy - 40, r: 3 },
      { x: cx + 60, y: cy - 25, r: 2.5 },
      { x: cx + 30, y: cy + 65, r: 3.5 },
      { x: cx - 40, y: cy + 50, r: 2 },
    ];
    for (const s of sparks) {
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      g.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeFireballTexture() {
    const THREE = window.THREE;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');

    g.clearRect(0, 0, 256, 256);

    const cx = 128, cy = 128;

    // Deep-red background puff (asymmetric)
    const redGrad = g.createRadialGradient(cx + 8, cy - 8, 10, cx, cy, 80);
    redGrad.addColorStop(0, 'rgba(196, 69, 58, 0.9)'); // blood-bright
    redGrad.addColorStop(0.6, 'rgba(196, 69, 58, 0.45)');
    redGrad.addColorStop(1, 'rgba(196, 69, 58, 0)');
    g.fillStyle = redGrad;
    g.beginPath();
    g.arc(cx - 15, cy + 10, 48, 0, Math.PI * 2);
    g.arc(cx + 20, cy - 15, 58, 0, Math.PI * 2);
    g.arc(cx, cy, 70, 0, Math.PI * 2);
    g.fill();

    // Yellow/brass middle flame tongues züngelnd (pointing right-upward slightly)
    g.fillStyle = '#c8a96e'; // brass
    g.beginPath();
    // Tongue 1
    g.moveTo(cx - 25, cy + 15);
    g.quadraticCurveTo(cx - 28, cy - 25, cx + 5, cy - 50);
    g.quadraticCurveTo(cx + 8, cy - 10, cx + 15, cy + 5);
    // Tongue 2
    g.moveTo(cx - 5, cy + 25);
    g.quadraticCurveTo(cx + 25, cy - 35, cx + 45, cy - 60);
    g.quadraticCurveTo(cx + 38, cy - 5, cx + 25, cy + 18);
    // Tongue 3
    g.moveTo(cx - 35, cy - 5);
    g.quadraticCurveTo(cx - 15, cy - 60, cx - 22, cy - 72);
    g.quadraticCurveTo(cx - 5, cy - 40, cx - 10, cy - 10);
    g.closePath();
    g.fill();

    // Radial gradient core (white/fire-tip to yellow)
    const coreGrad = g.createRadialGradient(cx + 8, cy - 8, 2, cx + 5, cy - 5, 34);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.3, '#fff5c8'); // fire-tip
    coreGrad.addColorStop(0.7, '#c8a96e'); // brass
    coreGrad.addColorStop(1, 'rgba(200, 169, 110, 0)');
    g.fillStyle = coreGrad;
    g.beginPath();
    g.arc(cx + 5, cy - 5, 34, 0, Math.PI * 2);
    g.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeChainSegmentTexture() {
    const THREE = window.THREE;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');

    g.clearRect(0, 0, 256, 256);

    // Left-middle (start) is pivot at x=40, y=128
    // Right-middle (end) is at x=216, y=128
    const sx = 40, sy = 128;
    const ex = 216, ey = 128;

    // Segment points (zigzag path)
    const pts = [
      { x: sx, y: sy },
      { x: 74, y: 104 },
      { x: 108, y: 148 },
      { x: 138, y: 92 },
      { x: 168, y: 156 },
      { x: 194, y: 112 },
      { x: ex, y: ey }
    ];

    // 1. Draw soft stille-blau halo glow (thick line)
    g.strokeStyle = '#6fa8d8';
    g.lineWidth = 14;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.stroke();

    // 2. Draw white-hot core (thinner line)
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4.2;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.stroke();

    // 3. Bright node flares at start and end
    function drawNode(x, y) {
      const nodeGrad = g.createRadialGradient(x, y, 1, x, y, 14);
      nodeGrad.addColorStop(0, '#ffffff');
      nodeGrad.addColorStop(0.3, '#ffffff');
      nodeGrad.addColorStop(0.6, '#6fa8d8');
      nodeGrad.addColorStop(1, 'rgba(111, 168, 216, 0)');
      g.fillStyle = nodeGrad;
      g.beginPath();
      g.arc(x, y, 14, 0, Math.PI * 2);
      g.fill();
    }

    drawNode(sx, sy);
    drawNode(ex, ey);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  if (typeof window !== 'undefined') {
    window.MayhemTinaVfx = {
      makeFrostnovaTexture,
      makeFireballTexture,
      makeChainSegmentTexture
    };
  }
})();
