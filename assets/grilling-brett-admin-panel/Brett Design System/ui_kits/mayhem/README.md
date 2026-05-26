# Mayhem · UI Kit

The combat surface. Brett's second voice — 3D wave-survival and combat. Same dark substrate, same brass keystone, sharper tone. Ammo counters in mono, sage-green online dots flipped to amber wave counters.

## Components

- **`ModeSelect.jsx`** — full-screen overlay shown at room entry. Two cards: Coaching · Mayhem. Mayhem can be marked as default with a `STANDARD` badge.
- **`LoadoutModal.jsx`** — pick `Nahkampf` + `Fernkampf` weapons from the 5-icon set before the round starts.
- **`CombatHUD.jsx`** — fixed bottom-center weapon bar with 5 slots, key hints, ammo counter, HP bar.
- **`CoopHUD.jsx`** — top-center co-op wave bar (`WELLE 7 / 10`) with progress fill, enemy count, optional boss-HP bar.
- **`RespawnOverlay.jsx`** — full-screen tinted overlay with countdown card after death.
- **`Scoreboard.jsx`** — top-right kill/score panel.
- **`MayhemScene.jsx`** — CSS-perspective placeholder for the live 3D combat scene with a few ragdoll silhouettes.

## Index demo

`index.html` drops the user into mode-select; choose Mayhem → loadout → combat HUD with a faked wave + scoreboard. Click "Tod simulieren" in the wave bar to trigger the respawn flow.
