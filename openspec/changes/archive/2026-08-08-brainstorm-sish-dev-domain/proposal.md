# Proposal: brainstorm-sish-dev-domain

## Why

Der dev-stack sish-Broker bindet den falschen Host. Er soll den Brainstorm-Tunnel auf
`*.dev.<domain>` auflegen, bindet aber `brainstorm.<prod-domain>` — genau den Host, dessen
404-Verhalten die Auslagerung auf den Dev-Knoten seinerzeit ausgelöst hat (T000364).

### Symptom (beobachtet, reproduzierbar)

`tests/unit/brainstorm-dev-host.bats` Test 4 schlägt auf `main` fehl:

```
not ok 4 the dev-stack sish broker (the new brainstorm host) is present and binds *.dev.<domain>
    (assert_success, Zeile 42)
    status : 1, output leer
```

Die erste Assertion des Tests (`name: sish`) läuft durch; es scheitert der `grep` auf
`--bind-hosts=*.${DEV_DOMAIN}`.

### Ursache (verifiziert, nicht vermutet)

`k3d/dev-stack/sish.yaml` führt heute:

```yaml
- --domain=${PROD_DOMAIN}
- --bind-hosts=brainstorm.${PROD_DOMAIN}
```

Drei unabhängige Quellen fordern übereinstimmend das Gegenteil, nur das Manifest weicht ab:

| Quelle | Aussage |
|---|---|
| SSOT-Spec `openspec/specs/llm-local-dev.md` (Requirement "Brainstorm Tunnel Runs on Dev Node Only") | „SHALL route the brainstorm tunnel exclusively through the dev-stack sish broker (`*.dev.mentolder.de`)" |
| `taskfiles/Taskfile.brainstorm.yml` | publiziert nach `brainstorm.${DEV_DOMAIN}`, tunnelt gegen `tunnel@$DEV_DOMAIN` |
| `tests/unit/brainstorm-dev-host.bats` (T000364) | erwartet `--bind-hosts=*.${DEV_DOMAIN}` |

Eingeschleppt am 2026-06-06 in `b6218fec0` (PR #1375, „refactor(brett): Full-Stack TypeScript
migration") durch einen sachfremden Zwischencommit. Der Diff dieses Commits an `sish.yaml`:

```diff
- - --domain=${DEV_DOMAIN}
+ - --domain=mentolder.de
- - --bind-hosts=*.${DEV_DOMAIN}
+ - --bind-hosts=brainstorm.mentolder.de
```

(Die Brand-Literale wurden später von einem anderen Vorgang auf `${PROD_DOMAIN}`
parametrisiert — die falsche *Domain-Ebene* blieb dabei bestehen.)

### Warum es zwei Monate unbemerkt blieb

Der Guard, der genau das verhindern sollte, war zum Zeitpunkt der Regression stillgelegt:

| Zeit | PR | Wirkung |
|---|---|---|
| 2026-06-06 16:54:16 | #1376 `77169f3fd` „test: wire orphaned unit tests" | setzt `brainstorm-dev-host` in `tests/unit/.coverage-allowlist` |
| 2026-06-06 17:00:01 | #1375 `b6218fec0` | bringt die Regression in `sish.yaml` |

Sechs Minuten. Zwei parallele PRs, jeder für sich grün — erst ihre Kombination ist kaputt.
Der Eintrag steht zudem unter der Rubrik „Need a live DB / cluster / kubectl / ssh", obwohl der
Test ausschließlich `grep` auf Repo-Dateien ausführt und keinerlei Infrastruktur braucht.

## What

1. `k3d/dev-stack/sish.yaml` auf die Dev-Domain-Ebene zurücksetzen: `--domain=${DEV_DOMAIN}` und
   `--bind-hosts=*.${DEV_DOMAIN}`. Beide Variablen stehen in der envsubst-Allowlist von
   `taskfiles/Taskfile.dev-stack.yml` (`dev:apply`), werden also expandiert.
2. `brainstorm-dev-host` aus `tests/unit/.coverage-allowlist` entfernen, damit der Guard in
   `task test:unit` wieder greift. Ohne diesen Schritt behebt der Fix den Zustand, aber nicht
   seine Unsichtbarkeit — dieselbe Regression könnte erneut unbemerkt einziehen.
**Keine Spec-Änderung nötig.** Das Requirement „Brainstorm Tunnel Runs on Dev Node Only" deckt den
Fall bereits vollständig ab — es führt neben den drei prod-Overlay-Szenarien auch das Szenario
„Dev-Stack-sish-Broker ist vorhanden und bindet `*.dev.<domain>`", das genau auf
`--bind-hosts=*.${DEV_DOMAIN}` prüft. Die Spec war die ganze Zeit korrekt und vollständig; allein
die Implementierung ist von ihr abgewichen, und der Guard, der das gemeldet hätte, war
stillgelegt. Dieser Vorgang stellt den vom Spec geforderten Zustand wieder her, statt den Spec zu
ändern.

**Nicht in diesem Vorgang:** Die weiteren 8 vermutlich offline-fähigen Einträge der
Ausschlussliste — eigenes Ticket **T002707** (bewusste Umfangsentscheidung, damit dieser Fix
prüfbar klein bleibt).

_Ticket: T002705_
