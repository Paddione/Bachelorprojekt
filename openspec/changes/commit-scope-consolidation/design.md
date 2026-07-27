---
ticket_id: T002328
plan_ref: openspec/changes/commit-scope-consolidation/tasks.md
status: active
date: 2026-07-27
---

# Design — Commit-Scope-Konsolidierung (T002328)

## Purpose

Die Commit-Scope-Allowlist ist auf 95 Einträge gewachsen, während in den letzten 90 Tagen
279 verschiedene Scopes tatsächlich benutzt wurden. Der Guard lehnt deshalb regelmäßig
Commits ab, die inhaltlich völlig korrekt sind — er ist zu einer Reibungsquelle geworden,
ohne dafür einen Gegenwert zu liefern: **kein Konsument im Repo wertet den Scope aus.**

Dieser Change reduziert das Vokabular auf 14 Scopes, die sich an der bereits etablierten
Agent-Routing-Tabelle orientieren, und ersetzt die generische `unknown scope`-Meldung durch
eine Alias-Diagnose, die den Zielnamen direkt nennt. Er ist Teil A des Epics T002326
(Ticketsystem-Konsolidierung) und Vorbedingung für Teil B (Typ-Vokabular) und C
(Bug-Konsolidierung).

## Root-Cause

Drei gekoppelte Defekte, in der Reihenfolge ihrer Entstehung:

**D1 — Toter Parser in `scripts/preflight-pr-scope.sh`.** Zeile 91–99 parst per awk einen
`scopes: |`-Block aus `.github/workflows/ci.yml`. Dieser Block existiert dort nicht mehr;
`ci.yml:542` hält seit der Umstellung explizit fest: *„Scopes are NOT enforced here"*. Der
awk-Parser liefert seither immer eine leere Liste. Funktionsfähig bleibt das Skript nur
durch den Fallback in Zeile 103–105, der `validate-commit-msg.sh scopes` aufruft. Die
Fehlermeldung in Zeile 120 nennt dem Nutzer weiterhin `ci.yml` als Quelle — sie zeigt auf
eine Datei, die nichts beisteuert.

**D2 — Die Spec zementiert den toten Pfad.** `openspec/specs/ci-cd.md:944` formuliert als
Requirement: *„SHALL validate PR title scopes against the semantic-PR allowlist from
`ci.yml`"*. Solange die SSOT-Spec die falsche Quelle vorschreibt, ist D1 kein Bug, sondern
spezifiziertes Verhalten — das ist der Grund, warum der Drift überlebt hat.

**D3 — Allowlist ohne Konsument.** `commitlint.config.cjs` führt 95 Scopes, davon 37
synthetische Codes (`cq0X`, `sec0X`, `dora0X`, `size0X`, `test0X`, `doc0X`, `fe0X`, `k8s0X`,
`spec0X`, `ci0X`, `cd0X`, `dep0X`, `img0X`) mit je 0–1 Vorkommen in der gesamten Historie.
Ausgewertet wird der Scope nirgends: `release-please-config.json` gruppiert das CHANGELOG
ausschließlich nach `type`, `scripts/vda/release-notes.sh:71` verwirft die Scope-Capture,
DORA/CFR zählen `fix()`-Raten. Die einzige Pipeline, die Scopes je gelesen hätte, war die
Tracking-Pipeline — entfernt in PR #788/#993.

## Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Optimierungsziel | **Agent-Trefferquote** | Ein Gate ohne Verbraucher rechtfertigt sich nur dadurch, dass es Reibung senkt statt erzeugt. Erfolgsmaß: weniger `unknown scope`-Abbrüche. |
| Schnitt-Anker | **Agent-Domänen + Querschnitt** | Die sechs Domänen der Routing-Tabelle in `CLAUDE.md` sind eine bestehende SSOT. Ein Agent trägt seinen eigenen Namen, ohne nachzuschlagen. |
| Zielzahl | **14** (Richtwert war ~15) | Datengetrieben gegengeprüft: die Schwelle „≥50 Commits/90 Tage" ergibt unabhängig exakt 15 Scopes. Die Schwelle allein taugt aber nicht als Schnitt — sie nähme `tracking`(315) mit und verlöre `db`(34), `security`(20), `ops`(15). |
| Cutover | **Alias-Mapping im Guard** | Nutzt die vorhandene `suggest_scope`-Infrastruktur aus T002240. Harte Wirkung, weiche Diagnose. |
| Historie | **Nicht umschreiben** | Der Guard prüft nur `origin/main..HEAD`. 1668 Alt-Commits umzuschreiben stünde in keinem Verhältnis. |

## Ziel-Vokabular (14 Scopes)

**Domänen — deckungsgleich mit `.claude/agents/bachelorprojekt-*`:**

| Scope | Deckt ab |
|---|---|
| `website` | Astro/Svelte, alle Frontends und ihre API-Routen |
| `infra` | Kustomize-Overlays, Cluster-Manifeste, Flux, Environments |
| `db` | Schema, Migrationen, Queries, Backup/Restore |
| `security` | SealedSecrets, OIDC, Pocket ID, DSGVO |
| `ops` | Laufender Clusterbetrieb, LLM-Pipeline, GPU-Host |
| `test` | Alle Testebenen (BATS, Playwright, Systemtest) |

**Querschnitt — was keiner Domäne gehört:**

| Scope | Deckt ab |
|---|---|
| `plans` | OpenSpec-Changes, Specs, Pläne, Brainstorming |
| `factory` | Software-Factory, Autopilot, dev-flow, Tickets |
| `agents` | Skills, Agent-Definitionen, Agent-Guide, opencode |
| `ci` | GitHub-Workflows, Quality-Gates, Health-Goals |
| `scripts` | `scripts/` ohne eigene Domäne |
| `docs` | `docs/` und Dokumentations-Pipeline |
| `mcp` | MCP-Server und -Registry |
| `deps` | Dependency-Bumps — **unantastbar**, Renovate-PRs hängen daran |

Die dynamischen Muster bleiben unverändert gültig: Ticket-Scopes `T\d{6}` und
Health-Goal-Scopes `G-[A-Z][A-Z0-9]+`.

## Alias-Mechanik

Zwei getrennte Klassen, weil sie unterschiedliche Auskunft geben müssen:

**`SCOPE_ALIASES` — alt → neu.** Der Scope ist umbenannt oder in einen größeren aufgegangen.
Die Meldung nennt das Ziel:

```
✗ unknown scope 'admin': feat(admin): add dashboard
  ↳ 'admin' wurde zu 'website' konsolidiert (T002328)
```

**`SCOPE_RETIRED` — alt → Begründung.** Das benannte System existiert nicht mehr; es gibt
keinen ehrlichen Nachfolger. Ein Alias wäre hier eine Falschauskunft:

```
✗ unknown scope 'tracking': feat(tracking): add import
  ↳ 'tracking' ist entfallen — die Tracking-Pipeline wurde in PR #788/#993 entfernt
```

Retired: `tracking` (PR #788/#993), `livekit` (T002184). Nicht retired, sondern gemappt:
`keycloak` → `security` (abgelöst durch Pocket ID, gleiche Domäne), `argocd` → `infra`
(abgelöst durch Flux, gleiche Domäne).

Die Alias-Map deckt alle Scopes mit ≥3 Commits in 90 Tagen ab. Für alles darunter greift
weiterhin die bestehende `suggest_scope`-Heuristik.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `commitlint.config.cjs` | `NAMED_SCOPES` auf 14 reduzieren; `SCOPE_ALIASES` und `SCOPE_RETIRED` exportieren; `scope-allowed`-Regel gibt die Alias-Meldung aus |
| `scripts/validate-commit-msg.sh` | Alias-/Retired-Lookup **vor** `suggest_scope`; Maps über denselben `node -e`-Pfad laden wie `namedScopes` |
| `scripts/preflight-pr-scope.sh` | awk-Parser auf `ci.yml` ersatzlos entfernen; `validate-commit-msg.sh scopes` als einzige Quelle; Meldung in Zeile 120 auf die echte Quelle korrigieren |
| `scripts/register-scope.sh` | Alias-/Retired-Namen ablehnen statt sie wieder einzufügen — sonst baut das Skript die Konsolidierung Eintrag für Eintrag zurück |
| `openspec/specs/ci-cd.md` (Delta) | Requirement `Preflight-PR-Scope-Validierung` auf `commitlint.config.cjs` umschreiben; Requirement für die Alias-Diagnose ergänzen |
| `tests/spec/ci-cd.bats` | Neue Tests: Alias-Meldung, Retired-Meldung, Allowlist-Größe, `preflight` ohne ci.yml-Abhängigkeit |
| `tests/spec/t001356-git02-conventional-commit.bats` | Vier Tests umschreiben, deren Vorbedingung sich umkehrt (siehe unten) |

## Kollision mit bestehenden Tests

`tests/spec/t001356-git02-conventional-commit.bats` kodiert die alte Welt in den Testnamen
selbst. Vier Tests kehren sich um und müssen mitwandern — sie stillschweigend grün zu halten
hieße, gegen ein veraltetes Design zu testen:

| Test | Warum er bricht |
|---|---|
| `T002115: 'skills' ist ein registrierter Scope` | `skills` wird Alias auf `agents` |
| `T002115: commit-msg-Hook laesst chore(skills) durch` | dito — der Hook lehnt künftig ab |
| `T002240: unknown scope 'agents' suggests the nearest valid scope` | `agents` wird gültiger Scope, ist also kein Beispiel für einen unbekannten mehr |
| `T002240: the suggestion is a scope that actually validates` | prüft die Heuristik am Beispiel `agents` |

Ersatz: dieselben Eigenschaften an einem Scope prüfen, der auch nach dem Schnitt unbekannt
bleibt (z. B. `websitex` für die Prefix-Heuristik). Die T002115-Tests werden zu
Alias-Tests umgeschrieben — die Absicht dahinter (der Hook lässt einen registrierten Scope
durch und lehnt einen unbekannten ab) bleibt erhalten, nur das Beispiel wechselt.

Dazu kommt eine dritte Datei: `tests/unit/preflight-pr-scope.bats:71` prüft
`preflight: missing workflow file exits 2`. Dieser Exit-Code existiert nur, weil das Skript
einen ci.yml-Pfad als zweites Argument entgegennimmt. Fällt der Parameter, fällt der
Exit-Code — Test und das zugehörige Scenario in `ci-cd.md` werden ersatzlos gestrichen. Der
Parameter wird **nicht** als ignorierter Rest-Parameter beibehalten: eine Signatur, die
etwas annimmt und wegwirft, ist genau die Sorte Halbwahrheit, aus der D1 entstanden ist.

## Risiken

**Rebase-Bruch bei laufenden Branches.** Der pre-push-Hook validiert `origin/main..HEAD`.
Ein Branch, der bereits `chore(skills): …` committed hat, gilt nach einem Rebase auf das
neue `main` mit allen Commits als „neu" und wird abgelehnt. Betroffen ist aktuell genau ein
Branch (`feature/mcp-registry-ssot-T002300`, Scopes `agent-guide` und `quality`); alle
übrigen offenen Branches nutzen ausschließlich Scopes, die erhalten bleiben. Ausweg:
`git commit --amend` bzw. der bestehende `SKIP_COMMIT_MSG_LINT=1`-Bypass. Die Alias-Meldung
nennt den Zielnamen, damit das ein Handgriff bleibt statt einer Recherche.

**Zu grober Schnitt.** `website` schluckt zehn bisherige Scopes und wird der mit Abstand
häufigste. Das ist die bewusste Konsequenz aus dem Optimierungsziel „Trefferquote" — die
Historie verliert dort Trennschärfe. Reversibel: ein Scope lässt sich jederzeit über
`register-scope.sh` nachziehen, wenn sich ein Teilbereich als eigenständig erweist.

**Alias-Map veraltet.** Sie ist eine Momentaufnahme der Historie und wächst nicht mit. Das
ist akzeptiert: ihr Zweck ist der Übergang, nicht Dauerbetrieb. Nach einigen Monaten kann
sie ersatzlos entfallen, ohne dass Verhalten verlorengeht.

## Nicht im Scope

- Umschreiben der Git-Historie
- Das Ticket-`type`-Enum (Teil B, T002329)
- `createTicket()`-Konsolidierung (Teil C, T002330)
- Schema-Diät (Teil D, T002331)
- Änderungen an `deps` oder der Renovate-Konfiguration
