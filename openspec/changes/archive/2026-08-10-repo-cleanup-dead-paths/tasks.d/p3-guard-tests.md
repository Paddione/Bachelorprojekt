# p3 — Guard gegen tote Pfad-Referenzen (tests)

Rolle: tests. Zieldateien: `tests/spec/repo-hygiene/dead-path-references.bats`,
`website/src/data/test-inventory.json`.

Dieses Partial schreibt den Guard **zuerst**. Er ist auf dem aktuellen Stand rot, weil die toten
Pfade noch existieren; p1 und p2 färben ihn grün.

Prüfmodus laut Repo-Konvention: **Kommando-Ergebnis-Verifikation**. Jede Prüfung extrahiert
Kandidaten aus der realen Datei und wertet `test -e` aus — kein `grep` auf Implementierungsquelle.

## Task 1 — Guard schreiben (RED)

- [ ] Verzeichnis `tests/spec/repo-hygiene/` anlegen (ein Verzeichnis je SSOT-Spec, eine Datei je
      Vorgang — Konvention T002416) und `dead-path-references.bats` mit drei `@test`-Blöcken
      füllen.

Jeder Block folgt derselben Form: **erst** belegen, dass die Kandidatenliste nicht leer ist,
**dann** die Negativ-Aussage. Ohne diesen Positiv-Anker bestünde ein Test, dessen Extraktion
stillschweigend nichts findet, vakuos — „1 ist nicht in []" gilt trivial.

**Block 1 — `.dockerignore` deklariert keine fehlenden Literale.**
In Scope ist eine Zeile nur, wenn sie nicht leer, kein Kommentar, keine Negation (`!`), frei von
den Glob-Zeichen `*`, `?`, `[` ist und den Marker `# runtime` nicht trägt. Anker: die Menge der
In-Scope-Zeilen ist nicht leer. Aussage: jede davon existiert.

**Block 2 — Registry-Schlüssel zeigen auf existierende Manifeste.**
Schlüssel sind die geklammerten Array-Subskripte der Form `[<pfad>]=` in
`scripts/factory/service-registry.sh`. Anker: mindestens ein Schlüssel extrahiert. Aussage: jeder
zeigt auf einen existierenden Pfad.

**Block 3 — kein getrackter Symlink hängt in der Luft.**
Kandidaten sind die Einträge aus `git ls-files -s` mit Modus `120000`. Anker: mindestens ein
getrackter Symlink existiert — das Repo hat welche, etwa `.agents/agents → ../.claude/agents`.
Aussage: `test -e` trifft für jeden zu.

Die Fehlermeldung jedes Blocks nennt die konkreten Übeltäter, nicht nur deren Anzahl. Eine
Meldung „3 Pfade fehlen" zwingt den nächsten Leser, die Recherche zu wiederholen, die dieser
Vorgang gerade gemacht hat.

- [ ] Syntax prüfen. `bash -n` taugt für `.bats` **nicht** — `@test "name" { … }` ist keine
      gültige Bash-Syntax und erzeugt eine irreführende Meldung.

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/repo-hygiene/dead-path-references.bats
```

- [ ] **Failing-Test-Step (RED).** Den Guard gegen den unbereinigten Stand laufen lassen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-hygiene/dead-path-references.bats
# expected: FAIL — alle drei Blöcke sind rot, solange p1 und p2 nicht gelaufen sind:
#   Block 1: argocd, docs-site, deploy, whisper, korczewski-website,
#            vault-exports, billing-bot, memory fehlen
#   Block 2: k3d/whiteboard.yaml, k3d/claude-code-config.yaml,
#            k3d/claude-code-mcp-browser.yaml, k3d/claude-code-mcp-github.yaml,
#            k3d/claude-code-mcp-ops.yaml, k3d/claude-code-rbac.yaml fehlen
#   Block 3: .antigravitycli/af195bcc-052a-4dad-bb73-db9863dd24cb.json
#            zeigt auf /home/patrick/.gemini/config/projects/
```

Schlägt ein Block hier **nicht** fehl, ist die Extraktion dieses Blocks defekt und nicht das Repo
sauber. In dem Fall die Extraktion reparieren, bevor es weitergeht.

## Task 2 — Test-Inventar regenerieren

- [ ] Nach dem Anlegen der Testdatei das Inventar erzeugen und mitcommitten; CI vergleicht es
      gegen den Stand im Repo und schlägt bei Abweichung fehl.

```bash
task test:inventory
git add website/src/data/test-inventory.json tests/spec/repo-hygiene/dead-path-references.bats
```
