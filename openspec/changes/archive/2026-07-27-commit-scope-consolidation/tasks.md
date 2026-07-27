---
title: "commit-scope-consolidation — Implementation Plan"
ticket_id: T002328
domains: [ci, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# commit-scope-consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

_Ticket: T002328 — Teil A des Epics T002326 (Ticketsystem-Konsolidierung)_

**Goal:** Die Commit-Scope-Allowlist von 95 auf 14 Einträge reduzieren und den toten
ci.yml-Parser in `preflight-pr-scope.sh` entfernen, sodass ein abgelehnter Scope seinen
Zielnamen in der Diagnose nennt.

**Architecture:** `commitlint.config.cjs` bleibt die einzige Quelle und exportiert zusätzlich
zwei Alias-Strukturen. `validate-commit-msg.sh` lädt sie über denselben `node -e`-Pfad wie
`namedScopes` und schlägt einen abgelehnten Scope zuerst dort nach, bevor die bestehende
`suggest_scope`-Heuristik greift. `preflight-pr-scope.sh` verliert seine ci.yml-Abhängigkeit
vollständig und ruft nur noch `validate-commit-msg.sh scopes` auf.

**Tech Stack:** Node.js (CommonJS-Config), Bash 5, BATS (vendored unter
`tests/unit/lib/bats-core/bin/bats`).

## Global Constraints

- Die Git-Historie wird **nicht** umgeschrieben — der Guard prüft ausschließlich `origin/main..HEAD`.
- `deps` bleibt unverändert gültiger Scope; Renovate-PRs hängen daran.
- Die dynamischen Muster `^T\d{6}$` (Ticket) und `^G-[A-Z][A-Z0-9]+$` (Health-Goal) bleiben unangetastet.
- Deutsche Diagnosetexte, passend zu den bestehenden Meldungen aus T002115.
- Kein Alias auf ein System, das nicht mehr existiert — solche Scopes bekommen eine Retired-Meldung.

## File Structure

| Datei | Verantwortung |
|---|---|
| `commitlint.config.cjs` | **Modify** — SSOT: 14 `NAMED_SCOPES`, `SCOPE_ALIAS_GROUPS`, `SCOPE_RETIRED`, `SYNTHETIC_SCOPE_RE` |
| `scripts/validate-commit-msg.sh` | **Modify** — lädt die Alias-Strukturen und gibt die gezielte Diagnose aus |
| `scripts/preflight-pr-scope.sh` | **Modify** — ci.yml-Parser und `CI_WORKFLOW` ersatzlos entfernen |
| `scripts/register-scope.sh` | **Modify** — Alias-, Retired- und Synthetik-Namen ablehnen |
| `openspec/specs/ci-cd.md` | **Modify** — Requirement auf die echte Quelle umschreiben, Alias-Requirement ergänzen |
| `openspec/changes/commit-scope-consolidation/specs/ci-cd.md` | **Modify** — Delta-Spec zum obigen |
| `tests/spec/ci-cd.bats` | **Modify** — enthält bereits die neun RED-Tests aus dem Stage-Commit |
| `tests/spec/t001356-git02-conventional-commit.bats` | **Modify** — vier Tests mit umgekehrter Vorbedingung |
| `tests/unit/preflight-pr-scope.bats` | **Modify** — der Exit-2-Test entfällt mit dem Parameter |
| `website/src/data/test-inventory.json` | **Modify** — generiert, via `task test:inventory` |

**S1-Budgets** (wirksame Schwelle = statisches Extension-Limit; keine dieser Dateien ist
gebaselined, geprüft mit `jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json`):

| `path` | ist | budget |
|---|---|---|
| `commitlint.config.cjs` | 86 | 114 |
| `scripts/validate-commit-msg.sh` | 254 | 246 |
| `scripts/preflight-pr-scope.sh` | 122 | 378 |
| `scripts/register-scope.sh` | 66 | 434 |

`.bats` und `.md` stehen nicht in `s1.limits` (`docs/code-quality/gates.yaml`) und haben daher
kein Zeilenbudget. Das engste Budget ist `commitlint.config.cjs` mit 114 Zeilen: die
Alias-Struktur wird deshalb **gruppiert** notiert (Ziel → Liste alter Namen) statt als flache
Paar-Map, was rund 40 Zeilen spart und zugleich lesbarer ist. Der Wegfall von 81
`NAMED_SCOPES`-Einträgen schafft zusätzlich Platz; die Datei landet bei etwa 95 Zeilen.

---

### Task 1: RED-Nachweis der bestehenden Tests

**Files:**
- Test: `tests/spec/ci-cd.bats` (Abschnitt „T002328", am Dateiende)

**Interfaces:**
- Consumes: nichts
- Produces: den dokumentierten Ausgangszustand für alle folgenden Tasks

- [ ] **Step 1: Die neun T002328-Tests laufen lassen**

```bash
tests/unit/lib/bats-core/bin/bats --filter "T002328" tests/spec/ci-cd.bats
```

expected: FAIL — alle neun als `not ok`. Erwartete Fehlerursache je Test:

| Test | Scheitert an |
|---|---|
| `hoechstens 15 Eintraege` | `[ "$count" -le 15 ]` — aktuell sind es 95 |
| `'agents' ist ein gueltiger Scope` | `grep -qx 'agents'` — nicht registriert |
| `kein Synthetik-Scope` | `[ "$output" = "0" ]` — 37 vorhanden |
| `'admin' nennt sein Ziel 'website'` | `[ "$status" -ne 0 ]` — `admin` ist noch gültig |
| `'skills' nennt sein Ziel 'agents'` | `[ "$status" -ne 0 ]` — `skills` ist noch gültig |
| `'tracking' wird als entfernt gemeldet` | `[[ "$output" == *"entfallen"* ]]` — Meldung ist generisch |
| `register-scope.sh weigert sich` | `[[ "$output" == *"website"* ]]` — keine Alias-Kenntnis |
| `preflight bezieht nicht mehr aus ci.yml` | `[ "$output" = "0" ]` — `CI_WORKFLOW` existiert noch |
| `ci-cd.md schreibt commitlint fest` | `[ "$status" -ne 0 ]` — alte Formulierung steht noch |

- [ ] **Step 2: Kein Commit**

Dieser Task verändert nichts. Die Tests liegen mit dem Stage-Commit bereits im Branch.

---

### Task 2: Scope-Satz und Alias-Strukturen in commitlint.config.cjs

**Files:**
- Modify: `commitlint.config.cjs:1-86`
- Test: `tests/spec/ci-cd.bats`

**Interfaces:**
- Consumes: nichts
- Produces: `module.exports.namedScopes` (Array, 14 Einträge, unverändertes Format),
  `module.exports.scopeAliases` (Objekt `{ [alt: string]: string }`, flach abgeleitet),
  `module.exports.scopeRetired` (Objekt `{ [alt: string]: string }`, Wert ist die
  Begründung), `module.exports.syntheticScopeRe` (String, damit Bash ihn per `node -e`
  ausgeben kann) und `module.exports.scopeHint` (Funktion `(scope: string) => string`).
  Task 3 und Task 5 rufen genau `scopeHint` auf.

- [ ] **Step 1: NAMED_SCOPES auf die 14 Ziel-Scopes reduzieren**

Ersetze die Zeilen 1–61 (das gesamte `NAMED_SCOPES`-Array) durch:

```js
// Sechs Domänen-Scopes, deckungsgleich mit den Agent-Rollen in CLAUDE.md
// (.claude/agents/bachelorprojekt-*), plus acht Querschnitts-Scopes für das,
// was keiner Domäne gehört. Konsolidiert von 95 auf 14 in T002328 — die
// vollständige Herleitung steht in
// openspec/changes/commit-scope-consolidation/design.md.
const NAMED_SCOPES = [
  // Domänen
  'website',
  'infra',
  'db',
  'security',
  'ops',
  'test',
  // Querschnitt
  'plans',
  'factory',
  'agents',
  'ci',
  'scripts',
  'docs',
  'mcp',
  'deps',
];
```

- [ ] **Step 2: Alias-Gruppen ergänzen**

Direkt unter `NAMED_SCOPES` einfügen:

```js
// Ziel-Scope -> die Namen, die darin aufgegangen sind. Gruppiert statt als
// flache Paar-Map notiert: spart rund 40 Zeilen (das .cjs-Limit liegt bei 200)
// und macht die Zusammenfassung auf einen Blick lesbar.
const SCOPE_ALIAS_GROUPS = {
  website: ['brett', 'admin', 'billing', 'coaching', 'dashboard', 'arena', 'brain',
    'knowledge', 'mentolder-web', 'kore', 'cockpit', 'videovault', 'ui', 'content',
    'content-hub', 'questionnaire', 'sidekick', 'assistant', 'portal', 'art-library',
    'assets', 'api', 'stream', 'planungsbuero', 'mediaviewer', 'newsletter'],
  infra: ['k3d', 'fleet', 'flux', 'korczewski', 'mentolder', 'prod', 'deploy', 'env',
    'config', 'netpol', 'nextcloud', 'collabora', 'coturn', 'janus', 'platform',
    'dev-stack', 'dev', 'argocd', 'whiteboard', 'wg', 'talk'],
  db: ['database', 'schema', 'backup'],
  security: ['secrets', 'sso', 'auth', 'pocket-id', 'rbac', 'keycloak', 'pentest'],
  ops: ['llm', 'terminal', 'recovery', 'monitoring', 'graph', 'oracle', 'gemini', 'claude'],
  test: ['tests', 'testing', 'e2e', 'systemtest', 'dev-status'],
  plans: ['plan', 'openspec', 'spec', 'specs', 'brainstorm'],
  factory: ['dev-flow', 'tickets', 'factory-floor', 'auto', 'hooks'],
  agents: ['skills', 'agent-guide', 'opencode', 'prompt-library', 'knowledge-ingest',
    'openclaw'],
  ci: ['quality', 'goals', 'cqg', 'docs-gen'],
  mcp: ['mcp-task-runner'],
};

const SCOPE_ALIASES = Object.fromEntries(
  Object.entries(SCOPE_ALIAS_GROUPS).flatMap(([target, olds]) =>
    olds.map((old) => [old, target])),
);

// Systeme, die es nicht mehr gibt. Ein Alias wäre hier eine Falschauskunft —
// stattdessen nennt die Meldung den Grund des Wegfalls.
const SCOPE_RETIRED = {
  tracking: 'die Tracking-Pipeline wurde in PR #788/#993 entfernt',
  livekit: 'LiveKit wurde per T002184 entfernt',
};

// Synthetik-Codes aus abgeschlossenen Quality-Goals (cq07, sec03, dora01, …).
// Sie waren nie als Commit-Scope gedacht; der Health-Goal-Scope G-CQ07 deckt
// denselben Zweck ab und bleibt gültig.
const SYNTHETIC_SCOPE_RE = /^(cq|sec|dora|size|test|doc|fe|k8s|spec|ci|cd|dep|img)\d{2}$/;
```

- [ ] **Step 3: Diagnose-Helper und Export ergänzen**

Ersetze den `module.exports`-Block (Zeilen 66–86) durch:

```js
// Liefert die Zusatzzeile für einen abgelehnten Scope — oder '' wenn nichts
// Genaueres bekannt ist. Wird von der commitlint-Regel und (über den
// node -e-Pfad) von scripts/validate-commit-msg.sh benutzt.
function scopeHint(scope) {
  if (SCOPE_ALIASES[scope]) {
    return `'${scope}' wurde zu '${SCOPE_ALIASES[scope]}' konsolidiert (T002328)`;
  }
  if (SCOPE_RETIRED[scope]) {
    return `'${scope}' ist entfallen — ${SCOPE_RETIRED[scope]}`;
  }
  if (SYNTHETIC_SCOPE_RE.test(scope)) {
    return `'${scope}' war ein Quality-Goal-Code — nutze 'ci' oder den Health-Goal-Scope G-${scope.toUpperCase()}`;
  }
  return '';
}

module.exports = {
  namedScopes: NAMED_SCOPES,
  scopeAliases: SCOPE_ALIASES,
  scopeRetired: SCOPE_RETIRED,
  syntheticScopeRe: SYNTHETIC_SCOPE_RE.source,
  scopeHint,
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'scope-allowed': (parsed) => {
          if (!parsed || !parsed.scope) return [true];
          if (NAMED_SCOPES.includes(parsed.scope)) return [true];
          if (TICKET_SCOPE_RE.test(parsed.scope)) return [true];
          if (HEALTH_GOAL_SCOPE_RE.test(parsed.scope)) return [true];
          const hint = scopeHint(parsed.scope);
          return [false, hint || `scope "${parsed.scope}" is not allowed. Must be a named scope, health goal (G-XXX), or ticket number (Tdddddd)`];
        },
      },
    },
  ],
  rules: {
    'header-max-length': [2, 'always', 150],
    'scope-allowed': [2, 'always'],
  },
};
```

- [ ] **Step 4: Config lädt und liefert die erwarteten Werte**

```bash
node -e "const c=require('./commitlint.config.cjs');
console.log('scopes', c.namedScopes.length);
console.log('admin ->', c.scopeAliases.admin);
console.log('hint', c.scopeHint('tracking'));"
```

Expected: PASS — Ausgabe `scopes 14`, `admin -> website`, Hinweistext mit dem Wort
„entfallen".

- [ ] **Step 5: Zeilenbudget prüfen**

```bash
wc -l commitlint.config.cjs
```

Expected: PASS — unter 200 Zeilen (das `.cjs`-Limit; Budget laut File-Structure-Tabelle 114
Zeilen über dem Ist-Wert 86).

- [ ] **Step 6: Die drei allowlist-bezogenen Tests laufen**

```bash
tests/unit/lib/bats-core/bin/bats --filter "T002328: (die Scope-Allowlist|'agents'|kein Synthetik)" tests/spec/ci-cd.bats
```

Expected: PASS — drei `ok`.

- [ ] **Step 7: Commit**

```bash
git add commitlint.config.cjs
git commit -m "fix(ci): Scope-Allowlist auf 14 Domaenen-Scopes konsolidieren [T002328]"
```

---

### Task 3: Alias-Diagnose in validate-commit-msg.sh

**Files:**
- Modify: `scripts/validate-commit-msg.sh:66` (Loader ergänzen), `:162-169` (Diagnose-Zweig)
- Test: `tests/spec/ci-cd.bats`

**Interfaces:**
- Consumes: `scopeHint` aus Task 2
- Produces: unveränderte CLI-Signatur (`range`/`head`/`message`/`scopes`); die Diagnosezeile
  auf stderr trägt weiterhin das Präfix `    ↳ ` wie die bestehende `did you mean`-Ausgabe

- [ ] **Step 1: Hint-Loader neben load_allowed_scopes stellen**

Direkt nach `ALLOWED_SCOPES="$(load_allowed_scopes)"` (Zeile 66) einfügen:

```bash
# Gezielte Diagnose für einen abgelehnten Scope aus commitlint.config.cjs
# (SSOT). Leere Ausgabe = nichts Genaueres bekannt, dann greift suggest_scope.
scope_hint() {
  local scope="$1"
  if command -v node >/dev/null 2>&1 && [ -f "$CONFIG" ]; then
    node -e "
      const cfg = require('$CONFIG');
      const fn = cfg.scopeHint;
      process.stdout.write(typeof fn === 'function' ? fn(process.argv[1]) : '');
    " "$scope" 2>/dev/null
  fi
}
```

Der Scope wird als `process.argv[1]` übergeben statt in den Skript-String interpoliert —
sonst könnte ein Scope mit Anführungszeichen den `node -e`-Ausdruck zerlegen.

- [ ] **Step 2: Diagnose-Zweig um den Hint erweitern**

Ersetze den Block in Zeile 162–169 durch:

```bash
      if [ "$ok" -ne 0 ]; then
        echo "  ✗ ${label}unknown scope '${scope}': ${subject}" >&2
        local _hint _suggestion
        _hint="$(scope_hint "$scope")"
        if [ -n "$_hint" ]; then
          echo "    ↳ ${_hint}" >&2
        elif _suggestion="$(suggest_scope "$scope")" && [ -n "$_suggestion" ]; then
          echo "    ↳ did you mean '${_suggestion}'?" >&2
        fi
        return 1
      fi
```

Der Hint hat Vorrang: `suggest_scope` liefert für `admin` nur eine Prefix-Antwort ohne
Aussagekraft, während die Alias-Map den tatsächlichen Zielnamen kennt.

- [ ] **Step 3: Diagnose manuell prüfen**

```bash
printf 'feat(admin): x\n' > /tmp/m1 && bash scripts/validate-commit-msg.sh message /tmp/m1
printf 'feat(tracking): x\n' > /tmp/m2 && bash scripts/validate-commit-msg.sh message /tmp/m2
printf 'feat(cq07): x\n' > /tmp/m3 && bash scripts/validate-commit-msg.sh message /tmp/m3
```

Expected: PASS — dreimal Exit 1; die Meldungen nennen `website`, „entfallen" bzw. `G-CQ07`.

- [ ] **Step 4: Die drei Diagnose-Tests laufen**

```bash
tests/unit/lib/bats-core/bin/bats --filter "T002328: (konsolidierter|entfallener)" tests/spec/ci-cd.bats
```

Expected: PASS — drei `ok`.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-commit-msg.sh
git commit -m "fix(ci): abgelehnte Scopes nennen ihren Zielnamen [T002328]"
```

---

### Task 4: Toten ci.yml-Parser aus preflight-pr-scope.sh entfernen

**Files:**
- Modify: `scripts/preflight-pr-scope.sh:6`, `:13`, `:91-105`, `:120`
- Modify: `tests/unit/preflight-pr-scope.bats:71-75`
- Test: `tests/spec/ci-cd.bats`, `tests/unit/preflight-pr-scope.bats`

**Interfaces:**
- Consumes: `validate-commit-msg.sh scopes` aus Task 3
- Produces: CLI-Signatur **verkürzt** auf `preflight-pr-scope.sh <pr-title>` — das zweite
  Argument `ci_workflow_path` entfällt ersatzlos. Exit-Code 2 („Workflow-Datei fehlt")
  existiert danach nicht mehr; verbleibend sind 0 (gültig) und 1 (ungültig).

- [ ] **Step 1: Parameter und Parser entfernen**

Streiche `CI_WORKFLOW="${2:-.github/workflows/ci.yml}"` (Zeile 13), den zugehörigen
Usage-Hinweis in Zeile 6 und den kompletten awk-Block samt Existenzprüfung (Zeilen 91–102).
Der verbleibende Lade-Pfad ist der bisherige Fallback, jetzt als einziger Weg:

```bash
# Allowlist aus der SSOT commitlint.config.cjs (T002328). Früher wurde hier ein
# `scopes: |`-Block aus ci.yml geparst — den gibt es dort nicht mehr, die Datei
# hält selbst fest "Scopes are NOT enforced here". Der Parser lief seither leer.
_ssot_script="$(dirname "$0")/validate-commit-msg.sh"
if [ ! -x "$_ssot_script" ]; then
  echo "preflight-pr-scope: FATAL: $_ssot_script nicht gefunden" >&2
  exit 1
fi
_allowed="$("$_ssot_script" scopes)"
if [ -z "$_allowed" ]; then
  echo "preflight-pr-scope: FATAL: leere Scope-Allowlist aus commitlint.config.cjs" >&2
  exit 1
fi
```

Die leere Liste wird fail-closed behandelt: bisher rutschte der leere awk-Output
stillschweigend in den Fallback, wodurch ein echter Config-Defekt unsichtbar blieb.

- [ ] **Step 2: Quellenangabe in der Fehlermeldung korrigieren**

Ersetze in Zeile 120 `"Allowed scopes (from $CI_WORKFLOW):"` durch
`"Allowed scopes (from commitlint.config.cjs):"`.

- [ ] **Step 3: Den obsoleten Exit-2-Test entfernen**

Lösche in `tests/unit/preflight-pr-scope.bats` den Test
`@test "preflight: missing workflow file exits 2"` (Zeilen 71–75) vollständig — er prüft
einen Exit-Code, den es nach Step 1 nicht mehr gibt. Prüfe im selben Zug mit
`grep -n 'ci.yml' tests/unit/preflight-pr-scope.bats`, ob weitere Tests das zweite Argument
übergeben; entferne dort nur das Argument, nicht den Test.

- [ ] **Step 4: Preflight-Tests laufen**

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/preflight-pr-scope.bats
tests/unit/lib/bats-core/bin/bats --filter "T002328: preflight" tests/spec/ci-cd.bats
```

Expected: PASS — alle verbleibenden Tests grün, keine Skips.

- [ ] **Step 5: Commit**

```bash
git add scripts/preflight-pr-scope.sh tests/unit/preflight-pr-scope.bats
git commit -m "fix(ci): toten ci.yml-Scope-Parser aus preflight entfernen [T002328]"
```

---

### Task 5: register-scope.sh gegen Wiederauferstehung sichern

**Files:**
- Modify: `scripts/register-scope.sh` (Zeilen 6–31)
- Test: `tests/spec/ci-cd.bats`

**Interfaces:**
- Consumes: `scopeHint` aus Task 2
- Produces: unveränderte CLI-Signatur `register-scope.sh <scope> [--config <path>]`; neuer
  Exit-Code 1 für Alias-, Retired- und Synthetik-Namen

- [ ] **Step 1: Argumentschleife vor die Prüfungen ziehen**

Die Alias-Prüfung braucht `$CONFIG`, das heute erst nach der Ticket-Scope-Prüfung endgültig
feststeht. Verschiebe die `CONFIG`-Zuweisung (Zeile 10) und die `--config`-Argumentschleife
(Zeilen 12–17) unmittelbar hinter das `shift` in Zeile 7, damit ein per `--config`
übergebener Pfad auch für den neuen Block gilt.

- [ ] **Step 2: Alias-Prüfung einfügen**

Nach der Ticket-Scope-Prüfung und **vor** der Format-Prüfung (`^[a-z0-9][a-z0-9-]*$`)
einfügen:

```bash
# Ein konsolidierter Scope darf nicht per register-scope zurückkehren — sonst
# baut sich die Allowlist Eintrag für Eintrag wieder auf (T002328).
if [ -f "$CONFIG" ]; then
  _hint="$(node -e "
    const cfg = require('$CONFIG');
    process.stdout.write(typeof cfg.scopeHint === 'function' ? cfg.scopeHint(process.argv[1]) : '');
  " "$SCOPE" 2>/dev/null || true)"
  if [ -n "$_hint" ]; then
    echo "register-scope: $_hint" >&2
    exit 1
  fi
fi
```

- [ ] **Step 3: Verhalten manuell prüfen**

```bash
bash scripts/register-scope.sh admin; echo "exit=$?"
bash scripts/register-scope.sh mein-neuer-scope; echo "exit=$?"
```

Expected: PASS — erster Aufruf Exit 1 mit `website` in der Meldung; zweiter Aufruf Exit 0 und
trägt den Scope ein. Entferne die Testregistrierung anschließend **von Hand** aus
`commitlint.config.cjs`; ein `git checkout -- commitlint.config.cjs` würde die noch nicht
gemergte Arbeit aus Task 2 verwerfen.

- [ ] **Step 4: Der register-scope-Test läuft**

```bash
tests/unit/lib/bats-core/bin/bats --filter "T002328: register-scope" tests/spec/ci-cd.bats
```

Expected: PASS — ein `ok`.

- [ ] **Step 5: Commit**

```bash
git add scripts/register-scope.sh
git commit -m "fix(ci): register-scope lehnt konsolidierte Scope-Namen ab [T002328]"
```

---

### Task 6: Spec-Delta und SSOT-Spec

**Files:**
- Modify: `openspec/specs/ci-cd.md:941-969`
- Modify: `openspec/changes/commit-scope-consolidation/specs/ci-cd.md`
- Test: `tests/spec/ci-cd.bats`

**Interfaces:**
- Consumes: das Verhalten aus Task 2–5
- Produces: die Requirements, gegen die `task openspec:validate` und der Drift-Check prüfen

- [ ] **Step 1: Requirement „Preflight-PR-Scope-Validierung" umschreiben**

Ersetze in `openspec/specs/ci-cd.md` den Requirement-Satz in Zeile 944 durch:

```markdown
The system SHALL validate PR title scopes against the named-scope list in
`commitlint.config.cjs` before `gh pr create` and SHALL exit 0 for valid scopes and exit
non-zero with an allowlist hint for unknown scopes.
```

Streiche im selben Requirement das Scenario „Fehlende Workflow-Datei liefert Exit-Code 2"
samt seiner drei Aufzählungszeilen — den Exit-Code gibt es nach Task 4 nicht mehr. Passe im
Scenario „Gültiger Scope besteht die Validierung" die GIVEN-Zeile an: statt „eine `ci.yml`
mit `admin` im Scope-Allowlist" heißt es „`commitlint.config.cjs` mit `website` in
`namedScopes`", und der Beispieltitel wird `feat(website): add dashboard`.

- [ ] **Step 2: Requirement für die Alias-Diagnose ergänzen**

Direkt nach dem obigen Requirement einfügen:

```markdown
### Requirement: Konsolidierte Scope-Namen nennen ihr Ziel
<!-- bats: ci-cd.bats -->

The system SHALL reject a commit scope that was consolidated into another scope and SHALL
name the target scope in the diagnostic, and SHALL report a scope whose subsystem was
removed as retired rather than mapping it to a replacement.

#### Scenario: Konsolidierter Scope nennt sein Ziel *(BATS)*
- **GIVEN** ein Commit-Subject `feat(admin): add dashboard`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 1 und die Diagnose nennt `website` als Zielscope

#### Scenario: Entfallener Scope wird nicht gemappt *(BATS)*
- **GIVEN** ein Commit-Subject `feat(tracking): add import`
- **WHEN** `scripts/validate-commit-msg.sh message` das Subject prüft
- **THEN** liefert das Skript Exit-Code 1 und meldet den Scope als entfallen, ohne einen
  Ersatz-Scope zu nennen

#### Scenario: register-scope verweigert die Wiederanlage *(BATS)*
- **GIVEN** der konsolidierte Scope-Name `admin`
- **WHEN** `scripts/register-scope.sh admin` aufgerufen wird
- **THEN** liefert das Skript einen Exit-Code ungleich 0 und trägt den Namen nicht in
  `commitlint.config.cjs` ein
```

- [ ] **Step 3: Dieselben Requirements in die Delta-Spec übernehmen**

Schreibe beide Requirements (das umgeschriebene und das neue) nach
`openspec/changes/commit-scope-consolidation/specs/ci-cd.md`, damit der Archive-Schritt sie in
die SSOT mergen kann. Die Delta-Datei trägt bewusst den Namen der Parent-SSOT-Spec
(`ci-cd.md`), nicht den Change-Slug — Konvention aus T001304.

- [ ] **Step 4: OpenSpec-Validierung**

```bash
task openspec:validate
```

Expected: PASS

- [ ] **Step 5: Der Spec-Test läuft**

```bash
tests/unit/lib/bats-core/bin/bats --filter "T002328: ci-cd.md" tests/spec/ci-cd.bats
```

Expected: PASS — ein `ok`.

- [ ] **Step 6: Commit**

```bash
git add openspec/specs/ci-cd.md openspec/changes/commit-scope-consolidation/specs/ci-cd.md
git commit -m "docs(plans): Scope-Allowlist-Quelle und Alias-Diagnose spezifizieren [T002328]"
```

---

### Task 7: Kollidierende Alt-Tests umschreiben

**Files:**
- Modify: `tests/spec/t001356-git02-conventional-commit.bats:159-183`, `:197-226`
- Test: dieselbe Datei

**Interfaces:**
- Consumes: das Verhalten aus Task 2–3
- Produces: nichts, worauf spätere Tasks aufbauen

Vier Tests kodieren die alte Welt in ihrem Titel. Ihre Absicht bleibt gültig, nur das
Beispiel wechselt — deshalb werden sie umgeschrieben statt gelöscht.

- [ ] **Step 1: Die beiden T002115-Tests auf einen erhaltenen Scope umstellen**

`@test "T002115: 'skills' ist ein registrierter Scope"` prüft künftig `agents` statt
`skills`; Titel und `grep`-Muster entsprechend anpassen.
`@test "T002115: commit-msg-Hook laesst chore(skills) durch"` nutzt künftig `chore(agents)`
im Subject; Titel entsprechend anpassen. Der Test
`@test "T002115: commit-msg-Hook lehnt einen unbekannten Scope ab"` bleibt unverändert,
sofern sein Beispiel-Scope nicht in `SCOPE_ALIAS_GROUPS` steht — prüfe das mit:

```bash
grep -n "unbekannten Scope" -A6 tests/spec/t001356-git02-conventional-commit.bats
```

- [ ] **Step 2: Die beiden T002240-Tests auf einen dauerhaft unbekannten Scope umstellen**

`agents` ist ab Task 2 gültig und taugt nicht mehr als Beispiel für einen unbekannten Scope.
Ersetze es in `@test "T002240: unknown scope 'agents' suggests the nearest valid scope"` und
`@test "T002240: the suggestion is a scope that actually validates"` durch `websitex` — das
ist kein Alias, kein Retired-Eintrag und kein Synthetik-Code und greift weiterhin über die
Prefix-Heuristik auf `website`. Passe die Testtitel an, sodass sie das neue Beispiel nennen.

- [ ] **Step 3: Die vollständige Alt-Datei laufen lassen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001356-git02-conventional-commit.bats
```

Expected: PASS — alle Tests grün, keine Skips.

- [ ] **Step 4: Commit**

```bash
git add tests/spec/t001356-git02-conventional-commit.bats
git commit -m "test: Scope-Tests auf das konsolidierte Vokabular umstellen [T002328]"
```

---

### Task 8: Verifikation

**Files:**
- Modify: `website/src/data/test-inventory.json` (generiert)

**Interfaces:**
- Consumes: alles aus Task 2–7
- Produces: den grünen Gesamtzustand für den PR

- [ ] **Step 1: Die vollständige T002328-Suite**

```bash
tests/unit/lib/bats-core/bin/bats --filter "T002328" tests/spec/ci-cd.bats
```

Expected: PASS — neun `ok`, kein `not ok`.

- [ ] **Step 2: Der eigene Guard gegen sich selbst**

```bash
bash scripts/validate-commit-msg.sh range origin/main..HEAD
```

Expected: PASS — alle Commits dieses Branches nutzen `ci`, `test` oder `plans` und bestehen
die neue, engere Allowlist. Schlägt dieser Schritt fehl, ist ein Commit-Subject dieses
Branches selbst betroffen: dann per `git rebase -i` das Subject korrigieren, nicht die
Allowlist erweitern.

- [ ] **Step 3: Test-Inventar regenerieren**

```bash
task test:inventory
git diff --stat website/src/data/test-inventory.json
```

Expected: PASS — das Inventar zählt auf Datei-, nicht auf `@test`-Ebene; da dieser Change
keine neue Testdatei anlegt, bleibt es bei 353 Einträgen und der Diff ist leer. Der Lauf ist
trotzdem Pflicht: CI regeneriert das Inventar und vergleicht gegen die committete Fassung.
Entsteht wider Erwarten doch ein Diff, gehört er in den Commit aus Step 5.

- [ ] **Step 4: Die drei Pflicht-Gates**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Expected: PASS — alle drei grün. `task freshness:check` deckt den S1–S4-Ratchet und die
Baseline-Key-Count-Assertion mit ab.

- [ ] **Step 5: Commit**

```bash
git add website/src/data/test-inventory.json
git commit -m "chore(ci): Test-Inventar nach Scope-Konsolidierung regenerieren [T002328]"
```
