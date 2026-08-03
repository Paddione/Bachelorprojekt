# Proposal: openspec-stragglers-T002577

## Why

88 von 139 Changes wurden in T002569 (Chargen 1–7) archiviert. 51 brachen am fail-closed Guard in `scripts/openspec.sh archive` ab und liegen unverändert in `openspec/changes/`. Protokoll mit Slug, Charge, Ziel-SSOT und wortgetreuer Fehlermeldung: `openspec/changes/archive/2026-08-02-openspec-archive-backlog/stragglers.md`.

Drei Bruchvarianten, gemessen 2026-08-02:

| Fehlerklasse | Anzahl | Bedeutung |
|---|---|---|
| `contains unedited skeleton stub (TODO / 'The system SHALL …')` | 42 | Delta ist ein nie ausgefüllter Skeleton-Stub — Mehrheit sind `mishap-*`-Bundles |
| `MODIFIED target '<X>' not found in <ssot>.md` | 7 | Delta referenziert eine Requirement-Überschrift, die in der SSOT nicht (mehr) existiert |
| `Refusing to create one-off spec '<x>.md' (ticket/gate slug pattern)` | 2 | `--create-new` für einen Ticket-/Gate-Slug verweigert |

Das ist kein Vollzugsrückstau mehr, sondern ein Autoren-Rückstau: die Auflösung erfordert echte Spec-Inhalte, kein mechanisches Verschieben.

**Grundsatzentscheidung (Patrick, via ticket-ops Phase 2):** Mishap-Bundles tragen KEIN OpenSpec-Spec-Delta — sie sind Prozess-Notizen. Der Vorgang wird als Skript-Änderung angelegt: ein Archivierungspfad OHNE Delta-Merge für `mishap-*`-Bundles + Batch-Archivierung der 51 Nachzügler.

**Nebenbefund (eigener Defekt):** `openspec.sh archive` merged das Delta in die SSOT, BEVOR die Stub-/Target-Guards laufen — der Abbruch ist nicht atomar. Bei `--create-new` blieb in Charge 6 eine verwaiste Skeleton-SSOT (`openspec/specs/auto-close-guard.md`) zurück, die von Hand entfernt werden musste. Guards gehören VOR den Merge.

## What

**Skript-Änderung — `--no-merge`-Archivierungspfad**

`scripts/openspec.sh cmd_archive` bekommt ein `--no-merge`-Flag. In diesem Modus wird das Change-Verzeichnis ins Archiv verschoben, ohne das Delta in die SSOT zu mergen. Die Stub-/Target-Guards werden für diesen Pfad übersprungen, da kein Merge stattfindet. Ohne `--no-merge` bleibt das bestehende fail-closed Verhalten unverändert.

**Guard-Reihenfolge-Fix (Nebenbefund)**

Der Zwei-Pass (`_check_delta` vor `_merge_delta`, T002581) existiert bereits und baut die `--create-new`-Skeleton-SSOT nur im Speicher auf. Der Task verifiziert die Atomarität über alle Guard-Varianten und ergänzt einen BATS-Test, der belegt, dass ein fehlschlagender Guard keine SSOT-Datei erzeugt oder verändert und das Change-Verzeichnis unangetastet lässt.

**Batch-Archivierung der 51 Nachzügler**

- 24 `mishap-*`-Bundles (inkl. `mishap-bundle-t002471` und `t002105-mishap-bundle`) via `--no-merge`-Pfad archivieren.
- 7 `modified-target`-Fälle per Delta-Reparatur (MODIFIED→ADDED oder an die aktuelle SSOT anpassen) — ausschließlich im Delta, NIEMALS direkt in der SSOT (T002375-p5).
- 2 `refusing`-Fälle (`g-db01-fk-index-remediation`, `t001592`) per `--target-spec <parent>` oder bewusst `--force-new-component` entscheiden.
- Verbleibende `skeleton-stub`-Fälle, die keine mishap-Bundles sind, per Delta-Ausformulierung (mit `#### Scenario:`-Blöcken, Ratchet T002567).

**Damit es nicht wiederkehrt**

- `--no-merge` ist explizit: ohne das Flag greift der bestehende fail-closed Stub-Guard weiterhin.
- BATS-Test für die Atomarität des Archivs (Guards vor jedem Schreibvorgang).

## Impact

- `openspec/changes/` schrumpft um 51 verwaiste Ordner.
- `mishap-*`-Bundles werden als Prozess-Notizen archiviert, ohne erfundene Requirements.
- Der Archivierungsabbruch ist nachweislich atomar (kein verwaistes Skeleton-SSOT mehr).
- `openspec.sh archive` bleibt fail-closed für alle Pfade, die ein Delta in die SSOT mergen.

_Ticket: T002577_
