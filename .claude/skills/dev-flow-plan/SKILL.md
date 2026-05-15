---
name: dev-flow-plan
description: Use when beginning any repo change — feature, bug fix, or chore. Entry point for all development work in this repo. Routes to the correct path (feature/fix/chore) and produces a committed, pushed plan on the branch ready for dev-flow-execute. Chores complete inline without a separate execution step.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# dev-flow-plan — Pfad-Wahl, Brainstorming & Plan

## Wann diese Skill greift

Bei jeder Anfrage in diesem Repo, die etwas verändern will: neue Funktion, Bug fixen, Doku updaten, Dependencies bumpen, was auch immer.

**Sage zu Beginn:** "Ich nutze dev-flow-plan für Pfad-Wahl und Planung."

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

```bash
# c) Vorflug-Check (idempotent, schnell — bricht früh ab wenn Setup kaputt)
task brainstorm:status >/tmp/brainstorm-status.log 2>&1 || true
grep -q 'Running' /tmp/brainstorm-status.log || { echo "sish pod not Running — aborting"; cat /tmp/brainstorm-status.log; exit 1; }

# Stelle sicher dass mindestens ein Authorized-Key in der ConfigMap liegt — sonst hängt ssh -R lautlos
KEY_COUNT=$(kubectl --context mentolder -n workspace get cm brainstorm-sish-authorized-keys \
  -o jsonpath='{.data.authorized_keys}' 2>/dev/null | grep -c '^ssh-' || echo 0)
if [[ "$KEY_COUNT" -lt 1 ]]; then
  echo "⚠️  Keine authorized_keys in der ConfigMap. Patricks Public-Key in environments/.secrets/mentolder.yaml" \
       "unter DEV_SISH_AUTHORIZED_KEYS ergänzen, dann: task env:seal ENV=mentolder && task brainstorm:materialise-keys"
  exit 1
fi
```

```bash
# d) Tunnel publishen (run_in_background: true) — STDOUT/STDERR in Log-File schreiben
task brainstorm:publish -- $PORT >/tmp/brainstorm-publish.log 2>&1
```

```bash
# e) Verify — bis zu 15s auf den Tunnel warten. Erst wenn 200/302 kommt, ist die URL benutzbar.
for i in $(seq 1 15); do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 https://brainstorm.mentolder.de/ || echo 000)
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
```

Erst wenn Schritt e) grün ist, Patrick mitteilen: **"Brainstorming-Companion läuft unter https://brainstorm.mentolder.de (HTTP $CODE) — jetzt im Browser öffnen."**

### Schritt 3: Brainstorming

Rufe `superpowers:brainstorming` auf. Voranstellen vor dem ersten Brainstorming-Turn:

> "Visual-Companion-Server läuft bereits (Port `$PORT`). `screen_dir=$SCREEN_DIR`, `state_dir=$STATE_DIR`. Rufe `start-server.sh` nicht nochmals auf. Nenne dem User immer `https://brainstorm.mentolder.de` — niemals `http://localhost:*`."

Ergebnis: Spec in `docs/superpowers/specs/<date>-<slug>-design.md`.

### Schritt 4: Plan schreiben

Rufe `superpowers:writing-plans` auf. Führe danach sofort aus:

```bash
bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/<date>-<slug>.md
```

Ergebnis: Plan in `docs/superpowers/plans/<date>-<slug>.md`.

### Schritt 4.5: Ticket anlegen

Lege ein Ticket vom Typ `task` in der Produktionsdatenbank an und speichere die ID im Plan-Frontmatter.

```bash
# Postgres-Pod ermitteln (mentolder-Cluster)
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

# Ticket anlegen — Titel und Beschreibung aus Slug und Branch ableiten
TICKET_RESULT=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, status)
   VALUES (
     'task', 'mentolder',
     'Plan: <slug>',
     'Branch: feature/<slug>' || E'\n' || 'Plan: docs/superpowers/plans/<date>-<slug>.md' || E'\n' || 'Spec: docs/superpowers/specs/<date>-<slug>-design.md',
     'triage'
   )
   RETURNING external_id, id;")

TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)   # z.B. T000301
TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
```

Trage `ticket_id` in das Plan-Frontmatter ein (nach der ersten `---`-Zeile):

```bash
awk 'NR==1{print; print "ticket_id: '"$TICKET_EXT_ID"'"; next} 1' \
  docs/superpowers/plans/<date>-<slug>.md > /tmp/_plan_tmp.md && \
  mv /tmp/_plan_tmp.md docs/superpowers/plans/<date>-<slug>.md
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
git add docs/superpowers/specs/<date>-<slug>-design.md docs/superpowers/plans/<date>-<slug>.md
git commit -m "chore(plans): stage <slug> for execution [$TICKET_EXT_ID]"
git push -u origin feature/<slug>
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

### Schritt 3: Failing Test schreiben

Schreibe einen Test, der den Bug beweist (red-green-refactor — Pflicht):

```bash
./tests/runner.sh local <neue-test-id>
# Erwartet: FAIL
```

### Schritt 4: Plan schreiben (nicht-triviale Fixes)

Bei Einzeilern: kurze Inline-Begründung im Commit reicht — Schritt 4 überspringen (Ticket-ID trotzdem im Commit erwähnen).

Bei nicht-trivialem Fix: Rufe `superpowers:writing-plans` auf. Führe danach sofort aus:

```bash
bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/<slug>.md

# ticket_id ins Frontmatter eintragen
awk 'NR==1{print; print "ticket_id: '"$TICKET_EXT_ID"'"; next} 1' \
  docs/superpowers/plans/<slug>.md > /tmp/_plan_tmp.md && \
  mv /tmp/_plan_tmp.md docs/superpowers/plans/<slug>.md
```

### Schritt 5: Commit & Push — dann STOPP

```bash
# Immer dabei: der failing Test
git add tests/<relevante-test-datei>

# Falls ein Plan geschrieben wurde:
git add docs/superpowers/plans/<slug>.md

git commit -m "chore(plans): stage <slug> fix for execution [$TICKET_EXT_ID]"
git push -u origin fix/<slug>
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

### Schritt 3: Änderung machen

Kein Plan, kein Spec, kein TDD nötig.

### Schritt 4: Verifikation

```bash
task test:all                # MUSS grün sein
task workspace:validate      # falls Manifests betroffen
task website:dev             # falls website/src/ betroffen — Smoke-Test
```

### Schritt 5: PR

Rufe `commit-commands:commit-push-pr` auf.

- Titel: `chore(<scope>): <kurze-beschreibung>`
- Body: kurzes `## Summary` (1-2 Bullets) + `## Test plan` (was du gelaufen bist)

### Schritt 6: Auto-Merge wenn CI grün

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
task brainstorm:materialise-keys
```

### `ws://`→`wss://` Auto-Patch

```bash
bash scripts/superpowers-helper-patch.sh           # apply
bash scripts/superpowers-helper-patch.sh --check   # exit 1 if unpatched
```

### Diagnose

```bash
task brainstorm:status   # Pod-Status + curl gegen brainstorm.mentolder.de
```

---

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

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."