# Coaching · UI Kit

The original surface of Brett. A 3D systemic-constellation board where the user places, dresses, and poses Bauhaus-style mannequins. Calm. German. Dark slate, sage figures, brass accents.

This kit replicates the live UI from `brett/public/index.html` — topbar, status pill, figure-editor popover, appearance drawer, preset toolbar. The 3D scene itself is rendered as a CSS-perspective placeholder (the production app uses Three.js); the surrounding chrome is pixel-faithful to production.

## Components

- **`Topbar.jsx`** — fixed-top 36px bar: pose presets, stiffness slider (🌡 PHYS ↔ IK 🎯), `＋ Figur ▾` editor toggle, `✦ Aussehen` drawer toggle, online indicator.
- **`FigureEditor.jsx`** — the floating popover for creating / editing a figure: color swatches, size buttons + slider, name input, place-on-board CTA.
- **`AppearanceDrawer.jsx`** — slides in from right. Face grid, body type, accessory groups (head / upper / feet).
- **`StatusPill.jsx`** — bottom-center hint pill with the current interaction prompt.
- **`SceneCanvas.jsx`** — CSS-perspective grid floor + placeholder mannequin silhouettes (stands in for the live Three.js canvas).

## Index demo

`index.html` boots all components, places three figures on the canvas, and demonstrates the full interaction surface: click presets, open the figure editor, toggle the appearance drawer.
