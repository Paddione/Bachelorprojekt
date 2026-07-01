# Proposal: g-test01-bats-debt-skips

_Ticket: T001286_

## Why

`tests/unit/admin-nav.bats` enthält 9 unkonditionale `skip`-Aufrufe, alle mit dem Gap-Analysis-Tag (`gap-analysis: … (WP-28)` bzw. `(WP-29)`). Diese Tests sind geschriebene Spezifikation ohne Verifikation — sie laufen bei jedem CI-Lauf als "skipped" durch, erzeugen kein Rot und geben keinen Schutz vor Regression. Das Gesundheitsziel G-TEST01 misst genau diese Kategorie und ist so lange rot, wie der Measure-Command

```
grep -rniE "skip [\"']" tests --include=*.bats | grep -ciE "pending|todo|gap-analysis|WP-|not implemented|disabled|stub"
```

einen Wert größer 0 liefert. Aktuell liefert er **9**.

Die 9 Skips teilen sich auf zwei Feature-Blöcke auf:

- **WP-28 (7 Skips):** Die Tests prüfen, dass bestimmte Routen (`/admin/meetings`, `/admin/kalender`, `/admin/zeiterfassung`, `/admin/steuer`, `/admin/software-history`, `/admin/coaching/projekte`, `/admin/coaching/settings`) nicht mehr als Haupt-Navigationspunkte in `AdminLayout.astro` vorhanden sind. Diese Items existieren aktuell noch in den `navGroups`. Das Feature WP-28 (Admin-IA Cleanup) definiert diese Items als „abzulösende Top-Level-Nav-Einträge".

- **WP-29 (2 Skips):** Die Tests prüfen, ob die Meetings-Tab in `clients.astro` und die Zeiterfassung-Tab in `rechnungen.astro` vorhanden sind. Eine Inspektion des Quellcodes zeigt, dass **beide Tabs bereits implementiert sind** (clients.astro Zeile 41, rechnungen.astro Zeile 78). Die Skips sind damit überflüssig und können sofort entfernt werden.

## What

1. **WP-28 implementieren (Admin-IA Cleanup in AdminLayout.astro):** Sechs Top-Level-Nav-Einträge (`/admin/meetings`, `/admin/kalender`, `/admin/zeiterfassung`, `/admin/steuer`, `/admin/software-history`) werden aus den `navGroups` entfernt. Zusätzlich werden `/admin/coaching/projekte` und `/admin/coaching/settings` aus dem `matches`-Array des Sitzungen-Eintrags gestrichen, da sie dort nur als Hilfs-Routen geführt werden und nicht als eigenständige Nav-Items erwartet werden. Nach der Bereinigung können die 7 WP-28-Skips aus der BATS-Datei entfernt werden.

2. **WP-29 Skips entfernen:** Die beiden verbleibenden Skips in den `clients.astro`- und `rechnungen.astro`-Tests werden gelöscht — die Assertions sind unmittelbar laufffähig, weil der Produktionscode bereits konform ist.

3. **Measure-Command auf 0 bringen:** Nach allen Änderungen liefert der Measure-Command 0 und G-TEST01 gilt als grün.

## Impact

**Geänderte Dateien:**
- `website/src/layouts/AdminLayout.astro` — Entfernen von 5 Nav-Items und Bereinigung eines `matches`-Arrays (WP-28)
- `tests/unit/admin-nav.bats` — Entfernen aller 9 `skip`-Zeilen und Ersetzen der zuvor geskippten Testblöcke durch echte Assertions

**Risiken:**
- Das Entfernen der Nav-Items aus `AdminLayout.astro` ist eine sichtbare UI-Änderung. Die Zielseiten (`/admin/zeiterfassung`, `/admin/steuer`, `/admin/software-history`, `/admin/kalender`, `/admin/meetings`) bleiben erreichbar — sie werden nur nicht mehr über die Hauptnavigation verlinkt. Bestehende Direktlinks und Tab-Navigation auf Unterseiten sind davon unberührt.
- Die Tests prüfen das Nicht-Vorhandensein via `grep -c`, was empfindlich auf Zeilenformat reagiert. Die Assertions entsprechen dem etablierten Pattern in der Datei und sind konsistent mit den bereits aktiven Tests.

**Out of Scope:**
- Löschen oder Umstrukturieren der Zielseiten selbst (`zeiterfassung.astro`, `steuer.astro` usw.)
- Änderungen an `PortalLayout.astro`
- Neue Features oder Inhalte auf den betroffenen Seiten
