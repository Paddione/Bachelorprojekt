# Partial p2 — Tests

## Scope

Guard-Test, der die dokumentierte Memory-/Batch-Kombination von `bge-embed`
festschreibt. Rot vor der Manifest-Änderung (p1), grün nach p1.

## Task List

### 1. Guard-Test in `tests/spec/llm-pipeline.bats`

- [ ] **1.1** Neuen `@test` ans Ende der Suite anhängen (z.B. `"bge-embed:
      memory limit and batch args are documented"`). Der Test ist ein
      statischer Manifest-Grep (kein Cluster nötig):
      - lädt `k3d/llm-gpu.yaml` als Text,
      - assertiert, dass der Dokumentations-Kommentar aus p1 2.3 vorhanden ist
        (Muster `bge-embed peak RSS`),
      - assertiert, dass unter dem `bge-embed`-Container `limits.memory` den
        in p1 gewählten Wert (≥ `3Gi`) trägt,
      - assertiert, dass `-np 4` und `-ub 8192` vorhanden sind, **oder** — falls
        in p1 die Argumente gesenkt wurden — dass `-np 2` und `-ub 4096`
        vorhanden sind. Beide Kombinationen dürfen grün sein, eine dritte
        Kombination muss rot sein.
- [ ] **1.2** Testgröße: nur diese eine Assertion-Gruppe; keine Duplikate mit
      bestehenden Tests, keine neuen Helper-Dateien.
- [ ] **1.3** Rot-Nachweis dokumentieren (im Partial-Kommentar beim Commit):
      vor p1 schlägt der Test fehl (kein Kommentar, `2Gi`), nach p1 läuft er
      grün.

### 2. Gate-Ausführung

- [ ] **2.1** `task test:changed` — der neue Guard-Test muss grün sein
      (Testselektion erkennt die geänderte Suite).
- [ ] **2.2** `task freshness:regenerate` — generierte Artefakte aktualisieren.
- [ ] **2.3** `task freshness:check` — muss sauber sein (letzte Aufgabe des
      Partials).
