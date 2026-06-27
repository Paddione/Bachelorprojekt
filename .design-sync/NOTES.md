# mentolder-web Design Sync Notes

## Package quirks

- **No `dist/` lib build**: `mentolder-web` ist ein App-Build (kein Library-Build). Entry via
  `mentolder-web/src/ds-entry.ts` + `componentSrcMap` überbrückt das.
- **`?react` SVG-Imports**: `icons.ts` nutzt `vite-plugin-svgr`'s `?react` Query-Suffix.
  esbuild kennt das nicht. Fix: `.design-sync/overrides/bundle.mjs` (Copy des bundled bundle.mjs)
  mit einem `svgr-stub` Plugin, das `*.svg?react` Imports als leere Span-Komponenten zurückgibt.
  Icon-Slots in ServiceRow-Previews sind daher leer — das Layout kommt korrekt rüber.
- **`FAQ` Component excluded**: `isComponentName()` schließt All-Caps-Namen aus (`^[A-Z][A-Z0-9_]+$`).
  `FAQ` fällt daher heraus, obwohl es eine echte Komponente ist. Für einen späteren Sync:
  `componentSrcMap: { "FAQ": "src/components/FAQ.tsx" }` reicht nicht — der Post-DTS-Filter
  wendet `isComponentName()` nochmal an. Muss in `overrides/bundle.mjs` oder als rename gefixt werden.
- **Tailwind v4 CSS**: Kein statisches `tailwind.css` — compiled output liegt in
  `dist/assets/index-<hash>.css`. Stable copy als `dist/design-tokens.css` (mit Google Fonts
  `@import` vorangestellt) erstellt. Google Fonts CDN → `runtimeFontPrefixes` gesetzt.
- **`react-router-dom` Provider**: 6+ Komponenten nutzen `<Link>`. `MemoryRouter` als
  `provider.component` in config; auch in `ds-entry.ts` exportiert.

## Re-sync checklist

1. `npm run build` in `mentolder-web/` ausführen (updated CSS)
2. `cp mentolder-web/dist/assets/index-*.css mentolder-web/dist/design-tokens.css` ← Fonts
   voranstellen (oder den folgenden Befehl nutzen:
   `cat <(echo "@import url(\"...\");") mentolder-web/dist/assets/index-*.css > mentolder-web/dist/design-tokens.css`)
3. `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules mentolder-web/node_modules --entry mentolder-web/src/ds-entry.ts --out ./ds-bundle`
4. `node .ds-sync/package-validate.mjs ./ds-bundle`
5. `node .ds-sync/resync.mjs --config .design-sync/config.json --out ./ds-bundle`

## `.design-sync/node_modules` symlink

Zeigt auf `../.ds-sync/node_modules` — muss nach Clone neu angelegt werden:
```bash
ln -sfn ../.ds-sync/node_modules .design-sync/node_modules
```
