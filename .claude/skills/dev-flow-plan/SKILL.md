---
name: dev-flow-plan
description: Use when beginning any repo change — feature, bug fix, or chore. Entry point for all development work in this repo. Routes to the correct path (feature/fix/chore) and produces a committed, pushed plan on the branch ready for dev-flow-execute. Chores complete inline without a separate execution step.
hooks:
  pre:
    - inject-plan-context
  post:
    - mishap-tracker
    - cleanup-tmp
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern,
> configuration drift, or **process friction** you notice — even if unrelated
> to the current task — add an entry with:
>   `type` (broken/degraded/suspicious/security/drift/**process**),
>   `title`, `description`, and `component`.
>
> `process` = a step that required a manual workaround, had wrong/missing instructions,
> or caused unexpected friction. `component` MUST use format `skills/<skill-name>`. Example:
>   `{type: process, title: "wss patch required manual retry",
>     description: "scripts/superpowers-helper-patch.sh failed silently — step 2b needs exit-code check",
>     component: "skills/dev-flow-plan"}`
>
> Invoke `mishap-tracker` at the very end.

# dev-flow-plan — Pfad-Wahl, Brainstorming & Plan

## Wann diese Skill greift

Bei jeder Anfrage in diesem Repo, die etwas verändern will: neue Funktion, Bug fixen, Doku updaten, Dependencies bumpen, was auch immer.

**Sage zu Beginn:**
```bash
# Unified Skill Framework: PRE-Execution
bash scripts/skill-orchestrator.sh .claude/skills/dev-flow-plan/SKILL.md pre "infra"
```
"Ich nutze dev-flow-plan für Pfad-Wahl und Planung."

---

## Schritt −3: Deep Grilling (optional — für größere Feature-Projekte)

Wenn die Anfrage komplex, unklar oder groß klingt (mehrere Subsysteme, unklarer Scope, cross-cutting concerns, mehr als ~3 Tage Arbeit), frage **direkt**:

> "Klingt nach einem größeren Vorhaben. Möchtest du eine strukturierte Grilling-Session (5–10 min) bevor wir zum Brainstorming kommen? Du bekommst danach eine Anforderungsliste, eine Asset-Wunschliste und ein Ticket als Planungsgrundlage."

**Falls der User 'Nein'** oder das Feature offensichtlich klein/klar ist: direkt zu Schritt −2 springen. Kein Blocker.

**Falls der User 'Ja'** oder selbst um eine Grilling-Session bittet:

### 1. Grilling-Runden (3–4 Runden à 2–3 Fragen)

Führe die Runden **sequenziell** durch — stelle eine Runde, warte auf Antworten, dann die nächste. Nicht alle Fragen auf einmal.

**Runde 1 — Kern & Ziel**
- Was ist das eigentliche Problem, das gelöst werden soll? (Nicht die Lösung — das Problem dahinter. Warum jetzt?)
- Wer sind die Hauptnutzer / Stakeholder, die das betrifft?
- Was ist der Auslöser für dieses Feature genau jetzt?

**Runde 2 — Scope & Grenzen**
- Was gehört definitiv NICHT in dieses Feature? (Explizit Out-of-scope benennen)
- Welche bestehenden Komponenten / Services werden tangiert oder müssen angepasst werden?
- Gibt es technische, regulatorische oder zeitliche Constraints?

**Runde 3 — Erfolg & Abnahme**
- Woran erkennst du, dass das Feature fertig und erfolgreich ist? (Konkrete, messbare Akzeptanzkriterien)
- Gibt es bekannte Edge-Cases oder Failure-Szenarien, die abgedeckt sein müssen?
- Welche nicht-funktionalen Anforderungen gelten? (Performance, Sicherheit, DSGVO, Mobile-Responsive)

**Runde 4 — Assets & Referenzen** (nur wenn nach Runde 3 noch Unklarheiten bestehen)
- Gibt es Mockups, bestehende Implementierungen, Konkurrenz-Screenshots, Paper oder sonstige Referenzen?
- Welche internen Dateien / Tickets / Gespräche haben den Kontext, den ich noch nicht kenne?
- Wer ist der richtige Ansprechpartner bei Unklarheiten während der Implementierung?

> **Grilling-Stil:** Frage präzise, nicht vage. Hake nach wenn Antworten ausweichen — nutze "Warum genau?" und "Was meinst du konkret mit X?" als Drill-down. Ziel: Keine wichtige Anforderung bleibt implizit.

### 2. Synthese — zwei Listen ableiten

Nach den Runden: synthetisiere in diesen beiden strukturierten Listen.

**Anforderungsliste:**
```
FUNKTIONALE ANFORDERUNGEN:
- [ ] <Anforderung 1>
- [ ] <Anforderung 2>
...

NICHT-FUNKTIONALE ANFORDERUNGEN:
- [ ] <NFR 1 — z.B. Mobile-Responsive ≥768px>
- [ ] <NFR 2 — z.B. DSGVO-konform, keine externen Calls>
...

EXPLIZIT OUT-OF-SCOPE:
- <Was nicht gebaut wird>
...

AKZEPTANZKRITERIEN:
- [ ] <Kriterium 1 — messbar/testbar>
- [ ] <Kriterium 2>
...
```

**Asset-Wunschliste:**
```
SOFORT VERFÜGBAR:
- <Datei/Link/Kontext der bereits vorliegt>

ZU BESCHAFFEN:
- [ ] <Asset 1 — z.B. Figma-Export von Designer X>
- [ ] <Asset 2 — z.B. API-Doku von Service Y>
- [ ] <Asset 3 — z.B. Screenshot bestehender Lösung>

OPTIONAL / NICE-TO-HAVE:
- <Asset das helfen würde, aber nicht blockiert>
```

Zeige beide Listen dem User und frage: **"Stimmt das so? Fehlt etwas Wichtiges?"**
Passe nach Feedback an (max. 1 Korrektur-Runde).

Speichere die Synthese für den weiteren Verlauf:
```bash
export GRILLING_REQUIREMENTS="<Anforderungsliste als kompakter Multi-line-String>"
export GRILLING_ASSETS_TODO="<ZU-BESCHAFFEN-Liste>"
```

### 3. Ticket anlegen

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

TICKET_RESULT=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, status)
   VALUES (
     'task', 'mentolder',
     'Grilling: <kurzer-titel>',
     \$\$GRILLING-ERGEBNIS

FUNKTIONALE ANFORDERUNGEN:
${GRILLING_REQUIREMENTS}

ASSETS ZU BESCHAFFEN:
${GRILLING_ASSETS_TODO}\$\$,
     'triage'
   )
   RETURNING external_id, id;")

export GRILLING_TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
export GRILLING_TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
```

Melde: **"Grilling-Ticket `$GRILLING_TICKET_EXT_ID` angelegt → https://web.mentolder.de/admin/bugs"**

### 4. Bereits vorliegende Assets hochladen

Falls der User in Runde 4 bereits konkrete Dateipfade genannt hat:

```bash
GRILLING_ATTACHMENT_PATHS=(/* genannte Pfade */)
if [[ ${#GRILLING_ATTACHMENT_PATHS[@]} -gt 0 ]]; then
  bash scripts/ticket-attach.sh "$GRILLING_TICKET_UUID" "${GRILLING_ATTACHMENT_PATHS[@]}"
fi
```

Erlaubte Endungen: `.md .html .jpg .jpeg .png .gif .webp .mp3 .wav .mp4 .mov .webm .pdf .txt .log`

### 5. Kontext-Übergabe an den weiteren Flow

Die exportierten Variablen (`GRILLING_TICKET_EXT_ID`, `GRILLING_REQUIREMENTS`, `GRILLING_ASSETS_TODO`) fließen automatisch in:
- **Schritt 1.5** (Asset-Sammlung): `GRILLING_ASSETS_TODO` zeigt was noch fehlt — dort gezielt nachfragen
- **Schritt 1.6** (Codebase-Explorer): Scope und Anforderungen geben dem Explorer einen schärferen Fokus
- **Schritt 3** (Brainstorming): wird als `<grilling-context>` Block injiziert
- **Schritt 4.5** (Ticket): Plan-Ticket referenziert das Grilling-Ticket

Fahre jetzt mit **Schritt −2** fort.

---

## Schritt −2: Main-Branch sync (Pull-First)

Führe **als allererstes** aus — bevor irgendetwas anderes passiert:

```bash
# Prüfen ob sauberer Zustand oder lokale Änderungen vorhanden
git fetch origin main
if git diff --quiet HEAD; then
  # Sauber → direkt pullen
  git pull --rebase origin main
else
  # Lokale Änderungen vorhanden → stashen, pullen, zurückholen
  echo "Lokale Änderungen erkannt — stashe vor dem Pull..."
  git stash
  git pull --rebase origin main
  git stash pop
  echo "Stash zurückgespielt. Bitte Konflikte prüfen falls vorhanden."
fi
```

Falls `git stash pop` Konflikte meldet: dem User anzeigen und Klärung einholen, bevor weitergemacht wird.

---

## Schritt −1: Stale-Worktree-Audit

Führe **immer als erstes** aus — bevor Pfad oder Branch bestimmt werden:

```bash
# Alle aktiven Worktrees zeigen
git worktree list

# Bereits in main gemergte Branches mit noch aktiven Worktrees finden
# (squash-merge-safe: prüft GitHub PR-Status statt git branch --merged)
git worktree list --porcelain \
  | awk '/^branch /{print $2}' \
  | grep -v 'refs/heads/main' \
  | sed 's|refs/heads/||' \
  | while read -r branch; do
    MERGED=$(gh pr list --head "$branch" --state merged --json number --jq 'length' 2>/dev/null || echo 0)
    if [[ "$MERGED" -gt 0 ]]; then
      WT=$(git worktree list --porcelain \
        | awk -v b="refs/heads/$branch" '/^worktree/{wt=$2} $0==("branch " b){print wt}')
      echo "⚠️  STALER WORKTREE: $branch → $WT (PR wurde gemergt)"
    fi
  done
```

Falls stale Worktrees ausgegeben werden: Dem User mitteilen und anbieten, sie zuerst zu bereinigen. Bereinigung auf Anfrage:

```bash
# Für jeden stalen Worktree/Branch:
git worktree remove <path> --force
git branch -D <branch>
git push origin --delete <branch> 2>/dev/null || true
```

Kein Blocker — wenn der User weitermachen will, einfach fortfahren.

---

## Schritt 0: Pfad bestimmen

Lies die Anfrage und schlage einen der drei Pfade vor. Bestätigung beim User einholen, BEVOR du weitermachst.

| Pfad | Wann |
|---|---|
| **feature** | Neues Verhalten, neuer Endpunkt, neue UI-Sektion, neuer Task — alles was Nutzer bemerken |
| **fix** | Etwas ist kaputt; Output/Verhalten passt nicht zur Erwartung. **Erfordert ein T-###### Ticket.** |
| **chore** | Keine Verhaltensänderung für Nutzer — Dependency-Bumps, Refactors, Doku/Kommentar-Updates, Config/CI-Tweaks |

Sage z.B.: "Das klingt nach einem **fix** — wir reparieren ein bestehendes Verhalten. Passt das? Hast du eine T-###### Ticket-ID?"

---

## Feature-Pfad

### Schritt 1: Worktree anlegen

**Vor dem Anlegen — Konflikt-Check:**

```bash
BRANCH_NAME="feature/<kurzer-slug>"
EXISTING_WT=$(git worktree list --porcelain \
  | awk -v b="refs/heads/$BRANCH_NAME" '/^worktree/{wt=$2} $0==("branch " b){print wt}')
if [[ -n "$EXISTING_WT" ]]; then
  echo "Worktree für $BRANCH_NAME existiert bereits: $EXISTING_WT"
  echo "→ Nicht neu anlegen. Stattdessen: cd $EXISTING_WT"
fi
```

Falls Worktree bereits existiert: **nicht** `using-git-worktrees` aufrufen — direkt in den vorhandenen Worktree wechseln.

Falls kein Worktree existiert: Rufe `superpowers:using-git-worktrees` auf. Branch-Name: `feature/<kurzer-slug>`.

> **Branch-Naming-Warnung:** Das native `EnterWorktree` Tool mangelt den Branch-Namen — aus `feature/admin-menu-rules` wird `worktree-feature+admin-menu-rules` (Slash → Plus, Prefix `worktree-`). Das verletzt die Repo-Konvention `feature/*`. Verifiziere nach dem Anlegen mit `git branch --show-current` und benenne ggf. um: `git branch -m feature/<slug>` (oder pushe direkt ohne Umbennung, dann `git push -u origin feature/<slug>:feature/<slug>`). Der vorhersagbarere Pfad ist die manuelle Form:
> ```bash
> git worktree add -b feature/<slug> /tmp/wt-<slug> origin/main
> cd /tmp/wt-<slug> && git submodule update --init --recursive
> ```
>
> **⚠️ KEIN `.claude/worktrees/` verwenden** — dieses Verzeichnis ist in `.gitignore` eingetragen. Git-Worktrees in gitignorierten Pfaden können die Branch-Erkennung (`git branch --show-current`) brechen und staged Files können ungewollt in den Haupt-Index bluten. Immer `/tmp/wt-<slug>` (außerhalb des Repos) verwenden.

### Schritt 1.5: Optionale Asset-Sammlung

**Bevor du das Brainstorming startest, frage den User aktiv:**

> "Hast du Dateien, die beim Planen helfen würden — Spec-/Notiz-Markdown, HTML-Mockups, Screenshots/Bilder (`.jpg`/`.png`), Tonaufnahmen (`.mp3`), Video-Walkthroughs (`.mp4`)? Wenn ja: nenn mir die Pfade (absolut, leerzeichengetrennt oder einer pro Zeile). Sonst: 'keine'."

Erlaubte Endungen: `.md .html .jpg .jpeg .png .gif .webp .mp3 .wav .mp4 .mov .webm .pdf .txt .log`.

Stash die Pfade in einer Bash-Variable für später:

```bash
# Beispiel — vom User-Input befüllen:
ATTACHMENT_PATHS=(
  "/home/patrick/notes/idea.md"
  "/home/patrick/Pictures/mockup.png"
)
```

Falls die Datei eine `.md`/`.html`/`.txt` ist: zusätzlich den Inhalt vor dem Brainstorming lesen (`Read` Tool) — der Inhalt fließt direkt ins Brainstorming-Kontext ein.
Falls `.jpg`/`.png`: ebenfalls über `Read` Tool laden — Claude verarbeitet die Bilder multimodal.
Audio/Video (`.mp3`/`.mp4`) wird nur archiviert (ans Ticket angehängt), nicht inline transkribiert — falls der User Transkription will, gesondert über `task workspace:transcriber-*` oder Whisper anstoßen.

Falls der User "keine" sagt: Array leer lassen und weiter.

### Schritt 1.6: Codebase-Exploration (code-explorer)

Dispatch `feature-dev:code-explorer` um die relevanten Codebase-Bereiche zu kartieren, bevor das Brainstorming beginnt. Das Ergebnis fließt als Kontext in Schritt 3 ein.

**Auftrag an den Agent — leite diesen Prompt weiter:**

> "Trace the execution paths and map the architecture relevant to: `<task-description>` (branch: `feature/<slug>`).
> Focus on:
> 1. Which files/modules are the entry points for this feature area?
> 2. What existing patterns, abstractions, and data flows would this change touch or extend?
> 3. Are there any extension points (interfaces, hooks, event emitters, DB tables) that the new feature should wire into?
> 4. List any gotchas, coupling points, or non-obvious dependencies.
>
> Return a concise report (max 400 words) suitable for use as brainstorming context."

Speichere den Report in einer Bash-Variable:

```bash
EXPLORER_REPORT="<output des code-explorer agents>"
```

Dieser Report wird in Schritt 3 als `<codebase-context>` Block dem Brainstorming vorangestellt.

Falls der Agent fehlschlägt oder kein Output kommt: einfach fortfahren (kein Blocker).

---

### Schritt 2: Pre-launch Brainstorming-Tunnel

```bash
# a) wss:// sicherstellen (idempotent)
bash scripts/superpowers-helper-patch.sh
```

Falls exit ≠ 0: Abbruch. Mitteilen: "wss:// patch failed — run `bash scripts/superpowers-helper-patch.sh` manually and retry."

```bash
# b) Server starten
START_SCRIPT=$(find ~/.claude/plugins/cache/claude-plugins-official/superpowers \
  -name start-server.sh | sort -V | tail -1)
RESULT=$(bash "$START_SCRIPT" --project-dir /home/patrick/Bachelorprojekt)
PORT=$(echo "$RESULT" | jq -r '.port')
SCREEN_DIR=$(echo "$RESULT" | jq -r '.screen_dir')
STATE_DIR=$(echo "$RESULT" | jq -r '.state_dir')
```

Falls `$PORT` leer: Abbruch. Mitteilen: "brainstorm server konnte nicht gestartet werden."

> **`$PORT` immer aus `RESULT` ableiten — niemals raten (T000343).** Der `task brainstorm:publish -- $PORT` unten **muss** genau den von `start-server.sh` zurückgegebenen Port verwenden. Ein gemerkter/geratener Port (aus einer früheren Session) liefert einen 502, bis neu publisht wird. Wenn der Companion neu gestartet wird (Schritt e-Fallback bei Zeile ~406), `$PORT` aus dem neuen `RESULT` neu setzen, bevor erneut publisht wird.

```bash
# c) Vorflug-Check (idempotent, schnell — bricht früh ab wenn Setup kaputt)
task brainstorm:status >/tmp/brainstorm-status.log 2>&1 || true
grep -q 'Running' /tmp/brainstorm-status.log || { echo "sish pod not Running — aborting"; cat /tmp/brainstorm-status.log; exit 1; }

# Stelle sicher dass mindestens ein Authorized-Key im Secret liegt — sonst hängt ssh -R lautlos
KEY_COUNT=$(kubectl --context mentolder -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.DEV_SISH_AUTHORIZED_KEYS}' 2>/dev/null | base64 -d 2>/dev/null | grep -c '^ssh-' || echo 0)
if [[ "$KEY_COUNT" -lt 1 ]]; then
  echo "⚠️  Keine authorized_keys im Secret workspace-secrets. Patricks Public-Key in environments/.secrets/mentolder.yaml" \
       "unter DEV_SISH_AUTHORIZED_KEYS ergänzen, dann: task env:seal ENV=mentolder"
  exit 1
fi
```

```bash
# d) Stale SSH-Tunnel töten — verhindert "remote port forwarding failed" bei Wiederverwendung
# Bracket-Trick [3]2223 verhindert Self-Match des pkill-Kommandos selbst
pkill -f "ssh.*[3]2223" 2>/dev/null && echo "Stale ssh tunnel(s) killed" || echo "Kein staler Tunnel gefunden"
sleep 1  # kurze Pause damit der Remote-Forward auf sish freigegeben wird
```

```bash
# e) Tunnel publishen (run_in_background: true) — STDOUT/STDERR in Log-File schreiben
task brainstorm:publish -- $PORT >/tmp/brainstorm-publish.log 2>&1
```

```bash
# f) Verify — bis zu 15s auf den Tunnel warten. Erst wenn 200/302 kommt, ist die URL benutzbar.
# Zusätzlich: lokalen Listener prüfen — wenn der Companion-Server stirbt, bekommt der User 502.
for i in $(seq 1 15); do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 https://brainstorm.dev.mentolder.de/ || echo 000)
  if [[ "$CODE" == "200" || "$CODE" == "302" || "$CODE" == "301" ]]; then
    echo "✓ Tunnel live (HTTP $CODE) nach ${i}s"
    break
  fi
  sleep 1
done
if [[ "$CODE" != "200" && "$CODE" != "302" && "$CODE" != "301" ]]; then
  echo "✗ Tunnel hat nach 15s nicht geantwortet (letzter HTTP-Code: $CODE)"
  echo "── publish log ──"
  cat /tmp/brainstorm-publish.log
  echo "── häufige Ursachen ──"
  echo "  • SSH key nicht in DEV_SISH_AUTHORIZED_KEYS (siehe Schritt c)"
  echo "  • ufw blockiert Port 32223 auf gekko-hetzner-2 → 'task brainstorm:firewall:open'"
  echo "  • sish pod restartet/crashed → 'task brainstorm:status'"
  echo "  • PORT $PORT lauscht nicht lokal → 'ss -ltn | grep $PORT'"
  exit 1
fi
# Lokalen Listener noch oben? Wenn nicht, Server neu starten (Companion stirbt manchmal nach verify)
if ! ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "⚠️  Lokaler Listener auf Port $PORT nicht mehr aktiv — Companion-Server neu starten"
  RESULT=$(bash "$START_SCRIPT" --project-dir /home/patrick/Bachelorprojekt)
  PORT=$(echo "$RESULT" | jq -r '.port')
  echo "Companion neu gestartet auf Port $PORT"
fi
```

Erst wenn Schritt e) grün ist, Patrick mitteilen: **"Brainstorming-Companion läuft unter https://brainstorm.dev.mentolder.de (HTTP $CODE) — jetzt im Browser öffnen."**

### Schritt 3: Brainstorming

Rufe `superpowers:brainstorming` auf. Voranstellen vor dem ersten Brainstorming-Turn:

> "Visual-Companion-Server läuft bereits (Port `$PORT`). `screen_dir=$SCREEN_DIR`, `state_dir=$STATE_DIR`. Rufe `start-server.sh` nicht nochmals auf. Nenne dem User immer `https://brainstorm.dev.mentolder.de` — niemals `http://localhost:*`.
>
> <codebase-context>
> $EXPLORER_REPORT
> </codebase-context>
>
> Nutze den Codebase-Context aus `<codebase-context>` als Grundlage für Step 1 (Explore project context) — du musst die dort beschriebenen Dateien nicht erneut lesen, außer du brauchst spezifische Details.
>
> $(if [[ -n "${GRILLING_TICKET_EXT_ID:-}" ]]; then echo "<grilling-context>
> Grilling-Ticket: $GRILLING_TICKET_EXT_ID
>
> ANFORDERUNGEN (bereits erarbeitet — nicht erneut erfragen):
> $GRILLING_REQUIREMENTS
>
> NOCH ZU BESCHAFFENDE ASSETS:
> $GRILLING_ASSETS_TODO
> </grilling-context>
>
> Die Anforderungen aus <grilling-context> sind bereits mit dem User abgestimmt. Nutze sie als gesetzten Rahmen — kein erneutes Erfragen der Grundlagen. Fokussiere Brainstorming auf Implementierungsansätze, UX-Details und technische Entscheidungen innerhalb dieses Rahmens."; fi)"

Ergebnis: Spec in `docs/superpowers/specs/<date>-<slug>-design.md`.

### Schritt 3.5: Playwright-Projekt-Gate (falls neue E2E-Specs geplant)

Falls das Feature neue Playwright-Spec-Dateien umfasst, **muss** die Spec (und der daraus entstehende Plan) für jede neue Datei explizit angeben:

1. **Dateiname** (z.B. `sa-15-cross-cluster-health.spec.ts`)
2. **Playwright-Projekt(e)**, zu dem die Datei gehört (Mehrfachnennung möglich!)
3. **Endpunkte / Routen**: aus dem Quellcode ableiten, nie annehmen

**Projekt-Zuweisung (aus `tests/e2e/playwright.config.ts`):**

| Spec-Typ | Playwright-Projekt | Begründung |
|---|---|---|
| Nicht-auth SA-*/NFA-*/cross-cluster/arena-DB | `services` | Kein Login nötig; kein `storageState` |
| Authentifizierte FA-* (mentolder Login) | `mentolder` | Braucht `storageState: .auth/mentolder-website-admin.json` |
| Authentifizierte FA-* (Website-Flows) | `website` | Braucht Login-Setup-Dependency |
| Korczewski-spezifische Tests | `korczewski` | Eigene Auth-State + Korczewski-Domain |
| Kombiniert (z.B. Cross-Cluster ohne Auth) | `services` **und** ggf. `korczewski` | Immer beide Projekte explizit nennen |

**Endpunkte aus Source ableiten (Pflicht):**
```bash
# Beispiel: Arena health route verifizieren bevor in Spec schreiben
grep -n "r\.\(get\|post\|put\)(" arena-server/src/http/routes.ts | head -20
```
Niemals Endpfad annehmen (z.B. `/health`) ohne im Quellcode verifiziert zu haben (z.B. tatsächlich `/healthz`). Test schlägt sonst mit 404 fehl und erzeugt unnötige Fix-Tickets.

### Schritt 3.7: Kontext-Reset + Opus 4.8 (xhigh) — Pflicht vor Plan-Schreibung

Der Kontext ist jetzt mit Brainstorming-Verlauf, Explorer-Reports und Tool-Outputs gefüllt. Bevor `superpowers:writing-plans` gerufen wird: Kontext bereinigen, stärkeres Modell laden, Spec + Ticket neu injizieren — so bekommt der Plan-Schreiber einen sauberen, fokussierten Startpunkt.

**1. Reinjektion-Anker sichern (vor dem Reset!):**

```bash
SPEC_FILE="docs/superpowers/specs/<date>-<slug>-design.md"

# Tickets für Reinjektion sammeln
REINJECT_TICKETS=()
[[ -n "${TICKET_EXT_ID:-}" ]]          && REINJECT_TICKETS+=("$TICKET_EXT_ID")
[[ -n "${GRILLING_TICKET_EXT_ID:-}" ]] && REINJECT_TICKETS+=("$GRILLING_TICKET_EXT_ID")

echo "══ REINJEKTION-ANKER ══════════════════════"
echo "Spec:    $SPEC_FILE"
echo "Branch:  $(git branch --show-current)"
echo "Tickets: ${REINJECT_TICKETS[*]:-keine}"
echo "═══════════════════════════════════════════"
```

**1.5. Spec auf Branch committen (vor dem Reset!):**

Damit die Spec nach dem `/compact` — auch in einer neuen Session oder nach Worktree-Verlust — via `git` auffindbar ist:

```bash
git add docs/superpowers/specs/<date>-<slug>-design.md
git commit -m "chore(specs): add <slug> design spec"
git push
```

Dieser Commit ist idempotent gegenüber Schritt 5 — `git add` einer bereits committeten Datei ist ein No-op.

**2. ⚡ STOP — führe diese Befehle jetzt aus (in dieser Reihenfolge):**

```
/model claude-opus-4-8
```
```
/compact Behalte für Plan-Schreibung: Spec-Pfad=<SPEC_FILE>, Branch=<aktiver-branch>, Ticket-IDs=<REINJECT_TICKETS>. Alles andere (Brainstorming, Explorer-Report, Worktree-Setup) verwerfen.
```

**3. Kontext-Injektion nach Reset:**

Als allererstes nach dem Compact — vor `superpowers:writing-plans` — ausführen:

```bash
# Spec vollständig einlesen (Read Tool)
# → docs/superpowers/specs/<date>-<slug>-design.md

# Ticket-Content aus DB holen (für jede ID in REINJECT_TICKETS)
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
for TID in "${REINJECT_TICKETS[@]}"; do
  kubectl exec "$PGPOD" -n workspace --context mentolder -- \
    psql -U website -d website -At -c \
    "SELECT '=== ' || external_id || ' ===' || E'\nTitle: ' || title
            || E'\n\n' || COALESCE(description,'(kein Inhalt)')
     FROM tickets.tickets WHERE external_id='$TID';"
done
```

Erst nach dieser Injektion mit **Schritt 4** fortfahren.

---

### Schritt 4: Plan schreiben

Rufe `superpowers:writing-plans` auf. Führe danach sofort aus:

```bash
bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/<date>-<slug>.md
```

Ergebnis: Plan in `docs/superpowers/plans/<date>-<slug>.md`.

> **Plan-Schritte, die ein k8s-Objekt patchen, müssen das Objekt zuerst verifizieren (T000346).** Bevor ein Schritt behauptet „Deployment X hat Problem Y, fixe via Z", den tatsächlichen Objekt-Namen **und** die aktuelle Affinity/Spec per `kubectl kustomize <overlay>/ | grep -A30 <kind>` prüfen. Beispiel-Fehlschlag: ein Plan zielte auf ein „Deployment talk-hpb", doch das Objekt heißt `spreed-signaling` und hatte bereits `namespaces:[coturn]` in seiner podAffinity — der „Fix" wäre ein no-op (bestenfalls) oder hätte die cross-namespace-Affinity gebrochen. Annahmen über Namen/Affinity nie ungeprüft in einen Plan-Schritt schreiben.

### Schritt 4.5: Ticket anlegen

Lege ein Ticket vom Typ `task` in der Produktionsdatenbank an und speichere die ID im Plan-Frontmatter.

```bash
# Postgres-Pod ermitteln (mentolder-Cluster)
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

# Ticket anlegen — Titel und Beschreibung aus Slug und Branch ableiten
# Falls eine Grilling-Session vorausging, wird das Grilling-Ticket referenziert
GRILLING_REF=""
if [[ -n "${GRILLING_TICKET_EXT_ID:-}" ]]; then
  GRILLING_REF=$'\n'"Grilling-Ticket: ${GRILLING_TICKET_EXT_ID}"
fi

TICKET_RESULT=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, status)
   VALUES (
     'task', 'mentolder',
     'Plan: <slug>',
     'Branch: feature/<slug>' || E'\n' || 'Plan: docs/superpowers/plans/<date>-<slug>.md' || E'\n' || 'Spec: docs/superpowers/specs/<date>-<slug>-design.md' || E'${GRILLING_REF}',
     'triage'
   )
   RETURNING external_id, id;")

TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)   # z.B. T000301
TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
```

Ersetze den `ticket_id: null` Platzhalter im Frontmatter (den `plan-frontmatter-hook.sh` immer einfügt):

```bash
sed -i "s/^ticket_id: null$/ticket_id: $TICKET_EXT_ID/" \
  docs/superpowers/plans/<date>-<slug>.md
```

Verifiziere anschließend:
```bash
grep '^ticket_id:' docs/superpowers/plans/<date>-<slug>.md
# Erwartete Ausgabe: ticket_id: T000XXX (kein "null")
```

Injiziere dann brainstorm_choice + brainstorm_session (best-effort — kein Fehler wenn kein STATE_DIR oder keine Wahl):

```bash
if [[ -n "${STATE_DIR:-}" ]] && BRAINSTORM_CHOICE=$(bash scripts/brainstorm-extract-choice.sh "$STATE_DIR" 2>/dev/null); then
  SESSION_ID=$(basename "$(dirname "$STATE_DIR")")
  awk -v c="$BRAINSTORM_CHOICE" -v s="$SESSION_ID" \
    'NR==1{print; print "brainstorm_choice: " c; print "brainstorm_session: " s; next} 1' \
    docs/superpowers/plans/<date>-<slug>.md > /tmp/_plan_tmp.md && \
    mv /tmp/_plan_tmp.md docs/superpowers/plans/<date>-<slug>.md
  echo "Brainstorm choice '$BRAINSTORM_CHOICE' (session $SESSION_ID) recorded"
fi
```

Melde: **"Ticket `$TICKET_EXT_ID` angelegt → https://web.mentolder.de/admin/bugs"**

### Schritt 4.6: Gesammelte Assets ans Ticket hängen

Falls `ATTACHMENT_PATHS` (aus Schritt 1.5) Einträge hat, hochladen:

```bash
if [[ ${#ATTACHMENT_PATHS[@]} -gt 0 ]]; then
  bash scripts/ticket-attach.sh "$TICKET_UUID" "${ATTACHMENT_PATHS[@]}"
fi
```

`ticket-attach.sh` lehnt unbekannte Endungen ab und kappt inline-Uploads bei 10 MB (`MAX_INLINE_MB=20` o.ä. zum Erhöhen). Dateien > Cap müssen vorher in Nextcloud landen — dann manuell INSERT mit `nc_path` statt `data_url`.

### Schritt 5: Commit & Push — dann STOPP

```bash
# Sicherheitscheck: NIEMALS auf main committen [T000321]
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" == "main" || -z "$BRANCH" ]]; then
  echo "ERROR: Auf main-Branch (oder kein Branch). Plan darf nicht auf main committed werden!"
  echo "→ Schritt 1 (Worktree anlegen) wurde übersprungen oder fehlgeschlagen. Jetzt nachholen:"
  echo "  git worktree add -b feature/<slug> /tmp/wt-<slug> origin/main && cd /tmp/wt-<slug>"
  exit 1
fi

# Die Spec wurde bereits in Schritt 3.7.1.5 committed; git add ist idempotent falls nötig
git add docs/superpowers/specs/<date>-<slug>-design.md docs/superpowers/plans/<date>-<slug>.md
git commit -m "chore(plans): stage <slug> for execution [$TICKET_EXT_ID]"

# Push mit automatischer Force-with-lease-Fallback bei divergiertem Remote (Prior-Session Stale Commits)
if ! git push -u origin "$BRANCH" 2>/tmp/_push_err.txt; then
  if grep -qE "rejected.*non-fast-forward|rejected.*fetch first" /tmp/_push_err.txt; then
    echo "Remote divergiert — wende --force-with-lease an"
    git push --force-with-lease origin "$BRANCH"
  else
    cat /tmp/_push_err.txt; exit 1
  fi
fi
```

**STOPP.** Sage: "Plan auf Branch `feature/<slug>` gepusht → `docs/superpowers/plans/<date>-<slug>.md` (Ticket: `$TICKET_EXT_ID`). Ruf `dev-flow-execute` auf, wenn du bereit bist zur Implementierung."

Keine Implementation, keine Verifikation, kein PR — das übernimmt `dev-flow-execute`.

---

## Fix-Pfad

### Schritt 1: T-###### Ticket

Frage den User nach der Ticket-ID (Format: `T######`, z.B. `T000288`).

**Wenn eine Ticket-ID vorhanden ist:** direkt übernehmen → `TICKET_EXT_ID=T######`. Hole zusätzlich die UUID für etwaige Attachments:

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
TICKET_UUID=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT id FROM tickets.tickets WHERE external_id='$TICKET_EXT_ID';")
```

**Optionale Asset-Sammlung (vor Ticket-Anlage oder vor Attachment-Upload):**

Frage den User aktiv:

> "Hast du Belegmaterial — Screenshot vom Bug (`.jpg`/`.png`), Log-Auszug (`.txt`/`.log`/`.md`), Bildschirmaufnahme (`.mp4`/`.webm`), Audio-Wiedergabe (`.mp3`)? Pfade absolut, leerzeichengetrennt. Sonst: 'keine'."

Erlaubte Endungen: `.md .html .jpg .jpeg .png .gif .webp .mp3 .wav .mp4 .mov .webm .pdf .txt .log`.

```bash
ATTACHMENT_PATHS=(
  # vom User-Input befüllen
)
```

Falls `.txt`/`.log`/`.md`/`.png`/`.jpg`: zusätzlich vor der Ticket-Anlage `Read`en — Inhalt fließt in die Bug-Beschreibung ein (bessere Reproduktion).

**Wenn keine Ticket-ID existiert:** frage nach Titel, Schweregrad und kurzer Beschreibung, lege dann das Ticket via SQL an:

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

TICKET_RESULT=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, status, severity, priority)
   VALUES (
     'bug', 'mentolder',
     '<titel>',
     '<beschreibung>',
     'triage',
     '<critical|major|minor|trivial>',
     'hoch'
   )
   RETURNING external_id, id;")

TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
```

Melde: **"Ticket `$TICKET_EXT_ID` angelegt → https://web.mentolder.de/admin/bugs"**

**Asset-Upload (falls Schritt oben Pfade gesammelt hat):**

```bash
if [[ ${#ATTACHMENT_PATHS[@]} -gt 0 ]]; then
  bash scripts/ticket-attach.sh "$TICKET_UUID" "${ATTACHMENT_PATHS[@]}"
fi
```

**Ohne Ticket-ID geht der Fix-Pfad nicht weiter.**

### Schritt 2: Worktree anlegen

**Vor dem Anlegen — Konflikt-Check:**

```bash
BRANCH_NAME="fix/<kurzer-slug>"
EXISTING_WT=$(git worktree list --porcelain \
  | awk -v b="refs/heads/$BRANCH_NAME" '/^worktree/{wt=$2} $0==("branch " b){print wt}')
if [[ -n "$EXISTING_WT" ]]; then
  echo "Worktree für $BRANCH_NAME existiert bereits: $EXISTING_WT"
  echo "→ Nicht neu anlegen. Stattdessen: cd $EXISTING_WT"
fi
```

Falls Worktree bereits existiert: **nicht** `using-git-worktrees` aufrufen — direkt in den vorhandenen Worktree wechseln.

Falls kein Worktree existiert: Rufe `superpowers:using-git-worktrees` auf. Branch-Name: `fix/<kurzer-slug>`.

> **Branch-Naming-Warnung:** Das native `EnterWorktree` Tool mangelt den Branch-Namen (Slash → Plus, Prefix `worktree-`). Verifiziere mit `git branch --show-current` und benenne ggf. um: `git branch -m fix/<slug>`. Vorhersagbar:
> ```bash
> git worktree add -b fix/<slug> /tmp/wt-<slug> origin/main
> cd /tmp/wt-<slug> && git submodule update --init --recursive
> ```
>
> **⚠️ KEIN `.claude/worktrees/` verwenden** — gitignorierter Pfad, bricht Branch-Erkennung. Immer `/tmp/wt-<slug>` verwenden.

### Schritt 3: Failing Test schreiben

Schreibe einen Test, der den Bug beweist (red-green-refactor — Pflicht). Dieser Test ist **harte Voraussetzung** für den Fix-Pfad: ohne gestageten failing Test darf `dev-flow-execute` weder implementieren noch mergen (es prüft den Test-Diff und HALTet sonst). Der Test wird in Schritt 5 zusammen mit dem Plan committed — nie nachträglich als Follow-up (genau das passierte bei PR #1134/#1135 und ist der Grund für dieses Gate).

```bash
./tests/runner.sh local <neue-test-id>
# Erwartet: FAIL
```

> **BATS 1.13 stderr-Falle:** `$output` enthält nur stdout. Wenn dein Test Inhalt aus stderr prüfen muss (z.B. Fehlermeldungen, `>&2`-Ausgaben), verwende `run --separate-stderr` — dann steht der Stderr-Inhalt in `$stderr`:
> ```bash
> run --separate-stderr my_function
> assert_output --partial "expected stdout content"
> assert [ "$stderr" = "expected stderr content" ]
> ```
> Ohne `--separate-stderr` fehlen alle `>&2`-Ausgaben in `$output`, und Assertions darauf schlagen still fehl.
>
> **HERMES/curl-Unterdrückung:** Wenn du OpenClaw via `HERMES=/dev/null` deaktivierst, unterdrückt das nur den Hermes-Aufruf — `curl` läuft trotzdem. Für deterministisches Test-Verhalten muss auch `curl` durch eine Fake-Binary ersetzt werden:
> ```bash
> FAKE_BIN=$(mktemp -d)
> echo '#!/bin/bash' > "$FAKE_BIN/curl"; chmod +x "$FAKE_BIN/curl"
> PATH="$FAKE_BIN:$PATH" HERMES=/dev/null run my_script
> rm -rf "$FAKE_BIN"
> ```

### Schritt 4: Plan schreiben (nicht-triviale Fixes)

Bei Einzeilern: kurze Inline-Begründung im Commit reicht — Schritt 4 überspringen (Ticket-ID trotzdem im Commit erwähnen).

Bei nicht-trivialem Fix: Rufe `superpowers:writing-plans` auf. Führe danach sofort aus:

```bash
bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/<slug>.md

# ticket_id Platzhalter ersetzen
sed -i "s/^ticket_id: null$/ticket_id: $TICKET_EXT_ID/" \
  docs/superpowers/plans/<slug>.md
```

Plan sofort committen — damit er nach einem Cache-Reset oder Session-Verlust via `git` auffindbar ist:

```bash
git add docs/superpowers/plans/<slug>.md
git commit -m "chore(plans): add <slug> fix plan [$TICKET_EXT_ID]"
git push
```

### Schritt 5: Commit & Push — dann STOPP

```bash
# Sicherheitscheck: NIEMALS auf main committen [T000321]
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" == "main" || -z "$BRANCH" ]]; then
  echo "ERROR: Auf main-Branch (oder kein Branch). Plan darf nicht auf main committed werden!"
  echo "→ Schritt 1 (Worktree anlegen) wurde übersprungen oder fehlgeschlagen. Jetzt nachholen:"
  echo "  git worktree add -b fix/<slug> /tmp/wt-<slug> origin/main && cd /tmp/wt-<slug>"
  exit 1
fi

# Immer dabei: der failing Test
git add tests/<relevante-test-datei>

# Plan wurde bereits in Schritt 4 committed; git add ist idempotent falls nötig
git add docs/superpowers/plans/<slug>.md

git commit -m "chore(plans): stage <slug> fix for execution [$TICKET_EXT_ID]"

# Push mit automatischer Force-with-lease-Fallback bei divergiertem Remote
if ! git push -u origin "$BRANCH" 2>/tmp/_push_err.txt; then
  if grep -qE "rejected.*non-fast-forward|rejected.*fetch first" /tmp/_push_err.txt; then
    echo "Remote divergiert — wende --force-with-lease an"
    git push --force-with-lease origin "$BRANCH"
  else
    cat /tmp/_push_err.txt; exit 1
  fi
fi
```

**STOPP.** Sage: "Failing Test + Plan auf Branch `fix/<slug>` gepusht (Ticket: `$TICKET_EXT_ID`). Ruf `dev-flow-execute` auf, wenn du bereit bist zur Implementierung."

---

## Chore-Pfad

Chores brauchen keinen Plan — sie werden direkt hier vollständig ausgeführt.

### Schritt 0.5: Wiederkehrend oder einmalig?

Frage vor allem anderen: **"Soll diese Chore regelmäßig wiederholt werden — z.B. wöchentlich, monatlich, täglich?"**

Erkennungsmerkmale für wiederkehrende Chores:
- Dependency-Bumps (wöchentlich/monatlich)
- Zertifikat- oder Token-Rotation (monatlich/quartalsmäßig)
- Log-Bereinigung, Backup-Checks (täglich/wöchentlich)
- Jeglicher Satz mit "regelmäßig", "jede Woche", "jeden Monat", "automatisch"

| Antwort | Aktion |
|---|---|
| **Wiederkehrend** | Rufe `schedule` auf. Die Routine richtet einen Cron-Job für die Aufgabe ein. Kein Branch, kein Worktree, **STOPP hier**. |
| **Einmalig** | Weiter mit "Vor dem Worktree — offene Chore-Branches prüfen". |

### Vor dem Worktree — offene Chore-Branches prüfen

```bash
git branch -r | grep 'origin/chore/'
```

Gibt es einen thematisch passenden offenen Branch? → Änderung dort einbauen, bestehenden PR updaten. Kein neuer Worktree.

### Schritt 1: In einem Satz beschreiben

Beispiele: "Astro auf 5.x bumpen", "Variable `foo` zu `bar` umbenennen", "Tippfehler in Doku korrigieren".

### Schritt 2: Worktree anlegen

**Vor dem Anlegen — Konflikt-Check:**

```bash
BRANCH_NAME="chore/<kurzer-slug>"
EXISTING_WT=$(git worktree list --porcelain \
  | awk -v b="refs/heads/$BRANCH_NAME" '/^worktree/{wt=$2} $0==("branch " b){print wt}')
if [[ -n "$EXISTING_WT" ]]; then
  echo "Worktree für $BRANCH_NAME existiert bereits: $EXISTING_WT"
  echo "→ Nicht neu anlegen. Stattdessen: cd $EXISTING_WT"
fi
```

Falls Worktree bereits existiert: **nicht** `using-git-worktrees` aufrufen — direkt in den vorhandenen Worktree wechseln.

Falls kein Worktree existiert: Rufe `superpowers:using-git-worktrees` auf. Branch-Name: `chore/<kurzer-slug>`.

> **Branch-Naming-Warnung:** Das native `EnterWorktree` Tool mangelt den Branch-Namen (Slash → Plus, Prefix `worktree-`). Verifiziere mit `git branch --show-current` und benenne ggf. um: `git branch -m chore/<slug>`. Vorhersagbar:
> ```bash
> git worktree add -b chore/<slug> /tmp/wt-<slug> origin/main
> cd /tmp/wt-<slug> && git submodule update --init --recursive
> ```
>
> **⚠️ KEIN `.claude/worktrees/` verwenden** — gitignorierter Pfad, bricht Branch-Erkennung. Immer `/tmp/wt-<slug>` verwenden.

### Schritt 3: Änderung machen

Kein Plan, kein Spec, kein TDD nötig.

### Schritt 4: Verifikation

```bash
task test:all                # MUSS grün sein
task workspace:validate      # falls Manifests betroffen
task website:dev             # falls website/src/ betroffen — Smoke-Test
```

**CI-kritische Zusatzchecks** — `task test:all` deckt nur den `offline-tests`-CI-Job ab; die folgenden haben eigene Jobs:

| Geänderte Dateien | Zusätzlicher Check |
|---|---|
| `tests/**` oder neue Test-IDs | `task test:inventory && git diff --exit-code website/src/data/test-inventory.json` — bei Abweichung committen |
| `brett/**` | `npm ci --prefix brett && node --test brett/test/ws-reconnect.test.mjs brett/test/physics.test.js brett/test/damage.test.mjs brett/test/pickups.test.mjs brett/test/mode-state.test.mjs brett/test/skin-validator.test.js brett/test/skin-catalog.test.js brett/test/skin-upload.test.js` + `./scripts/tests/systembrett-template.test.sh` |
| `arena-server/**` | `cd arena-server && pnpm install --frozen-lockfile && pnpm test && pnpm build` |
| `arena-server/src/proto/messages.ts` ODER `website/src/components/arena/shared/lobbyTypes.ts` | `diff arena-server/src/proto/messages.ts website/src/components/arena/shared/lobbyTypes.ts` — bei Abweichung sync-copy |

### Schritt 5: PR

Rufe `commit-commands:commit-push-pr` auf.

- Titel: `chore(<scope>): <kurze-beschreibung>`
- Body: kurzes `## Summary` (1-2 Bullets) + `## Test plan` (was du gelaufen bist)

> **Fallback** (falls `commit-commands` nicht verfügbar — z.B. Plugin deinstalliert):
> ```bash
> git add -p  # nur relevante Dateien
> git commit -m "chore(<scope>): <kurze-beschreibung>"
> git push -u origin chore/<slug>
> gh pr create --title "chore(<scope>): <kurze-beschreibung>" --body "## Summary\n- ...\n\n## Test plan\n- ..."
> ```

### Schritt 6: Auto-Merge

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --rebase origin main
```

> **Falls branch protection CI-Checks verlangt:** `gh pr merge --squash --delete-branch --auto` nutzen — `gh` wartet dann auf grüne Checks, bevor es mergt. **Aus einem `/tmp/wt-*`-Worktree no-oppt `--auto` silent** (oder scheitert an `'main' is already used by worktree`). Dann `--auto` mit `--repo Paddione/Bachelorprojekt` aus dem Haupt-Repo (außerhalb jedes Worktrees) aufrufen, oder CI grün pollen und ohne `--auto` mergen. [T000298]

### Schritt 7: Post-Merge Deploy

Schau dir die geänderten Dateien an und führe den passenden Task aus:

| Geänderte Dateien | Task | Verify |
|---|---|---|
| `website/src/**`, `website/public/**`, `website/package*.json` | `task feature:website` | `https://web.mentolder.de` + `https://web.korczewski.de` |
| `brett/**` | `task feature:brett` | `https://brett.mentolder.de` + `https://brett.korczewski.de` |
| `k3d/docs-content/**` | `task docs:deploy` | `https://docs.mentolder.de` + `https://docs.korczewski.de` |
| `k3d/livekit*.yaml` | `task feature:livekit` | `task livekit:status ENV=mentolder` + `ENV=korczewski` |
| `k3d/**`, `prod/**`, `prod-mentolder/**`, `prod-korczewski/**`, `environments/sealed-secrets/**` | `task feature:deploy` | `task workspace:verify:all-prods` + `task health` |
| Nur `docs/`, `*.md`, `CLAUDE.md`, `tests/`, `.github/`, `Taskfile*.yml`, `scripts/`, `.claude/` | KEIN Deploy | — |

---

## Visual Companion — Diagnose & manuelle Bedienung

Diese Sektion ist für Diagnose und manuelle Eingriffe. Der Feature-Pfad (Schritt 2) richtet den Tunnel automatisch ein.

### Setup einmalig

```bash
task brainstorm:firewall:open
# Public-Key in environments/.secrets/mentolder.yaml unter DEV_SISH_AUTHORIZED_KEYS ergänzen
task env:seal ENV=mentolder
# task workspace:deploy ENV=mentolder rolls the updated SealedSecret
```

### `ws://`→`wss://` Auto-Patch

```bash
bash scripts/superpowers-helper-patch.sh           # apply
bash scripts/superpowers-helper-patch.sh --check   # exit 1 if unpatched
```

### Diagnose

```bash
task brainstorm:status   # Pod-Status + curl gegen brainstorm.dev.mentolder.de
```

---

## Bekannte Kustomize-Gotchas

> **JSON Patch für bestehende env-Vars:** Verwende `op: replace /env/{index}/value`, **nicht** `op: add /env/-`, wenn eine env-Variable im Basis-Manifest bereits existiert. `add /env/-` erzeugt einen zweiten Eintrag mit demselben `name`, was `kustomize build` toleriert (last-wins), aber der Kubernetes API-Server lehnt per Dry-Run wegen Duplikat-Keys ab. Den richtigen Index mit `kubectl ... -o jsonpath='{.spec.template.spec.containers[0].env[*].name}'` bestimmen und ersetzen. [T000244]

## Agent-Routing

Jeder Pfad delegiert Spezialarbeit an die passenden Sub-Agents (siehe CLAUDE.md Agent-Routing-Tabelle):

- DB/Schema/Queries → `bachelorprojekt-db`
- Manifests/Kustomize/Taskfile → `bachelorprojekt-infra`
- Live-Cluster-Operations → `bachelorprojekt-ops`
- Tests schreiben/debuggen → `bachelorprojekt-test`
- Astro/Svelte/UI → `bachelorprojekt-website`
- SealedSecrets/Keycloak/OIDC → `bachelorprojekt-security`

**Pflicht vor jedem Sub-Agent-Dispatch:** `bash scripts/plan-context.sh <role>` ausführen und die Ausgabe in `<active-plans>` Tags an den Prompt voranstellen (Details in CLAUDE.md).


## Post-Execution: Mishap Report

After completing all steps in this skill, run:
```bash
# Unified Skill Framework: POST-Execution
bash scripts/skill-orchestrator.sh .claude/skills/dev-flow-plan/SKILL.md post
```

If no mishaps were found, `mishap-tracker` exits cleanly with "No mishaps found."