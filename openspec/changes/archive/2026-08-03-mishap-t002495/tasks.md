---
title: "mishap-t002495 — Implementation Plan"
ticket_id: T002495
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002495 — Implementation Plan

_Ticket: T002495_

Mishap-Bundle: tooling/git, repo/hygiene, skills/mishap-tracker, tooling/git-crypt, skills/incident-response, scripts/llm, skills/references, infra/wireguard, tooling/gate-messung (10 Einträge)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
.claude/skills/incident-response/SKILL.md       — M6: baseline remote clients
.claude/skills/mishap-tracker/SKILL.md          — M4: incident vs rollup-container
.claude/skills/references/plan-quality-gates.md — M10: positive anchor required
.claude/skills/references/repo-hygiene-ops.md   — M1+M2: timezone-safe + merge-base diff
.claude/skills/references/verification-block.md — M8: log-freshness rule
CLAUDE.md                                       — M7: PowerShell ASCII-only
docs/superpowers/references/gotchas-footguns.md — M5+M9: git-crypt smudge + WireGuard Windows
scripts/worktree-create.sh                      — M3: main-checkout guard
```

## Mishap-Eintraege

### Mishap 1: Zeitzonen-Falle: gh mergedAt liefert UTC, git %cI lokale Zeit — naiver Vergleich meldet falsche Nach-Merge-Commits
**Typ:** drift | **Komponente:** tooling/git

BEOBACHTUNG (2026-08-01, repo-hygiene §2 beim Squash-Merge-Nachweis):
Um zu pruefen, ob ein gemergter Branch nach dem Merge noch Commits bekam, wurden verglichen:
  ma=$(gh pr list --head "$b" --state merged --json mergedAt -q '.[0].mergedAt')  # 2026-07-28T03:53:20Z
  ct=$(git log -1 --format='%cI' "$b")                                            # 2026-07-28T05:51:45+02:00

Der Augenschein legt nahe, der Commit sei fast 2 Stunden NACH dem Merge entstanden. Tatsaechlich
ist 05:51:45+02:00 == 03:51:45Z und damit 95 Sekunden VOR dem Merge. `gh` liefert durchgaengig
UTC mit Z-Suffix, `git --format=%cI` die lokale Zeit der Commit-Erzeugung mit Offset.

FOLGE, wenn unbemerkt:
Ein Cleanup-Guard "loesche nur, wenn keine Commits nach dem Merge" stuft jeden korrekt
gemergten Branch faelschlich als "hat Nachzuegler" ein und loescht nie — oder, bei umgekehrtem
Offset, uebersieht echte Nachzuegler und loescht Arbeit.

KORREKT:
  git log -1 --format='%cI' --date=iso-strict-local   # mit TZ=UTC
oder direkt in UTC vergleichen:
  ct=$(TZ=UTC git log -1 --format='%cd' --date=format-local:'%Y-%m-%dT%H:%M:%SZ' "$b")
`git log --since="$ma"` interpretiert den uebergebenen Z-Zeitstempel zwar korrekt, gab in
diesem Lauf aber trotzdem irrefuehrende Zaehlungen, weil Merge-Commits mit abweichender
Committer-Zeit mitzaehlten — der Zaehler allein ist kein Beweis, die Commits muessen angesehen
werden.

---

### Mishap 2: Three-dot-Diff origin/main...branch taugt nicht als Nachweis unmergter Arbeit
**Typ:** drift | **Komponente:** tooling/git

BEOBACHTUNG (2026-08-01, repo-hygiene §2):
Fuer feature/plan-partials-embedding-T002453 (PR #3534, nachweislich gemergt) meldete
  git diff origin/main...feature/plan-partials-embedding-T002453 --stat
  -> 18 files changed, 937 insertions(+)
also scheinbar erhebliche unmergte Arbeit. Gegenprobe:
  git merge-base --is-ancestor e1bf759c0 origin/main   -> JA (der Squash-Commit IST in main)
  git diff origin/main..<branch> -- scripts/openspec-embed.mjs  -> LEER
  git ls-tree origin/main tests/spec/plan-partials-embedding/  -> alle 4 Dateien vorhanden

URSACHE: Three-dot vergleicht merge-base..branch, nicht main..branch. Nach einem Squash-Merge
wandert die merge-base NICHT mit — sie bleibt der Abzweigpunkt. Der Three-dot-Diff zeigt daher
immer den vollstaendigen Branch-Diff, egal ob der Inhalt laengst in main ist.
Der Two-dot-Diff (`origin/main..branch`, identisch zu `git diff origin/main branch`) ist
ebenfalls untauglich, aber aus dem umgekehrten Grund: er zeigt zusaetzlich alles, was main seit
dem Abzweig VORAUS hat. In diesem Lauf meldete er fuer einen laengst gemergten Branch
666 abweichende Dateien.

BELASTBARER TEST (in diesem Lauf verwendet und verifiziert):
  mb=$(git merge-base origin/main "$b")
  for f in $(git diff --name-only "$mb" "$b"); do          # nur BRANCH-EIGENE Dateien
    [ "$(git rev-parse "$b:$f")" = "$(git rev-parse "origin/main:$f")" ] || echo "ABWEICHEND: $f"
  done
Damit blieben pro Branch 0-6 Abweichungen uebrig, praktisch ausschliesslich generierte
Artefakte (docs/code-quality/repo-index.json, website/src/data/openspec-status.json,
test-inventory.json), die nach dem Merge weiterdrifteten. Die verbleibenden echten Quelldateien
mussten einzeln angesehen werden — und zeigten durchweg, dass MAIN die NEUERE Fassung hat, der
Branch also schlicht veraltet ist.

MERKSATZ: Die Diff-Richtung allein beantwortet nie die Frage "ist das schon gemergt". Sie
beantwortet "unterscheiden sich diese beiden Staende" — was nach jedem Squash-Merge trivial
mit JA beantwortet wird.

---

### Mishap 3: Hauptcheckout stand erneut auf Feature-Branch mit unveroeffentlichtem WIP
**Typ:** degraded | **Komponente:** repo/hygiene

BEOBACHTUNG (2026-08-01):
Der Hauptcheckout ~/Bachelorprojekt stand auf feature/wire-cockpit-kit-T002458 statt main:
- 1 Commit (364742268, Lavish-Kit-Wiring) ohne konfigurierten Upstream
- 8 modifizierte Dateien (CLAUDE.md, .claude/agents/*, .claude/lib/goals.md,
  mcp-tool-guide.md, .gitignore, openspec/changes/task-context-channel/intel.json)
- 1 staged Delete eines 12-MB-Binaries (scripts/ticket-mcp/go/ticket-mcp) mit passender
  .gitignore-Ergaenzung — offensichtlich eine bewusste Aufraeumung

Der Commit lag bereits auf origin (der `git push -u` meldete "Everything up-to-date"), nur das
lokale Tracking fehlte — der Branch sah dadurch unveroeffentlicht aus, obwohl er es nicht war.
Das ist eine eigene Falle: `git branch -vv` zeigt ohne Upstream keinen Hinweis darauf, dass
der Branch remote existiert.

WARUM DAS ZAEHLT:
CLAUDE.local.md dokumentiert diesen Zustand bereits als bekanntes Risiko — die Software Factory
dispatched aus diesem Verzeichnis, und ein Hauptcheckout abseits von main misst lokale
Queue-Abfragen gegen den falschen Branch. Der Zustand ist trotz Dokumentation erneut
eingetreten. scripts/worktree-create.sh WARNT in diesem Fall nur ("WARNUNG — Quell-Checkout
steht auf Branch '…'") und legt den Worktree trotzdem an; die Warnung erscheint zudem nur beim
Anlegen, nicht bei spaeterer Nutzung.

BEHOBEN in diesem Lauf (nach Ruecksprache):
Branch-Ref + origin gesichert, dirty Aenderungen als benannter Stash (stash@{0}, zusaetzlich
als refs/hygiene-archive/2026-08-01-hauptcheckout-wip archiviert), Patch- und Dateikopien unter
tmp/claude-scratch/hauptcheckout-wip-2026-08-01/, dann `git checkout main && git pull`.

OFFEN: Ob ein harter Guard sinnvoll ist — etwa ein pre-commit/pre-push-Hook oder ein
Factory-Preflight, der den Dispatch verweigert, solange der Hauptcheckout nicht auf main steht.
Heute faellt der Zustand nur auf, wenn jemand hinsieht.

---

### Mishap 4: mishap-tracker: broken-Mishaps landen im Buffer statt sofort als Incident-Ticket (Doku-Drift)
**Typ:** degraded | **Komponente:** skills/mishap-tracker

BEOBACHTUNG (2026-08-01, waehrend dieses mishap-tracker-Laufs selbst):
.claude/skills/mishap-tracker/SKILL.md Step 1 spezifiziert:

  | broken   | major    | hoch | needs_human | Alias fuer `incident` — sofort Ticket |
  | security | critical | hoch | needs_human | Alias fuer `incident` — sofort Ticket |

und Step 2 nennt als erwartete Rueckmeldung "Incident-Ticket angelegt: T000xxx" fuer diesen Pfad.

Tatsaechlich lieferten ZWEI nacheinander gemeldete `type: "broken"`-Mishaps
(Git-Objektkorruption im Hauptcheckout; fleet-gpu-Runner mit 0 registrierten Runnern) beide:
  "Mishap gespeichert (7/10). Noch 3 bis zum automatischen Bundle-Ticket."
  "Mishap gespeichert (8/10). Noch 2 bis zum automatischen Bundle-Ticket."

Sie wurden also gebuffert wie `degraded`/`suspicious`/`drift` und landeten schliesslich im
Sammelticket T002492 mit attention_mode=ai_ready — statt als eigenstaendiges Incident-Ticket
mit needs_human.

ZWEITE ABWEICHUNG im selben Lauf:
Step 3 der SKILL.md beschreibt ausschliesslich den Rollup-Container-Pfad ("Rollup-Container-Append:
N Mishaps an den Container angehaengt") und erklaert unter Verweis auf T002383 ausdruecklich,
warum der frueher erzwungene Bundle-Flush entfernt wurde. Die Implementierung meldete stattdessen
"Bundle-Ticket angelegt: T002492 / Buffer geleert" — also das alte, laut Doku abgeschaffte
Bundle-Verhalten. Auch die Tool-Beschreibung von report_mishap selbst sagt "Bei >=10 Eintraegen
wird automatisch ein gebuendeltes Ticket ... angelegt" und widerspricht damit der SKILL.md.

FOLGE:
Ein echter Ausfall (hier: git-Repository-Korruption, sowie ein CI-Runner, der seit Stunden
keinen Job mehr annimmt) erhaelt weder needs_human noch ein eigenes Ticket, sondern verschwindet
in einem ai_ready-Sammelticket zwischen Tooling-Notizen. Genau die Dringlichkeitsunterscheidung,
die Step 1 vorsieht, findet nicht statt.

ZU KLAEREN: Welche Seite ist die gewollte — der Go-Adapter (ticket-mcp) oder die SKILL.md?
Danach die jeweils andere angleichen. Betroffen sind mindestens Step 1, Step 2 und Step 3 der
SKILL.md sowie die Tool-Beschreibung von report_mishap.

---

### Mishap 5: git worktree add scheitert an git-crypt smudge, legt den Worktree aber trotzdem an
**Typ:** drift | **Komponente:** tooling/git-crypt

BEOBACHTUNG (2026-08-01, beim Anlegen eines Pruef-Worktrees):
  git worktree add --detach <pfad> origin/main -q
gab aus:
  error: external filter '/usr/bin/git-crypt smudge' failed 1
  error: external filter '/usr/bin/git-crypt smudge' failed
Der Worktree wurde dennoch angelegt, HEAD stand korrekt auf origin/main, und die darin
ausgefuehrte BATS-Suite lief fehlerfrei.

URSACHE: Der neue Worktree erbt den git-crypt-Filter, aber nicht den entsperrten Schluessel-
zustand; die verschluesselten Dateien (environments/.secrets/*) koennen nicht ge-smudged werden.
Fuer Tests, die diese Dateien nicht anfassen, ist das folgenlos.

WARUM ES TROTZDEM GEMELDET WIRD:
Die Ausgabe sieht nach einem fehlgeschlagenen Kommando aus. Ein Skript, das auf stderr oder auf
`set -e` reagiert, bricht hier ab, obwohl der Worktree brauchbar ist — oder ein Mensch haelt den
Worktree faelschlich fuer unbenutzbar und legt ihn erneut an. Umgekehrt gilt: wer in einem so
angelegten Worktree mit den .secrets-Dateien arbeitet, hat dort UNBRAUCHBARE Inhalte, ohne dass
spaeter noch eine Warnung erscheint — die Fehlermeldung kommt nur einmal, beim Anlegen.

ERWARTUNG: Entweder git-crypt im neuen Worktree automatisch entsperren, oder die Meldung als
erwartete Warnung kennzeichnen, damit sie nicht wie ein Abbruch aussieht.
scripts/worktree-create.sh sollte pruefen, wie es sich hier verhaelt (in diesem Lauf wurde
`git worktree add` direkt aufgerufen, nicht ueber das Skript).

---

### Mishap 6: Netzpfad-Änderungen ohne Baseline der entfernten Clients
**Typ:** process | **Komponente:** skills/incident-response

Vor der Windows-Firewall-Härtung am GPU-Host (T002490) wurde der fleet-Cluster-Pfad nicht gemessen. Als die Probe danach 000 lieferte, ließ sich nicht mehr unterscheiden, ob die eigene Änderung die Ursache war. Entlastung gelang nur zufällig über einen Kontrollversuch: Port 8091 und ICMP lagen außerhalb der neuen Regel und waren ebenfalls tot. Das war Glück im Aufbau, nicht Methode. Vorschlag: incident-response und infra-ops um einen expliziten Baseline-Schritt ergänzen — vor jeder Änderung an einem Netzpfad die ENTFERNTEN Clients messen, nicht nur den lokalen Health-Endpunkt.

---

### Mishap 7: PowerShell-Skripte aus WSL: Em-Dash und BOM — BOM riss den Prod-Tunnel ab
**Typ:** process | **Komponente:** scripts/llm

Zwei Encoding-Fallen, beide am 2026-08-01 bei T002491 aufgelaufen. (1) Aus WSL nach /mnt/c geschriebene .ps1 sind UTF-8 ohne BOM, PowerShell 5.1 liest sie als CP1252. Ein Em-Dash wird dabei zu einem typografischen Anführungszeichen, das PS als String-Delimiter akzeptiert — steht es in einem String, kollabiert die Klammerstruktur und das Skript startet kommentarlos gar nicht (in Kommentaren folgenlos, daher liefen frühere Skripte). (2) `Set-Content -Encoding UTF8` schreibt unter PS 5.1 ein BOM; wireguard.exe /installtunnelservice legte deshalb keinen Dienst an, während /uninstalltunnelservice bereits gelaufen war — Folge war ein ~5-minütiger Totalausfall des GPU-Tunnels, der auch die zuvor funktionierenden gekko-Nodes traf. Wiederhergestellt über /installtunnelservice mit der gespeicherten .conf.dpapi.

Abgeleitete Regeln: .ps1 aus WSL rein ASCII schreiben; vor jedem Lauf mit [System.Management.Automation.Language.Parser]::ParseFile prüfen; für Konfigurationsdateien -Encoding ASCII statt UTF8; und ein Skript, das erst deinstalliert, MUSS nach dem Install verifizieren und bei Fehlschlag selbst zurückrollen. Kandidat für eine Konvention in CLAUDE.md, da scripts/llm/*.ps1 durchgehend Windows-seitig laufen.

---

### Mishap 8: Unverändertes Log als Beweis für einen Lauf missdeutet
**Typ:** process | **Komponente:** skills/references

Ein elevated PowerShell-Lauf (Start-Process -Verb RunAs) fand zweimal nicht statt; ich las jeweils dieselbe alte Transcript-Datei und schloss daraus, das Skript sei erneut gescheitert. Erst der Vergleich von Datei-Zeitstempel und aktueller Uhrzeit deckte auf, dass gar kein Lauf stattgefunden hatte. Kostete zwei volle Zyklen und führte zu einer Fehldiagnose gegenüber dem Nutzer.

Regel: vor einem elevated Lauf die Logdatei löschen — dann beweist ihre bloße Existenz den Lauf. Allgemeiner und deckungsgleich mit der Test-Resultats-Konvention (T002448-M4): ein Artefakt, dessen Aktualität nicht geprüft wurde, ist kein Ergebnis. Gilt für jedes Muster "Skript schreibt Log, Agent liest Log".

---

### Mishap 9: WireGuard unter Windows: wg set setzt keine Routen, .dpapi nicht sicherbar
**Typ:** process | **Komponente:** infra/wireguard

Zwei Windows-spezifische WireGuard-Eigenheiten, die bei T002491 je einen Arbeitszyklus gekostet haben.

(1) `wg set <iface> peer ...` ändert nur den Kryptozustand im Treiber, NICHT die Windows-Routingtabelle — die legt der Tunneldienst beim Start aus der Konfigurationsdatei an. Folge: der Handshake gelingt (er läuft über den bestehenden UDP-Socket) und sieht nach Erfolg aus, aber Antwortpakete an die neue Peer-Adresse finden kein Interface. Erst `Get-NetRoute` zeigte die fehlenden Einträge. Unter Linux erledigt wg-quick beides — die Erwartung "Peer gesetzt = fertig" ist auf Windows falsch.

(2) Ein Backup von Data\Configurations\<name>.conf.dpapi ist nicht möglich: WireGuard schützt das Verzeichnis per ACL auf SYSTEM, auch Administratoren dürfen nicht lesen. Ein als Abbruchbedingung geplanter Backup-Schritt musste auf eine Warnung heruntergestuft werden. Wichtig zu wissen: die .dpapi überlebt ein /uninstalltunnelservice und ist damit der Rettungsweg — `wireguard.exe /installtunnelservice <pfad zur .dpapi>` stellt den Tunnel wieder her.

Gehört in die Runbook-Referenz zur LLM-/GPU-Host-Pflege, da dort alle wg-gpu-Eingriffe stattfinden.

---

### Mishap 10: Selbstgebauter JSONC-Parser meldete Gate falsch-gruen (stderr verschluckt, wc -l zaehlte leeren stdin als 0)
**Typ:** suspicious | **Komponente:** tooling/gate-messung

BEOBACHTUNG (2026-08-01, T002493 Health-Goals-Chore):
Bei der Verifikation von Gate G-AGENTIC11 baute ich das Messkommando ad hoc nach:

  comm -3 <(... CLAUDE.md ...) <(python3 -c "import json,re;s=open('.opencode/opencode.jsonc').read();
    s=re.sub(r'//.*','',s); print(...)") | wc -l
  -> 0        (= scheinbar gruen)

Tatsaechlich war das Python-Programm mit
  json.decoder.JSONDecodeError: Invalid control character at: line 2 column 21
abgestuerzt. Ursache: `re.sub(r'//.*','')` entfernt nicht nur Kommentarzeilen, sondern
zerstoert JEDES `http://` innerhalb eines URL-Strings — der Rest der Zeile faellt weg und
das JSON wird unparsbar.

WARUM DAS FALSCH-GRUEN WURDE:
Der Traceback ging auf stderr und war in der Ausgabe sichtbar, aber `comm` bekam leeren
stdin, und `wc -l` meldete daraufhin `0` — exakt den Wert, den ein bestandenes Gate liefert.
Ohne Positiv-Anker ist "0 Abweichungen" nicht von "0 gemessene Elemente" zu unterscheiden.
Das ist dieselbe Klasse wie die dokumentierte Positiv-Anker-Pflicht bei Negativtests
[T002356-M1], hier aber bei einer Ad-hoc-Messung statt in einem BATS-Test.

KORREKT (aus scripts/health-goals-check.sh, Funktion mcp_servers, Zeile 95):
  s=re.sub(r'^\s*//.*$','',s,flags=re.M)   # nur GANZE Kommentarzeilen, multiline
  s=re.sub(r',(\s*[}\]])',r'\1',s)          # trailing commas

Die korrigierte Messung lieferte 13 claimed vs 13 actual, symmetrische Differenz 0 — also
zufaellig dasselbe Endergebnis, aber diesmal belegt. Der autoritative Lauf von
scripts/health-goals-check.sh bestaetigte es unabhaengig.

KONVENTION, die daraus folgt:
Gate-Werte NIE mit einem ad hoc nachgebauten Kommando pruefen, wenn das Repo ein
autoritatives Messskript hat (hier scripts/health-goals-check.sh). Ist ein Nachbau
unvermeidbar, immer einen Positiv-Anker mitmessen und ausgeben:
  echo "Anker: claimed=$(echo "$claimed"|grep -c .) actual=$(echo "$actual"|grep -c .)"
Beide Zahlen muessen > 0 sein, sonst ist das Ergebnis bedeutungslos.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten. Jeder nennt Komponente und
      vorgeschlagene Behebung. Eintraege, die sich bei der Recon als nicht zutreffend
      erweisen, werden im PR-Text begruendet verworfen statt stillschweigend uebergangen.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
