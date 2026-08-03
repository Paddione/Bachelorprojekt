---
title: "spec-security-gaps — Implementation Plan"
ticket_id: T002180
domains: [infra, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# spec-security-gaps — Implementation Plan

_Ticket: T002180_

## File Structure

```
environments/.secrets/korczewski.yaml              geändert    POCKET_ID_TERMINAL_SECRET ergänzen (git-crypt)
environments/.secrets/fleet-korczewski.yaml        geändert    derselbe Key
environments/sealed-secrets/korczewski.yaml        regeneriert Ergebnis von task env:seal
environments/sealed-secrets/fleet-korczewski.yaml  regeneriert Ergebnis von task env:seal
k3d/livekit-egress.yaml                            geändert    strategy.type auf Recreate
website/package.json                               geändert    pnpm.overrides für brace-expansion
website/pnpm-lock.yaml                             regeneriert Ergebnis von pnpm install
```

Keine Datei unterhalb von `tests/` wird angefasst. Die vier Assertions beschreiben den
Sollzustand und bleiben wortgleich — das ist die Kernregel dieses Changes.

## Task 1 — RED-Nachweis vor jeder Änderung

Der Ausgangszustand wird festgehalten, damit später belegbar ist, dass Grün durch die
Code-Änderung entstanden ist und nicht durch eine angepasste Erwartung.

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats -f 'G-OPS01'
# expected: FAIL — G-OPS01a (korczewski), G-OPS01a (fleet-korczewski), G-OPS01b

./tests/unit/lib/bats-core/bin/bats tests/spec/g-dep01-npm-vuln.bats
# expected: FAIL — G-DEP01 meldet 1 high (brace-expansion)
```

Beide Ausgaben wandern in die PR-Beschreibung, Abschnitt „vorher".

**Akzeptanz:** beide Läufe rot, mit exakt den vier erwarteten Fehlschlägen und keinen weiteren.

## Task 2 — Herkunft des POCKET_ID_TERMINAL_SECRET klären

Vor jedem Schreiben in eine Secret-Datei muss feststehen, ob der Terminal-OIDC-Client auf
korczewski bereits existiert. Davon hängt ab, ob ein bestehendes Secret übernommen oder ein neues
erzeugt wird.

```bash
kubectl --context fleet -n workspace-korczewski exec deploy/shared-db -- \
  psql -U postgres -d pocket_id -c \
  "SELECT name, client_id FROM oidc_clients WHERE name ILIKE '%terminal%';"
```

Zwei Ausgänge:

- **Client existiert** — sein Secret ist die Quelle der Wahrheit. Es wird aus dem laufenden
  `workspace-secrets` des korczewski-Namespace gelesen und in beide `.secrets/`-Dateien
  übernommen, damit der bestehende Client funktionsfähig bleibt.
- **Client existiert nicht** — ein neues Secret wird erzeugt, in beide `.secrets/`-Dateien
  eingetragen, und der `pocket-id-client-seed`-Job legt den Client beim nächsten Deploy damit an.

Das Ergebnis wird als Kommentar an T002180 dokumentiert, bevor Task 3 beginnt.

**Akzeptanz:** der gewählte Weg ist am Ticket belegt, mit der Query-Ausgabe als Begründung.

## Task 3 — Key in beide korczewski-Envs eintragen und sealen

`environments/.secrets/*.yaml` sind git-crypt-verschlüsselt und dürfen nicht ausgegeben werden —
gearbeitet wird ausschliesslich in-place im entschlüsselten Worktree. Position und Formatierung
folgen `environments/.secrets/mentolder.yaml`; bestehende Keys bleiben unberührt.

```bash
task env:validate ENV=korczewski
task env:validate ENV=fleet-korczewski

task env:seal ENV=korczewski
task env:seal ENV=fleet-korczewski
```

`env:seal` schreibt die SealedSecrets nach `environments/sealed-secrets/`. Beide werden
mitcommittet — sie sind der Teil, den der Cluster tatsächlich liest.

Nachweis über die Key-Namen, ohne Werte zu berühren:

```bash
for f in korczewski fleet-korczewski; do
  printf '%-18s %s\n' "$f" "$(grep -c 'POCKET_ID_TERMINAL_SECRET' environments/.secrets/$f.yaml)"
done
# erwartet: beide 1

./tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats -f 'G-OPS01a'
```

**Akzeptanz:** beide `G-OPS01a`-Tests grün; `env:validate` für beide Envs sauber; kein
Secret-Wert in Logs, Kommentaren oder PR-Beschreibung.

## Task 4 — livekit-egress auf Recreate umstellen

`k3d/livekit-egress.yaml` mountet das ReadWriteOnce-Volume `livekit-recordings-pvc`.
RollingUpdate startet den neuen Pod vor dem Terminieren des alten; landet er auf einem anderen
Node, kann er das Volume nicht mounten und der Rollout bleibt stehen. Auf einem Single-Node-Cluster
fällt das nicht auf, auf `fleet` mit sechs Nodes schon.

```yaml
# k3d/livekit-egress.yaml — Zeile 10-11
strategy:
  type: Recreate      # war: RollingUpdate
```

Bei `Recreate` ist das Feld `rollingUpdate` unzulässig — falls vorhanden, wird es mit entfernt,
sonst lehnt die API-Validierung das Manifest ab.

```bash
task workspace:validate
./tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats -f 'G-OPS01b'
```

Die kurze Downtime des Egress-Workers beim Rollout ist die bewusst in Kauf genommene
Gegenleistung und wird in der PR-Beschreibung benannt.

**Akzeptanz:** `G-OPS01b` grün; `task workspace:validate` grün; kein verwaistes
`rollingUpdate`-Feld im Manifest.

## Task 5 — brace-expansion auf eine gepatchte Version heben

Das Advisory GHSA-mh99-v99m-4gvg betrifft `brace-expansion` bis einschliesslich 5.0.7. Alle 44
Pfade laufen transitiv über `eslint`, also über eine devDependency. Ein eslint-Major-Bump wäre für
einen Lint-Pfad unverhältnismässig; ein `pnpm.overrides`-Eintrag hebt die transitive Version
gezielt an.

```jsonc
// website/package.json
"pnpm": {
  "overrides": {
    "brace-expansion": ">=5.0.8"
  }
}
```

```bash
cd website
pnpm install
pnpm audit --audit-level low
cd ..
./tests/unit/lib/bats-core/bin/bats tests/spec/g-dep01-npm-vuln.bats
```

Löst der Override einen Konflikt aus, den `pnpm install` nicht auflösen kann, wird stattdessen
`eslint` auf die kleinste Version gehoben, die ein gepatchtes `minimatch` zieht; der Override
entfällt dann. Ein Ausnahmeeintrag im Audit wird nicht angelegt — eine gepatchte Version ist
verfügbar, damit gibt es keinen Grund, das Advisory dauerhaft stummzuschalten.

**Akzeptanz:** `pnpm audit` meldet null Vulnerabilities; `G-DEP01` grün; `pnpm-lock.yaml`
mitcommittet; kein eslint-Major-Bump ohne gesonderte Begründung.

## Task 6 — Final Verification

Zuerst der Nachweis, dass alle vier ursprünglich roten Tests grün sind und die Assertions
unverändert geblieben sind:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats tests/spec/g-dep01-npm-vuln.bats

git diff --stat main -- tests/
# erwartet: leer — keine Testdatei wurde angefasst
```

Der leere Test-Diff ist das eigentliche Qualitätsmerkmal dieses Changes: er belegt, dass Grün
durch echte Fixes entstanden ist und nicht durch nachgezogene Erwartungen.

Dann die drei verpflichtenden Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Abschliessend der Gegencheck, dass der Rückstand wie erwartet gesunken ist:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/*.bats 2>&1 | grep -c '^not ok'
# erwartet: 44 (vorher 48, minus die vier hier behobenen)
```

**Akzeptanz:** alle vier Tests grün; `git diff main -- tests/` leer; die drei Gate-Kommandos
grün; Gesamtzahl roter Spec-Tests bei 44; PR-Beschreibung enthält pro Position eine Zeile
„was war die Lücke, wie geschlossen".
