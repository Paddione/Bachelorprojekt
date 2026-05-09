# Arena UI kit

A pixel-honest recreation of the **Arena** game client (top-down battle-royale by Kore.). The kit is built on top of `colors_and_type.css` via `arena-tokens.css`, which aliases Arena's `--color-*` / `--space-*` tokens onto the Kore design tokens.

## What's in scope
- **Home** — create lobby, join by code, browse open lobbies, leaderboard / loadout / world-campaign / keybinds entry points.
- **Lobby** — code chip, player list, ready toggle, host settings.
- **Game HUD** — HP/armor pips, ammo, kill feed, mini-map, zone indicator.
- **Match results** — scoreboard with K/D, RESPECT balance, rematch.
- **Character picker** — current cast (Mage / Rogue / Tank / Warrior / Zombie) at iso-render thumbnail size.

## Intentional cuts
This is not production code. No real Socket.io. No PixiJS canvas — the in-game shot is a static composition that uses the real sprite renders for fidelity but does not loop. State changes are mocked with React useState.

See sources of truth in the project README.
