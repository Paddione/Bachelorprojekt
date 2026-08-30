---
title: backend-switch — exklusiver GPU-Wechsel FreeToken/LM Studio mit Session-Compact
ticket_id: T900010
domains:
  - bachelorprojekt-infra
  - bachelorprojekt-ops
status: plan_staged
---

# backend-switch für den exklusiven GPU-Wechsel — Implementation Plan

## File Structure

| Datei | Änderung |
|---|---|
| `tests/spec/fleet-operations/backend-switch.bats` | neu — Guards für Ignore-Eintrag, Argument-Sicherung, Timeout-Verhalten |
| `.gitignore` | `.workdir/` ergänzen — **vor** dem ersten Dump |
| `scripts/llm/backend-switch.ps1` | neu — Umschaltlogik beider Richtungen (ASCII-Pflicht, T002495-M7) |
| `scripts/llm/backend-switch-lib.ps1` | neu — Port-Ermittlung, Zustandsdatei, Wiederaufnahme |
| `docs/runbooks/freetoken-native.md` | Abschnitt zum Wechsel und zu den beiden Fallen des alten Skripts |
| `.opencode/agent-models.jsonc` | Vision-Subagent auf `lmstudio/...` ergänzen (eigener Handle, bestehende unangetastet) |

## Task 1 — Failing Tests schreiben (RED)

`tests/spec/fleet-operations/backend-switch.bats` neu anlegen mit drei Guards, die den
Sollzustand beschreiben und gegen den heutigen Stand fehlschlagen:

1. **`.workdir/` ist ignoriert.** Prüft, dass `git check-ignore -q .workdir/session-dumps/x.json`
   erfolgreich ist. Schlägt heute fehl, weil der Eintrag nicht existiert.
2. **Das Skript sichert die echte Kommandozeile.** Prüft, dass `backend-switch.ps1` die
   Argumente aus dem laufenden Prozess liest und nicht aus einer Konstanten — konkret, dass
   es weder `--expert-load` noch `--cors-origins` als Literal enthält.
3. **Timeout ist konfigurierbar und endlich.** Prüft, dass ein Wartelimit existiert und der
   Abbruchpfad einen von Null verschiedenen Exit-Code liefert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/backend-switch.bats
# expected: FAIL — alle drei Guards schlagen fehl, weil weder .gitignore-Eintrag noch Skript existieren
```

Verfügbarkeits-Guard für Tests, die PowerShell brauchen:
`command -v pwsh >/dev/null 2>&1 || skip "pwsh not installed"` — vorher prüfen, ob CI das
bereitstellt (`grep -rn 'pwsh\|powershell' .github/workflows/`); ohne Treffer misst der Test
sonst die Runner-Ausstattung statt des Codes.

## Task 2 — Ignore-Eintrag und Verzeichniskonvention

`.workdir/` in `.gitignore` aufnehmen, **bevor** irgendein Dump geschrieben wird. Das Repo ist
public; Session-Dumps enthalten Gesprächsinhalte.

Struktur festlegen: `.workdir/session-dumps/<sessionID>.json` für die Exporte,
`.workdir/backend-switch-state.json` für den Wechselzustand (siehe Task 4).

## Task 3 — Auslöser aus OpenDesign klären und festlegen

**Recherche vor Implementierung, kein Rateschritt.** Der OpenDesign-Daemon
(`resources/app/prebundled/daemon/chunks/server-NJQOALF6.mjs`) enthält 213 Vorkommen von
`lifecycle`, 39 von `hook` und 6 von `onComplete`, aber kein `preRun`/`postRun`. Zu klären ist,
ob davon etwas **nutzerkonfigurierbar** ist.

Ergebnis entscheidet die Bauform:

- **Hook vorhanden** → Switch als Hook registrieren, sauberste Variante.
- **Kein Hook** → Wrapper, der den OpenDesign-Aufruf umschließt.
- **Fallback in beiden Fällen**: `lms load --ttl <sekunden>` entlädt bei Inaktivität; ein
  Watcher schaltet dann zurück, damit die GPU nicht belegt bleibt, wenn der Abschluss nie
  gemeldet wird.

Die gewählte Variante samt Begründung gehört ins Runbook (Task 6).

## Task 4 — backend-switch implementieren

Zwei Richtungen, ausschließlich über die verifizierten Schnittstellen.

**`to-gemma`:**

1. opencode-API-Port über den Listener des `opencode.exe`-Prozesses ermitteln. Bei mehreren
   Instanzen definiert abbrechen statt zu raten.
2. `GET /api/session/active` — aktive Sessions.
3. Warten, bis keine Session mehr aktiv ist, mit konfigurierbarem Limit. Bei Überschreitung:
   Abbruch mit Exit ≠ 0, **laufendes Backend unangetastet**. `POST /api/session/{id}/interrupt`
   ist der ausdrücklich anzufordernde Notausgang, nicht das Standardverhalten.
4. `POST /api/session/{id}/compact` je Session.
5. `opencode export <id>` → `.workdir/session-dumps/<id>.json`.
6. `GET :1900/engine/status` **und** die vollständige Prozess-Kommandozeile der Engine-PID
   sichern → `.workdir/backend-switch-state.json`. Das ist die einzige Quelle für die Rückkehr.
7. `POST :1900/engine/stop`, auf `drainComplete` prüfen, VRAM-Freigabe verifizieren.
8. `lms load` des Vision-Modells, Bereitschaft über `:1234/api/v0/models` bestätigen
   (`state: loaded`).

**`to-freetoken`:** `lms unload` → `POST :1900/engine/start` mit den gesicherten Werten →
warten bis `/health` `maintenance=serving` meldet → Zustandsdatei aufräumen.

**Wiederaufnahme:** Die Zustandsdatei hält fest, in welcher Phase der Wechsel steht. Bricht er
zwischen Stop und Load ab, ist die GPU leer; ein erneuter Aufruf muss aus der Datei erkennen
können, was fehlt, und den Sollzustand herstellen — statt blind zu wiederholen.

**ASCII-Pflicht:** `.ps1`-Dateien in `scripts/llm/` müssen reines ASCII ohne BOM sein und vor
dem Commit den Parser-Check bestehen (T002495-M7, siehe `scripts/llm/CLAUDE.md`).

## Task 5 — Vision-Subagent für opencode

In `.opencode/agent-models.jsonc` einen Subagenten auf den bestehenden `lmstudio`-Provider
(`.opencode/opencode.jsonc`, `http://127.0.0.1:1234/v1`) ergänzen.

**Als eigenen Handle** (etwa `gemma26-vision`), nicht durch Überschreiben von `gemma`/`gemma12`
— die fünf bestehenden Handles zeigen alle auf `freetoken-local/active` und bleiben unangetastet.

Bei der Gelegenheit den irreführenden Kommentar über `gemma12` korrigieren: er behauptet,
das Loadout sei „das EINZIGE mit Vision (mmproj-F16)", während der Eintrag darunter
`Text-only` deklariert. Das beschriebene llama.cpp-Loadout ist stillgelegt.

Ebenfalls in einer Zeile festhalten, dass die fünf lokalen Handles dieselbe Instanz bedienen —
sonst liest sich die Liste wie Modellvielfalt, die es nicht gibt.

## Task 6 — Runbook

`docs/runbooks/freetoken-native.md` um einen Abschnitt zum Backend-Wechsel erweitern:

- Die **beiden Fallen** des alten Skripts mit Belegen: `-Stop` findet eine von der Desktop-App
  gestartete Engine nicht (sie läuft als `python.exe` unter einem `ft.exe daemon`) und meldete
  „gestoppt", während 15,5 GB VRAM belegt blieben; und der Neustart über das Skript setzt
  `--expert-load parallel`, `--moe-cpu-threads 8` und die Tauri-CORS-Origins **nicht**.
- Die verwendeten Endpunkte, damit sie ohne das Werkzeug nachvollziehbar sind:

  ```bash
  curl -sS http://127.0.0.1:1900/engine/status
  curl -sS -X POST http://127.0.0.1:1900/engine/stop
  curl -sS -X POST http://127.0.0.1:1900/engine/start \
    -H 'Content-Type: application/json' --data-binary @state.json
  ```

- Die Abgrenzung, warum der Dump **Backup und nicht Rettung** ist: opencode-Sessions überleben
  den Engine-Neustart, verloren geht nur der Radix-Prefix-Cache. `opencode import` erzeugt eine
  neue Session und setzt die alte nicht fort.
- Der in Task 3 gewählte Auslöser mit Begründung.

## Task 7 — Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu ein echter Wechsel in beide Richtungen gegen die laufende Umgebung, mit Beleg statt
Behauptung:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/backend-switch.bats
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader   # vor/nach jedem Wechsel
curl -sS http://127.0.0.1:1919/health        # nach to-freetoken: maintenance=serving
git status --porcelain | grep -c '^?? \.workdir' # erwartet: 0
```

Abnahmekriterium: Beide Richtungen laufen durch, die zurückkehrende Engine trägt dieselben
Argumente wie vor dem Wechsel (Vergleich der Prozess-Kommandozeile gegen die Zustandsdatei),
und kein Dump erscheint in `git status`.
