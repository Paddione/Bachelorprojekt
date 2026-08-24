# Design: archive-frontmatter-completed-on-archive-branch

_Ticket: T015916 · Typ: fix (Retype von incident durch Operator vor Queue-Sichtbarkeit) · Folge-Chore: T015920_

## Zweck

Der Plan-Frontmatter-Wechsel auf `status: completed` muss im selben Arbeitsbaum-Zustand
anliegen, aus dem der Archiv-Commit gebaut wird. Heute schreibt Schritt 7 den Wechsel in
den Haupt-Checkout, während Schritt 8 erst danach per `git checkout -B "$ARCHIVE_BRANCH"
origin/main` umschaltet und dort archiviert — der Archiv-Snapshot trägt weiterhin
`status: active`.

## Symptom vs. Ursache (T002448-M5)

**Symptom (Fakt, reproduziert):** 9 von 12 zuletzt archivierten Plänen tragen
`status: active` statt `completed` (Messung laut Ticket T015916, Stand origin/main =
585c7f6d1). Korrekt waren nur 2026-08-23-staging-verdrahtung,
2026-08-24-collabora-runasnonroot, 2026-08-24-db-identity-guard.

**Ursache (Code-Evidenz):**
- `scripts/devflow-post-merge-finalize.sh:392–405` — Schritt 7 setzt per
  `sed -E -i 's/^status: (active|plan_staged|in_progress|planning)$/status: completed/'`
  das Frontmatter in `$REPO_DIR`. Die Änderung bleibt uncommittet im Haupt-Checkout
  liegen (beobachteter Folgefehler: blockiertes `git pull --ff-only`).
- `scripts/devflow-post-merge-finalize.sh:574–589` — Schritt 8 wechselt in einer Subshell
  per `git checkout -B "$ARCHIVE_BRANCH" origin/main` und archiviert dann; die Datei hat
  auf diesem Stand noch `status: active`.

## Entscheidungen

### D1 — Fixort: Frontmatter-Wechsel wandert in die Archiv-Sektion (Operator-Entscheidung, Klärungsrunde 2026-08-24)

Der `sed`-Aufruf (inkl. seiner Existenz-Guards) wird aus Schritt 7 in die Archiv-Sektion
von Schritt 8 verschoben — **nach** dem `git checkout -B "$ARCHIVE_BRANCH" origin/main`
(Zeile 575) und **vor** `bash scripts/openspec.sh archive "$SLUG"` (Zeile 589). Damit ist
strukturell ausgeschlossen, dass Archiv-Commit und Frontmatter-Wechsel auf verschiedenen
Arbeitsbäumen landen.

Verworfen: „Schritt 8 wendet den Wechsel erneut an" (zwei Schreiborte = zwei
Wahrheitsquellen, drift-anfällig) und „Altlasten bewusst stehen lassen" (Operator hat
Fix + Altlasten-Korrektur entschieden; Altlasten laufen separat über T015920).

### D2 — Postgres-Persistierung (`ticket.sh archive-plan`) zieht mit

Schritt 7 ruft heute `ticket.sh archive-plan` mit dem gerade auf `completed`
gesetzten `$PLAN_FILE` auf. Der Aufruf wandert mit hinter den Frontmatter-Wechsel,
damit DB-Kopie und Archiv-Snapshot aus **demselben Dateizustand** entstehen.
Die bestehenden Guards (PLAN_FILE-Leerprüfung, Branch-Commit-Fallback T004269,
Fehlpfade T013315/F2) werden unverändert mitgenommen — keine neuen Fallbacks erfinden.

Idempotenz bleibt erhalten: Läuft Schritt 8 in einen Skip-Pfad („bereits archiviert",
`_archive_already_done`) oder Resume-Pfad (T015783 `half`), greift die heutige Semantik —
der DB-Aufruf darf einen halbfertigen Vorlauf weiterhin nachholen können. Der
Resume-Pfad führt den checkout -B bereits heute aus; der verschobene Block prüft mit
`[[ -s "$PLAN_FILE" ]]` selbst, ob eine Datei zum Bearbeiten existiert.

### D3 — Testbarkeit: DB-freier Einstiegspunkt nach --archive-state-Präzedenz

Ein Ende-zu-Ende-BATS-Lauf des Finalizers braucht `gh`, Taskfile und Postgres — für
BATS ungeeignet. Präzedenz: `--archive-state <slug>` (T015783) wurde genau deshalb als
DB-freier Einstieg zugeschnitten. Analog bekommt das Skript ein Unterkommando
(z.B. `--apply-completed-frontmatter <plan-file>`), das exakt die sed-Transition
kapselt; die verschobene Sektion ruft es intern. Tests:

1. **Seam-Test (RED):** Fixture-Repo wie `finalize-archive-state.bats`; Aufruf des
   Unterkommandos auf einer tasks.md mit `status: active` → `completed`; idempotent bei
   bereits `completed`; Werte außerhalb des Regex (z.B. `plan_staged`-Nachbarn,
   fremde Felder) bleiben unangetastet. Schlägt heute fehl (Unterkommando existiert nicht).
2. **Source-Grep-Wächter (RED):** Der Frontmatter-sed liegt NACH der
   `git checkout -B`-Zeile und es gibt keinen `status: completed`-sed außerhalb der
   Archiv-Sektion. Source-Grep ist hier dokumentierte Ausnahme (Präzedenz:
   `post-merge-finalize-guards.bats` — der Laufzeitpfad braucht Ticket-DB).

## Budgets (S1)

| Datei | Ist | Baseline | Wirksame Schwelle | Budget |
|---|---|---|---|---|
| `scripts/devflow-post-merge-finalize.sh` | 776 | nicht gebaselined | 800 (`.sh`, gates.yaml) | **24 Zeilen** |

Der Fix ist eine Verschiebung (alter Block entfällt am alten Ort) plus kleines
Unterkommando — netto möglichst neutral bis negativ halten. Neue BATS-Datei ist
S1-exempt (`tests/**/*.bats`, gates.yaml ignore).

## Altlasten

Die 9 falschen Archiv-Einträge werden NICHT hier korrigiert, sondern separat über
Chore-Ticket T015920 (`relates_to` zu T015916). Dieses Change ändert ausschließlich
Skriptverhalten + Tests.

## Risiken

- Enges Zeilenbudget (24): Verschiebung sauber planen, Kommentare beim Umzug straffen,
  ohne Guard-Verweise (T-Referenzen) zu verlieren.
- Skip/Resume-Pfade regressionsgefährdet: Guards müssen wörtlich mitwandern;
  Absicherungs-Tests für Idempotenz im Seam-Test mitdenken.
