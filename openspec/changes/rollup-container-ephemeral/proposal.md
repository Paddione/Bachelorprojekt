# Proposal: rollup-container-ephemeral

## Why

**Symptom (beobachtet, reproduzierbar):** Am 2026-08-14 legte die Container-Auflösung
`scripts/ticket.sh rollup-container` dreimal einen frischen Rollup-Container an
(T004613 05:54, T004752 07:50, T004887 09:15 UTC), statt den offenen Bestandscontainer
T003533 zu verwenden. Jeder dieser Container blieb leer bzw. wurde unmittelbar geschlossen.

**Ursache (belegt, nicht Hypothese):** T003533 steht auf `status=blocked`. Die Auflösung
filtert mit einer positiven Allowlist
(`status IN ('triage','backlog','planning','plan_staged','in_progress')`,
`scripts/ticket.sh` cmd_rollup_container) — `blocked` ist darin nicht enthalten, die
Such-Query liefert leer, Step 2 legt einen neuen Container an. Belegt per DB-Query
(`SELECT external_id, status FROM tickets.tickets WHERE type='chore' AND title LIKE
'Mishap Rollup%'`: nur T003533/blocked und T004887/triage offen) und per
BATS-Reproducer (`tests/spec/mishap-rollup/container-finds-blocked-status.bats`, RED
gegen den aktuellen Code). Der Kommentar im Code wie im Go-Flusher beschreibt bereits
die beabsichtigte Semantik „offene Status, done/archived ausgeschlossen" — die
Implementierung weicht davon ab.

**Design-Entscheidung (User, 2026-08-14):** Der Rollup-Container und sein Branch sind
nicht länger persistent. Der Container wird ephemer (Wiederverwendung des offenen
Containers bis zur Verarbeitung, danach `done · resolution=obsolete`); der Rollup-Branch
wird pro Zyklus angelegt, per PR nach `main` gemergt und dort archiviert. Die
Amend-/Lease-Maschinerie (`rollup-publish.sh`, T002914/T002931), die nur wegen der
Persistenz existiert, entfällt.

## What

- `scripts/ticket.sh` cmd_rollup_container: Suchfilter von positiver Allowlist auf
  `status NOT IN ('done','archived')` umstellen — damit wird jeder offene Container
  gefunden, ältester zuerst.
- `scripts/factory/mishap-rollup.sh`: pro Zyklus eigener Branch/Slug
  (`mishap-incident-rollup-<suffix>`), normaler Commit + Push ohne Amend, Container
  nach erfolgreicher Plan-Erzeugung schließen (`update-status done --resolution obsolete`).
- `scripts/factory/rollup-publish.sh`: Amend-/Force-with-Lease-/Rebase-Logik entfernen —
  pro Zyklus wird genau einmal normal gepusht.
- Datenbestand (bereits ausgeführt): T003533 und T004887 `done/obsolete`.
- SSOT `openspec/specs/mishap-rollup.md`: Selfheal-GIVEN auf `NOT IN` umformulieren
  (MODIFIED), Amend-Requirements entfernen (REMOVED), Ephemer-Lifecycle als neue
  Requirements (ADDED).
- Tests: neuer BATS-Test `container-finds-blocked-status.bats` (RED belegt); der
  Amend-Verhaltenstest `rollup-branch-progress.bats` wird durch einen Test für den
  einfachen Push-Zyklus ersetzt.

_Ticket: T004898_
