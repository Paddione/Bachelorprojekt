---
title: "ticket-read-fail-closed — Implementation Plan"
ticket_id: T014386
domains: [tickets]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-read-fail-closed — Implementation Plan

## File Structure

```
tests/spec/ticket-system/read-path-fail-closed.bats  (neu, liegt vor) 15 Faelle, 12 ohne DB
scripts/vda/ticket/_ticket-core.sh                   Wertemengen + Validierungshelfer (Ist 245, Limit 800)
scripts/vda/ticket/list.sh                           --status/--type/--attention-mode validieren (Ist 77, Limit 800)
scripts/vda/ticket/get.sh                            Exit 4 bei nicht gefundenem Ticket (Ist 37, Limit 800)
scripts/lib/ticket-help.sh                           Exit-Codes in der Hilfe dokumentieren
```

## Partial-Manifest

Ein Partial. Die drei Dateien teilen sich die Wertemengen aus `_ticket-core.sh`; ein Schnitt
dazwischen erzeugte einen Zwischenstand, in dem `list.sh` gegen einen Helfer prueft, den es
noch nicht gibt.

## Tasks

- [ ] **1. Failing test (RED).** Der Test liegt im Branch. Vor der ersten Aenderung laufen
      lassen und den roten Stand bestaetigen:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/read-path-fail-closed.bats
      ```

      expected: FAIL — 8 Faelle rot, 4 Positiv-Anker gruen, 3 DB-Faelle uebersprungen. Die vier
      Anker belegen, dass die CLI laeuft und ein gueltiger Wert die Validierung passiert; ohne
      sie waeren die Negativ-Aussagen vakuos (beim Entwurf dieses Tests genau einmal passiert:
      eine unerreichbare DB liess alles scheitern und faerbte die Negativtests falsch gruen).

- [ ] **2. Wertemengen als gemeinsame Quelle.** In `scripts/vda/ticket/_ticket-core.sh` die drei
      Wertemengen als Konstanten anlegen und einen Helfer `_ticket_validate_enum <feld> <wert>
      <erlaubte…>` ergaenzen, der bei unbekanntem Wert eine Meldung mit abgelehntem Wert UND
      erlaubten Werten auf stderr schreibt und mit Exit 2 endet. Die Status-Menge sind die 11
      Werte aus `openspec/specs/ticket-system.md` ("Status-Lifecycle-Enforcement"):
      `triage planning plan_staged backlog in_progress in_review qa_review blocked
      awaiting_deploy done archived`. Die `--type`- und `--attention-mode`-Mengen aus dem
      bestehenden Code erheben, nicht raten:

      ```bash
      grep -rn "type\s*IN\|attention_mode\s*IN\|--type\b" scripts/vda/ticket/create.sh scripts/vda/ticket/triage.sh | head
      ```

- [ ] **3. list.sh validieren — vor dem DB-Zugriff.** In `scripts/vda/ticket/list.sh` nach der
      Argument-Schleife und **vor** `local pod; pod=$(_pgpod)` die drei Filter pruefen. Bei
      `--status` die Komma-Liste zerlegen (Leerzeichen entfernen, wie es die SQL heute tut) und
      jedes Glied einzeln pruefen — ein ungueltiges Glied lehnt die ganze Liste ab. Die
      Reihenfolge ist die eigentliche Zusicherung: der Fall "Validierung braucht keine
      Datenbank" im RED-Test faellt sonst durch.

- [ ] **4. Irrefuehrenden Kommentar korrigieren.** Der T012972-Kommentar in `list.sh` nennt
      `"open,triage"` als Beispiel. `open` ist kein definierter Status — das Beispiel lehrt den
      Wert, den dieser Fix ablehnt. Auf ein gueltiges Paar aendern (z.B. `"triage,planning"`).

- [ ] **5. get.sh: Exit 4 bei Nichtexistenz.** In `scripts/vda/ticket/get.sh` nach der Abfrage
      pruefen, ob eine Zeile kam. Leeres Ergebnis: Meldung mit der gesuchten ID auf stderr,
      Exit 4. Ein gefundenes Ticket bleibt unveraendert Exit 0 mit JSON. Exit 2 bleibt dem
      Bedienfehler vorbehalten, Exit 9 dem Offline-Refusal (`_ticket_offline_refuse_read`).

- [ ] **6. Exit-Codes dokumentieren.** In `scripts/lib/ticket-help.sh` die Usage-Bloecke von
      `list` und `get` um die Exit-Codes ergaenzen (0 = Treffer bzw. gueltige leere Menge,
      2 = Bedienfehler, 4 = nicht gefunden, 9 = offline). Ohne diesen Schritt ist der neue
      Code fuer Aufrufer nicht auffindbar.

- [ ] **7. Aufrufer gegenpruefen.** Kein Aufrufer darf durch den neuen `get`-Exit-Code brechen.
      Der Vorbefund (kein ungeschuetzter Fall unter `set -e`) wird gegen den geaenderten Stand
      wiederholt:

      ```bash
      for f in $(grep -rln 'ticket\.sh" get \|ticket\.sh get ' --include='*.sh' . | grep -v node_modules | grep -v '^./tests/'); do
        head -25 "$f" | grep -qE '^set -e' || continue
        grep -nE '^[[:space:]]*[A-Za-z_]+=\$\(' "$f" | grep 'ticket.sh' | grep ' get ' | grep -v '||'
      done
      ```

      Erwartet: keine Ausgabe. Zusaetzlich die drei Skripte pruefen, die heute auf leere Ausgabe
      testen (`scripts/ticket-reclaim.sh`, `scripts/devflow-post-merge-finalize.sh`,
      `scripts/factory/scout-drift.sh`) — sie duerfen weiterhin funktionieren, ihre
      Leer-Pruefung bleibt gueltig.

- [ ] **8. Final Verification.** Der neue Test muss vollstaendig gruen sein (bis auf die drei
      ehrlich uebersprungenen DB-Faelle), und die Repo-Gates duerfen nicht brechen:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/read-path-fail-closed.bats
      ./tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```

      Erwartet: 12 gruen, 3 skip (mit sichtbarem Grund), 0 rot; die bestehenden
      `list-status-comma-list.bats`-Faelle (T012972) bleiben unveraendert gruen;
      `freshness:check` gruen. Zusaetzlich der Positiv-Beleg, dass die Validierung ohne
      Datenbank greift — das ist die Entwurfsregel dieses Fixes:

      ```bash
      out=$(KUBECONFIG=/nonexistent bash scripts/ticket.sh list --status bogusxyz 2>&1); rc=$?
      echo "rc=$rc out=$out"; [ "$rc" -eq 2 ] && [[ "$out" == *bogusxyz* ]] && echo PASS
      ```
