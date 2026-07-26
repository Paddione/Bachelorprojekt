---
title: "spec-test-rot — Implementation Plan"
ticket_id: T002181
domains: [testing, ci, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# spec-test-rot — Implementation Plan

_Ticket: T002181_

## File Structure

```
tests/spec/dev-flow.bats                 geändert   M1/T001268/T001331/T001269/T001386 auf neue SSOT umbiegen
tests/spec/agent-library.bats            geändert   T001978-Delegation, nach Ursachenprüfung
tests/spec/workspace-deploy.bats         geändert   T002083-Flux auf brand-spezifische Namen, verschärft
tests/spec/react-login-edit-homepage.bats geändert  case-insensitives Grep + Pfadkorrektur callback.ts
tests/spec/pocket-id-migration.bats      geändert   Bearer → X-API-KEY, Testname mitziehen
tests/spec/admin-cockpit.bats            geändert   Design-Token- und a11y-Assertions, nach Ursachenprüfung
environments/schema.yaml                 geändert   fünf tote LLM-Variablen entfernen
website/src/pages/api/auth/callback.ts   geändert   Kommentar Keycloak → Pocket ID
```

Die genaue Dateizuordnung der Skill- und AGENTS-Assertions wird in Task 1 ermittelt; die Liste
oben nennt die nach Stichprobe erwarteten Ziele.

## Task 1 — Bestandsaufnahme: die 44 Tests ihren Dateien und Ursachen zuordnen

Ausgangspunkt ist der vollständige rote Lauf. Für jeden Fehlschlag wird notiert, in welcher
`tests/spec/`-Datei er steht und welcher der drei Ursachen aus `design.md` er zuzuordnen ist.

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/*.bats 2>&1 | grep '^not ok' > /tmp/spec-red.txt
wc -l /tmp/spec-red.txt
# expected: FAIL — 48 Zeilen, davon 4 in T002180 behandelt, 44 in diesem Change
```

Die Zuordnung entsteht als Tabelle in der PR-Beschreibung mit den Spalten Test, Datei, Ursache,
Behandlung. Sie ist das Arbeitsdokument für die Tasks 2 bis 7 und zugleich der Nachweis, dass
keine Position stillschweigend durchgerutscht ist.

**Akzeptanz:** 44 Positionen zugeordnet; jede trägt genau eine der drei Ursachen; keine Position
ohne Behandlungsentscheid.

## Task 2 — Skill- und AGENTS-Assertions auf die neue SSOT umbiegen

Stichprobe aus der Planungsphase, belegt: die neun `M1:`-Tests suchen F1-Keys und Verify-Kommandos
in `dev-flow-plan/SKILL.md`. Dort stehen sie nicht mehr, weil sie nach
`.claude/skills/references/plan-quality-gates.md` ausgelagert wurden.

```
Suchbegriff          SKILL.md   plan-quality-gates.md
'title'                 0                1
domains                 0                3
ticket_id               1                1
task test:changed       1                2
```

Die Anforderung gilt unverändert. Für jeden Test dieser Gruppe wird geprüft, wo der Inhalt heute
lebt, und die Assertion dorthin umgebogen. Betroffen sind ausser den neun `M1:`-Tests:
`T001268-M3` (zwei Stück), `T001331`, `T001269`, `T001386`, `T001265` (zwei Stück), `HWS-8`,
`T001672`.

Wo eine Anforderung tatsächlich aufgegeben wurde, wird der Test gestrichen — mit der aufhebenden
Entscheidung im Commit-Text. Ein Anpassen des erwarteten Wortlauts an den Ist-Text ohne diese
Prüfung ist ausgeschlossen.

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow.bats
```

**Akzeptanz:** jede Assertion dieser Gruppe zeigt auf die Datei, in der die Anforderung heute
lebt; gestrichene Tests tragen eine Begründung; kein Zurückkopieren von Inhalten ins SKILL.md, das
das SSOT-Refactoring rückgängig machen würde.

## Task 3 — Tote LLM-Variablen aus dem Schema entfernen

Diese fünf Tests sind Negativ-Assertions — rot bedeutet, die Variable existiert noch. Verifiziert:
alle fünf stehen weiterhin in `environments/schema.yaml`.

```
LLM_LMSTUDIO_URL · LLM_CHAT_MODEL · LLM_CODING_MODEL · LLM_EMBED_MODEL_NOMIC · llm-gateway-lmstudio
```

Der Gateway-Umbau hat sie funktional abgelöst, aber nicht aus dem Schema entfernt. **Die
Assertions bleiben unverändert; die Variablen werden entfernt.** Vor dem Löschen wird geprüft, ob
eine der fünf noch irgendwo gelesen wird:

```bash
for v in LLM_LMSTUDIO_URL LLM_CHAT_MODEL LLM_CODING_MODEL LLM_EMBED_MODEL_NOMIC; do
  printf '%-24s %s\n' "$v" "$(grep -rl "$v" --exclude-dir=node_modules --exclude-dir=.git . | tr '\n' ' ')"
done
```

Findet sich ein lesender Zugriff ausserhalb von Schema und Tests, wird er zuerst umgestellt — sonst
bricht das Entfernen die Konfiguration still.

Der sechste Test dieser Gruppe (`scripts/llm/start-embed-server.ps1 exists and contains --pooling cls`)
ist eine Positiv-Assertion und getrennt zu prüfen: existiert die Datei, fehlt nur das Flag, oder
wurde das Skript im Zuge von T002110 ersetzt.

```bash
task env:validate ENV=mentolder
task env:validate ENV=korczewski
```

**Kollisionshinweis:** T002171 fügt `POCKET_ID_API_KEY` in dieselbe Datei ein. Beide Changes dürfen
nicht gleichzeitig offen sein.

**Akzeptanz:** alle fünf Negativ-Assertions grün ohne Änderung an den Tests; `env:validate` für
beide Brands grün; kein lesender Zugriff auf eine entfernte Variable verblieben.

## Task 4 — T002083-Flux-Assertions an die reale Struktur anpassen und verschärfen

Der Cluster-Zustand ist korrekt und besser strukturiert als vom Test angenommen:

```
erwartet:    flux-sealed-secrets, flux-platform
tatsächlich: flux-sealed-secrets-mentolder  (prune: false)
             flux-sealed-secrets-korczewski (prune: false)
             flux-infra-controllers, flux-mentolder, flux-korczewski, flux-dev,
             flux-website-mentolder, flux-website-korczewski
```

Die Kustomizations wurden brand-spezifisch aufgeteilt. Die inhaltliche Anforderung — Sealed
Secrets werden nie auto-gepruned — ist bei beiden erfüllt.

Der `OCIRepository`-Test greift zusätzlich daneben, weil er `kind: OCIRepository` in derselben
Datei erwartet wie die `FluxInstance`; real liegen sie in `flux-instance.yaml` und
`oci-source.yaml`.

Die Anpassung wird genutzt, um die Assertion **strenger** zu machen statt sie nur passend: geprüft
wird, dass **jede** Kustomization mit Namenspräfix `flux-sealed-secrets` `prune: false` trägt — nicht
nur eine. Damit fängt der Test auch einen künftig hinzukommenden dritten Brand ab.

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats -f 'T002083'
```

**Akzeptanz:** alle drei Tests grün; die Prune-Assertion deckt beide Brands ab; der
OCIRepository-Test sucht über das Verzeichnis statt in einer einzelnen Datei.

## Task 5 — Die fünf aus T002180 verschobenen Positionen korrigieren

Alle fünf sind verifizierte Testfehler bei korrektem Code.

| Test | Korrektur |
|---|---|
| `cors.ts is fail-closed for unknown origins` | `grep -qF` → `grep -qiF`; `cors.ts:2` schreibt „Fail-closed" gross |
| `callback.ts accepts absolute React URL in returnTo` | Pfad → `website/src/pages/api/auth/callback.ts` |
| `callback.ts has Allowlist check for absolute URLs` | derselbe Pfad |
| `callback.ts returns to state parameter` | derselbe Pfad |
| `pocket-id: identity.ts … with Bearer POCKET_ID_API_KEY` | Assertion → `X-API-KEY`, Testname mitziehen |

Beim Pfad-Fix wird geprüft, ob weitere `$WEBSITE_SRC/api/`-Pfade in
`tests/spec/react-login-edit-homepage.bats` ins Leere greifen — ein Test gegen eine nicht
existierende Datei ist immer rot und hat nie etwas geprüft.

Die `cors.ts`-Assertion grept auf einen **Kommentartext** und bliebe auch grün, wenn jemand die
Implementierung auf fail-open umbaut und das Wort stehen lässt. Sie wird deshalb zusätzlich auf
eine strukturelle Prüfung umgestellt: dass `corsHeaders()` ohne Allowlist-Treffer weder
`Access-Control-Allow-Origin` noch `Access-Control-Allow-Credentials` setzt.

Im selben Zug der Nebenbefund: `website/src/pages/api/auth/callback.ts:55` trägt den Kommentar
„Keycloak redirects here after successful login" — auf Pocket ID korrigieren.

<!-- vitest: kein neuer Test nötig, weil die einzige Änderung an website/src ein Kommentartext ist;
     das Verhalten von callback.ts bleibt unberührt und ist bereits durch
     website/src/pages/api/auth/callback.test.ts abgedeckt -->

Die bestehende Vitest-Suite `website/src/pages/api/auth/callback.test.ts` wird mitgelaufen, um zu
belegen, dass die Kommentaränderung das Verhalten nicht berührt:

```bash
cd website && pnpm vitest run src/pages/api/auth/callback.test.ts && cd ..
```

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/react-login-edit-homepage.bats tests/spec/pocket-id-migration.bats
```

**Akzeptanz:** alle fünf grün; kein Produktionscode ausser dem Kommentar geändert; die
`cors.ts`-Assertion prüft Struktur statt Kommentarwortlaut.

## Task 6 — T001978-Delegation und Admin-Design-Tokens: Ursache zuerst bestimmen

Für diese beiden Gruppen steht die Ursachenzuordnung aus. Sie wird **vor** jeder Änderung am Code
oder am Test bestimmt — die Abkürzung über den Testnamen hat in T002180 zu neun Fehleinordnungen
geführt.

**T001978 Delegation-Fallback** (fünf Tests): `DelegationRecord`-Felder `fallbackFor` und
`fallbackTriggered`, Propagierung durch `DelegateInput`/`registerDelegation`,
`finalizeDelegation`-Dispatch auf `qwen35-hq`, Fehlermarkierung `empty_output_after_fallback`,
Registrierung von `qwen35-hq` in `.opencode/agent-models.jsonc`. Der letzte ist als Kontrolltest
gedacht — schlägt er ebenfalls fehl, fehlt die Funktion, nicht der Test.

**Admin-Design-Tokens** (acht Tests): `factory-tokens.css`, zweiter `:root`-Block, sechzehn
semantische Tokens, `--color-danger` im `@theme`, `AdminModal` als natives `<dialog>` mit
`data-testid`, `aria-labelledby`, bindbares `open`-Prop, `AdminSidebarNav`-Collapse.

Die drei a11y-Assertions (`<dialog>`, `aria-labelledby`, bindbares `open`) sind inhaltlich
werthaltig. Erweist sich eine davon als unerfüllt, ist das Ergebnis ein Code-Fix, kein Test-Fix —
ein Modal ohne `aria-labelledby` ist für Screenreader-Nutzer ein echter Mangel.

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/agent-library.bats tests/spec/admin-cockpit.bats
```

**Akzeptanz:** für jede der dreizehn Positionen ist die Ursache am Code belegt und im PR notiert;
a11y-Anforderungen wurden nicht durch Testanpassung wegdefiniert.

## Task 7 — Final Verification

Zuerst der inhaltliche Nachweis. Die reine Grün-Zahl reicht bei diesem Change nicht — sie liesse
sich durch Löschen der Testdateien erreichen:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/*.bats 2>&1 | grep -c '^not ok'
# erwartet: 4 (die in T002180 behandelten) oder 0, falls T002180 bereits gemergt ist

git diff --stat main -- tests/spec/
# jede geänderte Datei muss in der PR-Tabelle mit Ursache und Begründung auftauchen
```

Zusätzlich der Gegenlauf: keine Assertion darf ersatzlos verschwunden sein, ohne dass der Commit
die aufhebende Entscheidung nennt.

```bash
git diff main -- tests/spec/ | grep '^-@test' | wc -l
# jede gestrichene @test-Zeile braucht eine Begründung im Commit-Text
```

Dann die drei verpflichtenden Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

**Akzeptanz:** höchstens die vier T002180-Positionen noch rot; jede geänderte Assertion in der
PR-Tabelle mit Ursache und Behandlung; jede gestrichene `@test`-Zeile begründet; die drei
Gate-Kommandos grün; `environments/schema.yaml` kollisionsfrei gegen T002171.
