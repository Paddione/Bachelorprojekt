# Proposal: worktree-create-refactor-prefix

## Why

Beim Dispatch von T002627 (`type=refactor`) lehnte `scripts/worktree-create.sh` den Branch
`refactor/sdlc-routes-remove-T002627` ab. Der Operator wich auf `feature/` aus — geraten, nicht
hergeleitet.

**Symptom (beobachtet, reproduzierbar):** Der Branch-Namens-Guard in
`scripts/worktree-create.sh:102` prüft `^feature/|^fix/|^chore/|^docs/`. `refactor/` fällt durch,
Exit 1, kein Worktree.

**Hypothese im Ticket (geprüft, teilweise widerlegt):** Das Ticket vermutet, `refactor` „sollte ein
erlaubtes Branch-Präfix bekommen". Die Prüfung der Rezeptoren zeigt, dass das den Fehler nur
verschiebt:

| Ort | akzeptierte Präfixe | Wirkung bei `refactor/` |
|---|---|---|
| `scripts/worktree-create.sh:102` | feature, fix, chore, docs | Exit 1 (das gemeldete Symptom) |
| `.githooks/pre-commit:151` | feature, fix, chore, docs | jeder Commit abgelehnt |
| `scripts/factory/pipeline-partials.cjs:126` | feature, fix, chore | harter `BLOCK` des Factory-Laufs |
| `scripts/factory/dispatcher.js:139` | feature, fix, chore | Slug-Strip greift nicht → Slug bleibt `refactor/…` |
| `scripts/factory/dispatcher-bridge.sh:53` | feature, fix, chore | dito, kaputte Worktree-Pfade |
| `scripts/vda/factory-prep.sh:144` | feature, fix, chore | dito |
| `scripts/preflight-pr-scope.sh:79` | feature, fix | Worktree-Pflicht feuert gar nicht mehr |

Der Beweis, dass Verbreitern real bricht, liegt bereits im Repo: `docs/` steht in der
Vier-Präfix-Allowlist, aber **nicht** im Drei-Präfix-Hard-Guard der Factory. Ein `docs/`-Branch ist
heute anlegbar und committebar, aber nicht durch die Factory dispatchbar. Genau diese Klasse von
Halb-Aufnahme hat T002817 schon einmal produziert (`chore/mishap-incident-rollup`: anlegbar, nicht
committebar).

**Prior Art (Schritt 0.7):** `openspec/specs/divergence-guard.md:47–56` schreibt die vier Präfixe
als Requirement fest und benennt in einem Szenario ausdrücklich „the four allowed". Zeilen 108–111
verlangen einen Drift-Guard über die Präfix-Menge; `openspec/specs/software-factory.md:1295`
schreibt separat den `^(feature|fix|chore)/`-HARD-GUARD fest. Die Präfix-Menge ist also eine
bewusst schmal gehaltene, dreifach gespiegelte und testgesicherte Entscheidung — kein Versehen.

**Die eigentliche Ursache** ist ein Vokabular-Irrtum, nicht eine zu kurze Liste: Ticket-Typen
(`fix feat chore project docs refactor perf test ci build`, `scripts/vda/ticket/triage.sh:55`) und
Branch-Präfixe (vier) sind zwei verschiedene Alphabete. Eine 1:1-Abbildung war nie beabsichtigt.
Der Guard sagt korrekt „nein", aber er sagt nicht, **wohin** — obwohl er für `feat/` und für
kleingeschriebene Ticket-IDs bereits einen `Suggested:`-Mechanismus besitzt
(`scripts/worktree-create.sh:120–136`).

## What

**Gewählte Option: normalisieren statt verbreitern.** Die Präfix-Menge bleibt bei vier; der
`Suggested:`-Block des Guards wird um eine Ticket-Typ-→-Präfix-Abbildung erweitert, sodass ein
abgelehnter `refactor/`-Branch die konforme Alternative direkt nennt.

Abbildung (Sitz: `scripts/lib/branch-allowlist.sh`, die bestehende SSOT-Bibliothek für
branch-bezogene Regeln, die Hooks und `worktree-create.sh` bereits bedingt sourcen):

| Typ-Präfix am Branch | Vorschlag | Begründung |
|---|---|---|
| `refactor/`, `perf/`, `test/`, `ci/`, `build/` | `chore/` | Umbau ohne Verhaltensänderung — die Definition, mit der `dev-flow-chore` arbeitet |
| `feat/`, `project/` | `feature/` | bereits vorhandene `feat/`-Regel, verallgemeinert |
| `bug/` | `fix/` | Legacy-Ticket-Typ |

**Keine stille Umbenennung.** Der Guard bleibt bei Exit 1. Ein automatisches Umschreiben des
Branch-Namens würde den Aufrufer desynchronisieren: `pipeline.mjs`, die dev-flow-Skills und
`preflight-pr-scope.sh` verwenden denselben Namen später erneut für Commit, Push und PR-Titel; ein
im Helper gedrehter Name wäre dort unbekannt.

**Nicht geändert:** die Präfix-Menge selbst, `.githooks/pre-commit`, die Factory-Hard-Guards,
`openspec/specs/divergence-guard.md:47–56`, `openspec/specs/software-factory.md:1295`. Der
Drift-Guard über die Präfix-Mengen bleibt damit unberührt grün.

**Degradation:** Fehlt `scripts/lib/branch-allowlist.sh`, bleibt der Vorschlag aus und der Guard
verhält sich exakt wie heute — die Abbildung kann nie etwas durchlassen, was vorher blockiert war.

**Abgrenzung:** Dass `docs/` in der Allowlist, aber nicht im Factory-Hard-Guard steht, ist ein
eigenständiger Befund. Er wird hier dokumentiert, aber nicht behoben — ein eigenes Ticket.

_Ticket: T002811_
