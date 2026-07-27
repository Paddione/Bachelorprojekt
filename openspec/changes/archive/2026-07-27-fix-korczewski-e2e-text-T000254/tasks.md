---
title: "fix-korczewski-e2e-text-T000254 — Implementation Plan"
ticket_id: T000254
domains: [website, test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-korczewski-e2e-text-T000254 — Implementation Plan

_Ticket: T000254_

Die drei Ursachen und die Entscheidung „Content ist die Wahrheit" stehen in
`proposal.md` im selben Ordner.

## File Structure

| Datei | Ist-Zeilen | S1-Budget |
|-------|-----------|-----------|
| `website/src/components/Navigation.svelte` | 511 | 24 |
| `website/src/components/kore/KoreHomepage.svelte` | 424 | 76 |
| `tests/e2e/specs/korczewski-home.spec.ts` | 212 | 388 |
| `tests/spec/e2e-testing.bats` | 50 | S1 kennt kein Limit für `.bats` |

`Navigation.svelte` ist gebaselined (Ist 511, Baseline 535) — das Budget von 24 Zeilen
ist real, aber knapp. Die Änderung dort ist deshalb bewusst **ein Attribut in einer
bestehenden Zeile**, also netto null Zeilen. Wächst die Datei im Zuge der Umsetzung
doch, gehört der i18n-Text in die Übersetzungsdatei und nicht in die Komponente.

**Achtung — geteilte Komponente:** `Navigation.svelte` rendert **beide** Marken. Das
`aria-label` darf deshalb keine Marke fest verdrahten, sondern muss aus der bereits
vorhandenen `brandWord`-Variablen und dem i18n-Helfer gebildet werden. Ein
hartkodiertes „korczewski" verstößt zusätzlich gegen das S3-Gate.

## Task 1 — RED (bereits auf dem Branch)

Drei BATS-Tests in `tests/spec/e2e-testing.bats` sind mit dem Stage-Commit dieses
Branches bereits vorhanden. Sie prüfen statisch und offline, also ohne Live-Site und
ohne Playwright — die eigentlichen E2E-Tests laufen nur nachts gegen die echte Domain
und taugen nicht als CI-Regressionsschutz:

- kein `<footer>` mehr in `KoreHomepage.svelte`,
- keine wörtliche `toContainText('Korczewski')`-Erwartung mehr im Spec,
- kein Rückgriff mehr auf den nicht existierenden Accessible Name `korczewski startseite`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/e2e-testing.bats
# expected: FAIL — alle drei T000254-Tests rot, die zwei bestehenden grün.
```

## Task 2 — Verschachtelten Footer-Landmark auflösen

In `website/src/components/kore/KoreHomepage.svelte` das öffnende `<footer class="w-foot">`
(Zeile 349) und das zugehörige schließende Tag (Zeile 379) auf `<div>` ändern. Die
CSS-Regeln hängen an der Klasse `w-foot`, nicht am Elementnamen — die Optik bleibt
unverändert. Damit trägt die Seite genau ein `contentinfo`, nämlich den Layout-Footer.

Gegenprobe im Browser oder per gerendertem HTML: die Marke „Korczewski." im ehemaligen
`w-foot` bleibt sichtbar; sie ist nur kein Landmark-Inhalt mehr.

## Task 3 — Accessible Name für den Brand-Link

In `website/src/components/Navigation.svelte` erhält `<a href="/" class="brand">` ein
`aria-label`, das Marke und Ziel nennt. Es wird über den bestehenden i18n-Helfer
gebildet — analog zum bereits vorhandenen `aria-label={t(locale, 'nav.aria-main')}` am
`<header>` — und interpoliert `brandWord`, damit beide Marken korrekt benannt werden.
Der neue Übersetzungsschlüssel wird in der i18n-Quelle für alle unterstützten Sprachen
ergänzt.

Das dekorative Logo behält `aria-hidden="true"`; ohne das würde der Buchstabe im SVG in
den Accessible Name einfließen.

`website/src/components/Navigation.test.ts` wird um eine Zusicherung erweitert, dass der
Brand-Link ein `aria-label` mit dem übergebenen `siteTitle` trägt — die Datei existiert
bereits und ist der passende Ort dafür.

## Task 4 — Die drei E2E-Erwartungen nachziehen

In `tests/e2e/specs/korczewski-home.spec.ts`:

- **T2**: der Selektor adressiert den Brand-Link über das in Task 3 gesetzte
  `aria-label`. Die Textzusicherung auf `korczewski.` bleibt unverändert — sie war
  immer korrekt.
- **T15**: die Zusicherung auf die Marke wird case-insensitiv, weil der
  `contentinfo`-Landmark die Marke kleinschreibt.
- **`/ueber-mich`**: die Heading-Erwartung in der Seitenliste (Zeile 102) wird um das
  Porträt-Heading erweitert, das die Seite seit dem Kore-Redesign trägt.

Jede geänderte Erwartung bekommt einen Kommentar mit Ticket-Referenz und dem Grund —
so wie die bestehenden `T002068`-Kommentare in derselben Datei. Ohne den Grund wirkt
eine gelockerte Zusicherung später wie aufgeweichter Testschutz.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/e2e-testing.bats
# erwartet: PASS — alle fünf Tests grün.
```

## Task 5 — Gegenprobe gegen die Live-Site

Nach dem Deploy die vier ursprünglich betroffenen Fälle real nachfahren:

```bash
cd tests/e2e && SKIP_DB_PURGE=1 WEBSITE_URL=https://web.korczewski.de \
  ./node_modules/.bin/playwright test specs/korczewski-home.spec.ts --project=korczewski
```

Die drei harten Fehlschläge müssen grün sein. Bleibt der `/software-dev`-Lauf
(`net::ERR_ABORTED`) weiterhin instabil, ist die Landmark-Mehrdeutigkeit nicht seine
Ursache — dann wird dafür ein eigenes Ticket eröffnet, statt diesen Fix auszuweiten.

Die Reihenfolge ist wichtig: dieser Schritt prüft gegen die **deployte** Seite. Läuft er
vor dem Website-Deploy, misst er den alten Stand und ist wertlos.

## Task 6 — Abschließende Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/e2e-testing.bats
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu `task test:inventory` ausführen und `website/src/data/test-inventory.json`
mitcommitten, da diese Änderung neue `@test`-Blöcke hinzufügt.
