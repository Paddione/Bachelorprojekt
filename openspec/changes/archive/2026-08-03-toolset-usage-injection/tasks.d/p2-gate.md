---
title: "p2 gate — check.mjs erzwingt das erweiterte Schema und meldet unreviewed"
ticket_id: T002592
domains: [infra]
status: active
---

# p2 gate — scripts/toolset/check.mjs

**Besitzt ausschließlich:** `scripts/toolset/check.mjs`

**Kontrakt:** CONTRACT.md §1 (Schema), §2 (Rollen), §4 (Befund-Tabelle mit Exit-Codes).

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/toolset/check.mjs` | 64 | 800 (`.mjs`-Limit, `gates.yaml` s1.limits) |

Die Datei steht nicht in `docs/code-quality/baseline.json`; die wirksame Schwelle ist damit das
statische Limit 800. Bei 64 Ist-Zeilen und geschätzt +80 Zeilen bleibt die Reserve groß.

## Aufgaben

- [ ] **Rollen-Allowlist als Konstante.** Die sieben Rollennamen aus CONTRACT §2 plus `all` als
      eingefrorenes `Set` am Dateikopf. **Nicht** aus `plan-context.sh` parsen: die Bash-Funktion
      dort ist ein `case`-Block, dessen Parsen brüchig wäre, und die beiden Listen unterscheiden
      sich bewusst um `all`. Die Doppelung wird per Kommentar mit Verweis auf CONTRACT §2
      begründet.

- [ ] **Schema-Prüfung je Instanz.** In die bestehende Schleife über
      `Object.entries(registry.capabilities)` einhängen, nach den Bestandsprüfungen. Für jede
      Instanz mit `state === 'canonical'`:

      - fehlendes oder leeres `use_when` → Fehler, `hasError = true`
      - fehlendes `roles` oder leeres Array → Fehler
      - jeder `roles`-Eintrag außerhalb der Allowlist → Fehler, der den unbekannten Namen nennt

      Für **jede** Instanz unabhängig vom State: gesetztes `tier` außerhalb
      `{safe, caution, assisted, dangerous}` → Fehler mit dem ungültigen Wert.

      Jede Fehlermeldung nennt Capability **und** Instanz-Id, damit sie ohne Nachschlagen
      auffindbar ist — die bestehenden Meldungen in dieser Datei tun das bereits, das Format
      wird übernommen.

- [ ] **Instanzen mit `state: suppressed` von der Schema-Prüfung ausnehmen.** Das ist kein
      Nebenaspekt, sondern eine eigene Spec-Anforderung („Suppressed instance needs no usage
      semantics"): eine unterdrückte Instanz wird nie injiziert, also kann sie keine
      Nutzungssemantik brauchen. Sie über denselben Zweig laufen zu lassen würde die Registry mit
      Pflichtfeldern für Werkzeuge belasten, die niemand benutzen darf.

- [ ] **unreviewed-Report, fail-open.** `collect.mjs` als Modul importieren oder dessen
      Sammellogik aufrufen (p3 exportiert sie dafür — bis dahin gegen die heutige Ausgabe
      programmieren) und jede Instanz melden, die in keiner Capability der Registry auftaucht.
      Ausgabe je Eintrag: die Instanz-Id, das Wort `unreviewed` und der Hinweis auf den Skill
      `toolset-curate`.

      **Diese Meldung setzt `hasError` nicht.** Der SSOT-Spec verlangt ausdrücklich „SHALL still
      exit zero" — ein neu installiertes Plugin darf CI nicht rot machen, sonst wird die
      Quarantäne zur Blockade und in der Praxis umgangen.

- [ ] **Offline-Invariante wahren.** Der neue Code darf keinen Netzwerkzugriff und keinen
      Schreibzugriff einführen; `check.mjs` bleibt der offline lauffähige Gate. Insbesondere
      `toolset.lock.yaml` **nicht** lesen — der Spec schließt das explizit aus, weil der
      Lockfile-Inhalt davon abhängt, welche Dienste auf einer Maschine gerade laufen.

- [ ] **Selbstprüfung.**

```bash
node scripts/toolset/check.mjs; echo "exit=$?"
# erwartet: exit=0 gegen die reguläre Registry
TOOLSET_REGISTRY=/tmp/broken.yaml node scripts/toolset/check.mjs; echo "exit=$?"
# erwartet: exit!=0 gegen eine Fixture mit canonical ohne use_when
```
