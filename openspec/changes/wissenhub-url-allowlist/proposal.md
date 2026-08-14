# Proposal: wissenhub-url-allowlist

## Why

Security-Review-Befund (2026-08-14): `crawl_config.startUrl` wird im Admin-Panel als `href` gerendert und serverseitig nur auf Parsbarkeit validiert — `javascript:`-URLs passieren beide Pfade (XSS bei Klick im Admin-Kontext).

## What

Geteilter Helper `isValidHttpUrl` (http/https-Allowlist) in `website/src/lib/knowledge-url.ts`; der PATCH-Endpoint lehnt Nicht-http(s)-startUrls mit 400 ab; die Komponente rendert den Link nur bei gültigem Schema (sonst Text).

## Impact

- 5 Dateien unter `website/src/` (siehe design.md).
- Vitest-Tests rot→grün; CI-Job `Vitest (website)` deckt die neuen Tests ab.
