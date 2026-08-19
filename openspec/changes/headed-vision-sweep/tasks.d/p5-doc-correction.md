# p5 — Den falschen Vision-Pfad ersetzen

Ziel: der beschriebene Weg zum Vision-Modell stimmt mit dem tatsächlichen überein. Betroffen:
`.claude/skills/dev-flow-e2e/SKILL.md`, `tests/e2e/specs/k8-headed-verify.spec.ts`.

Der Befund: beide Stellen adressieren Port 8094 mit 8091 als Rückfall. In
`scripts/llm/loadouts.json` gibt es keinen Eintrag für 8094, und das Loadout auf 8091
(`gemma26-factory`) trägt in seinen eigenen `notes` den Satz „Kein mmproj" — es kann keine
Bilder verarbeiten. Der Aufruf ist als „best-effort" gebaut und notiert Fehler nur als
Annotation, weshalb er seit T002467 wirkungslos ist, ohne je aufzufallen.

## Aufgaben

- [x] **Schritt 8.5 im Skill korrigieren.** Der Auswahlbefehl, der zwischen 8094 und 8091 wählt,
      wird durch die Abfrage des Proxys ersetzt:

      ```bash
      curl -sf -m 3 http://127.0.0.1:18235/v1/models \
        | grep -q gemma12-vision && echo "Vision verfuegbar" \
        || echo "kein Vision-Endpunkt — Punkt 3 ueberspringen"
      ```

      Dazu ein Satz, der sagt, warum nicht direkt auf 8089 gegangen wird: der Server läuft auf
      dem Windows-GPU-Host und ist aus WSL nicht erreichbar.

- [x] **Den toten Aufruf in `k8-headed-verify.spec.ts` umhängen.** Vorgabe für `K8_VISION_URL`
      wird der Proxy-Endpunkt, und die Anfrage trägt das Feld `model` — ohne das trifft sie beim
      Proxy kein Backend. Die Prüfung bleibt best-effort und bleibt außerhalb von CI
      (`test.skip(!!process.env.CI, …)` unverändert).

- [x] **Den Prosa-Text im Kopf des Spec mitziehen.** Die Kommentarzeile nennt Port 8094
      ausdrücklich; bleibt sie stehen, ist der nächste Leser wieder auf demselben Irrweg.

- [x] **Die Frage stellen, ob der Aufruf leise scheitern darf.** Er darf — aber die Annotation
      muss zwischen „Endpunkt nicht erreichbar" und „Endpunkt antwortete, Alias fehlt"
      unterscheiden. Ohne diese Unterscheidung wiederholt sich genau der Vorfall, den dieses
      Partial behebt.
