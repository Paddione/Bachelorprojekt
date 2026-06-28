---
title: "G-TEST01: BATS Debt-Skips reaktivieren (9→0)"
ticket_id: T001286
domains: ["tests","quality"]
status: completed
---

# g-test01-bats-debt-skips — Implementation Plan

## File Structure

| Aktion   | Datei                                              | Beschreibung                                              |
|----------|----------------------------------------------------|-----------------------------------------------------------|
| Geändert | `website/src/layouts/AdminLayout.astro`            | WP-28: 5 Nav-Items entfernen, 1 matches-Array bereinigen  |
| Geändert | `tests/unit/admin-nav.bats`                        | Alle 9 skip-Zeilen und leere Testblöcke durch echte Assertions ersetzen |

## Task 0: Baseline messen (RED)

Vor jeder Änderung den aktuellen Zustand dokumentieren.

- [ ] Measure-Command ausführen:

```bash
grep -rniE "skip [\"']" tests --include=*.bats | grep -ciE "pending|todo|gap-analysis|WP-|not implemented|disabled|stub"
```

  expected: FAIL (aktueller Wert: 9 — über dem Ziel: 0 unkonditionale skip-Aufrufe in `tests/unit/admin-nav.bats`)

- [ ] Liste der betroffenen Zeilen zur Kontrolle ausgeben:

```bash
grep -rniE "skip [\"']" tests --include=*.bats | grep -iE "pending|todo|gap-analysis|WP-|not implemented|disabled|stub"
```

  Erwartete Ausgabe: 9 Zeilen mit `gap-analysis:`-Marker (7× WP-28, 2× WP-29).

## Task 1: WP-29 Skips entfernen (sofort laufffähig)

Die beiden WP-29-Tests prüfen das Vorhandensein von Tabs, die bereits im Quellcode implementiert sind (`clients.astro` Zeile 41, `rechnungen.astro` Zeile 78). Die Skips können ohne weitere Codeanpassung entfernt werden.

- [ ] In `tests/unit/admin-nav.bats` den Test `clients.astro: Meetings tab present` aktivieren:
  - Die Zeile `skip "gap-analysis: Meetings tab missing from clients page (WP-29)"` löschen.
  - Den Testblock durch eine echte Assertion ersetzen:

```bash
@test "clients.astro: Meetings tab present" {
  run grep -c "href.*meetings" "$PROJECT_DIR/website/src/pages/admin/clients.astro"
  refute_output "0"
}
```

- [ ] In `tests/unit/admin-nav.bats` den Test `rechnungen.astro: Zeiterfassung tab present` aktivieren:
  - Die Zeile `skip "gap-analysis: Zeiterfassung tab missing from rechnungen page (WP-29)"` löschen.
  - Den Testblock durch eine echte Assertion ersetzen:

```bash
@test "rechnungen.astro: Zeiterfassung tab present" {
  run grep -c "href.*zeiterfassung" "$PROJECT_DIR/website/src/pages/admin/rechnungen.astro"
  refute_output "0"
}
```

- [ ] BATS-Lauf auf der Datei ausführen und sicherstellen, dass die beiden Tests grün durchlaufen:

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats
```

## Task 2: WP-28 implementieren — Admin-IA Cleanup in AdminLayout.astro

Die 7 WP-28-Tests prüfen das Nicht-Vorhandensein bestimmter Routes als eigenständige Top-Level-Einträge in den `navGroups`. Die folgenden Änderungen in `website/src/layouts/AdminLayout.astro` sind erforderlich.

**Gruppe "Geschäft" (ca. Zeilen 76–86):**

- [ ] Die Zeile mit `/admin/zeiterfassung` vollständig entfernen:
  ```
  { href: '/admin/zeiterfassung', label: 'Zeiterfassung', icon: 'clock' },
  ```
- [ ] Die Zeile mit `/admin/steuer` vollständig entfernen:
  ```
  { href: '/admin/steuer', label: 'Steuer', icon: 'key' },
  ```
- [ ] Aus dem `matches`-Array des Sitzungen-Eintrags (coaching/sessions) die Einträge `/admin/coaching/projekte` und `/admin/coaching/settings` entfernen, sodass der Eintrag lautet:
  ```
  { href: '/admin/coaching/sessions', label: 'Sitzungen', icon: 'clipboard', matches: ['/admin/coaching/sessions', '/admin/fragebogen'] },
  ```

**Gruppe "Werkstatt" (ca. Zeilen 89–101):**

- [ ] Die Zeile mit `/admin/software-history` vollständig entfernen:
  ```
  { href: '/admin/software-history', label: 'Software-Komp.', icon: 'server' },
  ```

**Gruppe "Infrastruktur" (ca. Zeilen 102–114):**

- [ ] Die Zeile mit `/admin/kalender` vollständig entfernen:
  ```
  { href: '/admin/kalender', label: 'Kalender', icon: 'calendar2', matches: ['/admin/kalender', '/admin/termine'] },
  ```
- [ ] Die Zeile mit `/admin/meetings` vollständig entfernen:
  ```
  { href: '/admin/meetings', label: 'Meetings', icon: 'video' },
  ```

- [ ] Nach den Änderungen: TypeScript-Kompilierung im Website-Verzeichnis prüfen:

```bash
cd website && pnpm astro check 2>&1 | tail -5
```

## Task 3: WP-28 Skips in admin-nav.bats aktivieren

Nach der Nav-Bereinigung in AdminLayout.astro die 7 WP-28-Testblöcke aktivieren. Jeder Block erhält eine echte `grep`-Assertion, die das Nicht-Vorhandensein der Route als direkten `href`-Wert im Nav prüft.

- [ ] Test `AdminLayout: /admin/meetings not in navGroups` aktivieren:

```bash
@test "AdminLayout: /admin/meetings not in navGroups" {
  run grep -c "href: '/admin/meetings'" "$ADMIN_LAYOUT"
  assert_output "0"
}
```

- [ ] Test `AdminLayout: /admin/kalender not in navGroups` aktivieren:

```bash
@test "AdminLayout: /admin/kalender not in navGroups" {
  run grep -c "href: '/admin/kalender'" "$ADMIN_LAYOUT"
  assert_output "0"
}
```

- [ ] Test `AdminLayout: /admin/coaching/projekte not in navGroups` aktivieren:

```bash
@test "AdminLayout: /admin/coaching/projekte not in navGroups" {
  run grep -c "href: '/admin/coaching/projekte'" "$ADMIN_LAYOUT"
  assert_output "0"
}
```

- [ ] Test `AdminLayout: /admin/coaching/settings not in navGroups` aktivieren:

```bash
@test "AdminLayout: /admin/coaching/settings not in navGroups" {
  run grep -c "href: '/admin/coaching/settings'" "$ADMIN_LAYOUT"
  assert_output "0"
}
```

- [ ] Test `AdminLayout: /admin/zeiterfassung not in navGroups` aktivieren:

```bash
@test "AdminLayout: /admin/zeiterfassung not in navGroups" {
  run grep -c "href: '/admin/zeiterfassung'" "$ADMIN_LAYOUT"
  assert_output "0"
}
```

- [ ] Test `AdminLayout: /admin/steuer not in navGroups` aktivieren:

```bash
@test "AdminLayout: /admin/steuer not in navGroups" {
  run grep -c "href: '/admin/steuer'" "$ADMIN_LAYOUT"
  assert_output "0"
}
```

- [ ] Test `AdminLayout: /admin/software-history not in navGroups` aktivieren:

```bash
@test "AdminLayout: /admin/software-history not in navGroups" {
  run grep -c "href: '/admin/software-history'" "$ADMIN_LAYOUT"
  assert_output "0"
}
```

- [ ] Vollständigen BATS-Lauf auf der Datei ausführen — alle Tests müssen grün sein:

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats
```

## Task 4: Measure-Command auf 0 prüfen (GREEN)

- [ ] Measure-Command erneut ausführen und Wert 0 bestätigen:

```bash
grep -rniE "skip [\"']" tests --include=*.bats | grep -ciE "pending|todo|gap-analysis|WP-|not implemented|disabled|stub"
```

  Erwartete Ausgabe: `0`

- [ ] Health-Goal-Status prüfen:

```bash
bash scripts/health-goals-check.sh --only=G-TEST01
```

  Erwartete Ausgabe: grün / Wert 0 ≤ Ziel 0.

## Task 5 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-TEST01` → Ziel-Status grün
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
