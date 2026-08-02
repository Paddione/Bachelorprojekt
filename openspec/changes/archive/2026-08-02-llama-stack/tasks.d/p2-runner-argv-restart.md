---
title: "llama-stack P2 — runner.mjs: lokale Draft-/mmproj-Pfade und systemd-Autorestart"
ticket_id: T002459
domains: [scripts]
status: plan_staged
---

# llama-stack — Implementation Plan

Partial **P2 — Prozess-Builder**. Scope: ausschließlich `scripts/llm-proxy/runner.mjs`.
Umgesetzt werden D2 (lokaler Speculative-Draft-Pfad + mmproj-Pfad) und D3 (Autorestart über
systemd-Properties) aus `openspec/changes/llama-stack/design.md`.

Nicht in diesem Partial (andere Partials, hier nicht anfassen): `loadouts.json` (P1),
`loadouts.mjs` (P1), `server.mjs` (P3), `scripts/llm/*.ps1` (P4), Tests (P5).

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/llm-proxy/runner.mjs` | 110 | 690 |

`scripts/llm-proxy/runner.mjs` ist **nicht gebaselined**
(`jq -r '."S1:scripts/llm-proxy/runner.mjs".metric // "nicht-baselined"' docs/code-quality/baseline.json`
→ `nicht-baselined`), wirksame Schwelle ist das statische `.mjs`-Limit **800** (nicht 500 —
`docs/code-quality/gates.yaml` Zeile 62 wurde unter T002452 angehoben; Korrektur ggü. Erstfassung
dieses Partials, Befund aus Partial P3). Budget also 690, nicht 390. Die geplanten Änderungen
fügen netto ~22 Zeilen hinzu (Ziel ≈ 132 Zeilen, ~17 % der Schwelle) — kein Split, keine
Extraktion nötig.

<!-- vitest: kein neuer Test nötig, weil runner.mjs außerhalb von website/src liegt; die
     rot→grün-Absicherung für dieses Partial fährt das Test-Partial P5 per BATS/node -->

## Design-Entscheidung dieses Partials (Ergänzung zu D2)

D2 im `design.md` fordert, dass Draft-Modell und mmproj **denselben** `modelRoots`-Auflösungsweg
nehmen wie das Hauptmodell (`resolveModelPath(doc, loadout)` in `server.mjs`, Zeilen 189–197).
`buildServerArgv` kennt `doc.modelRoots` nicht und soll es auch nicht kennen — sie ist bewusst
eine reine Funktion („damit sie ohne GPU getestet werden kann", Kopfkommentar `runner.mjs`
Zeilen 1–10). Deshalb:

**Entscheidung: Signatur-Erweiterung um einen vierten Parameter `resolved` statt Import von
Auflösungslogik in `runner.mjs`.** Der Aufrufer (`server.mjs`, Partial P3) löst die Pfade auf und
reicht sie als Objekt durch. Fehlt ein aufgelöster Pfad, fällt `buildServerArgv` auf den im
Loadout konfigurierten Rohwert zurück — damit funktioniert ein **absoluter** Pfad in
`loadouts.json` auch ohne Beteiligung des Aufrufers, und die Funktion bleibt allein testbar.

**Verbindlicher Kontrakt für Partial P3 (`server.mjs`) — exakt diese Signaturen aufrufen:**

```js
buildServerArgv(loadout, modelPath, defaults, resolved)
buildStartCommand(loadout, modelPath, defaults, binPath, resolved)
startUnit(loadout, modelPath, defaults, binPath, resolved)
// resolved: { draftModelPath?: string|null, mmprojPath?: string|null }
// Beide Felder optional; `undefined`/`null` => Rückfall auf loadout.speculative.draftModelPath
// bzw. loadout.args.mmprojPath. `resolved` selbst ist optional (Default {}), damit die
// bestehenden Aufrufer und Tests unverändert weiterlaufen.
```

Abweichung von D2: die *Auflösung* bleibt bei `resolveModelPath`, wie D2 verlangt; neu ist nur,
dass D2 nicht festlegte, **wo** sie stattfindet. Dieses Partial legt es auf die Aufruferseite fest,
weil die Alternative (`modelRoots` in `runner.mjs` durchreichen) die Reinheit der argv-Funktion
zerstört, die im Dateikopf ausdrücklich als Testbarkeitsgrund dokumentiert ist.

## Task P2.1 — `buildServerArgv`: `resolved`-Parameter und lokaler Draft-Modellpfad (D2)

`--spec-draft-model <pfad>` ersetzt `--spec-draft-hf <repo>`, sobald ein lokaler Draft-Pfad
vorliegt. `draftHfRepo` bleibt als Rückfall erhalten, damit bestehende Loadouts (`gptoss-context`,
`devstral-quality`) unverändert starten. Beide gleichzeitig zu setzen ist ein Konfigurationsfehler
— der lokale Pfad gewinnt, das ist die spezifischere Angabe.

Diff-Vorschlag gegen `scripts/llm-proxy/runner.mjs` (JSDoc-Zeile 15 und Signatur Zeile 16):

```diff
-/** @returns {string[]} argv fuer llama-server, OHNE das Binary selbst */
-export function buildServerArgv(loadout, modelPath, defaults) {
+/**
+ * @param {object} loadout   Eintrag aus loadouts.json
+ * @param {string} modelPath vom Aufrufer gegen modelRoots aufgeloester Hauptmodell-Pfad
+ * @param {object} defaults  doc.defaults (host, ...)
+ * @param {{draftModelPath?: string|null, mmprojPath?: string|null}} [resolved]
+ *   Vom Aufrufer (server.mjs: resolveModelPath) aufgeloeste Nebenpfade. Diese Funktion
+ *   loest bewusst NICHT selbst auf -- sie bleibt rein und ohne GPU/Dateisystem testbar.
+ *   Fehlt ein Eintrag, gilt der Rohwert aus dem Loadout (deckt absolute Pfade ab).
+ * @returns {string[]} argv fuer llama-server, OHNE das Binary selbst
+ */
+export function buildServerArgv(loadout, modelPath, defaults, resolved = {}) {
   const a = loadout.args ?? {};
```

Speculative-Block (aktuell Zeilen 41–43) ersetzen:

```diff
   const s = loadout.speculative ?? {};
-  if (s.draftHfRepo != null) argv.push('--spec-draft-hf', s.draftHfRepo);
+  // D2: lokaler Draft-Pfad schlaegt HF-Repo. Der lokale Pfad ist die spezifischere
+  // Angabe; --spec-draft-hf wuerde daneben einen zweiten Draft-Head laden.
+  const draftPath = resolved.draftModelPath ?? s.draftModelPath ?? null;
+  if (draftPath != null) argv.push('--spec-draft-model', draftPath);
+  else if (s.draftHfRepo != null) argv.push('--spec-draft-hf', s.draftHfRepo);
   if (s.draftNgl != null) argv.push('-ngld', String(s.draftNgl));
```

Akzeptanz dieses Tasks (manuell in `node --input-type=module` prüfbar, formale Absicherung in P5):
- Loadout ohne `speculative` → argv enthält weder `--spec-draft-model` noch `--spec-draft-hf`.
- Loadout mit nur `draftHfRepo` → argv enthält `--spec-draft-hf <repo>` (unverändertes Verhalten
  für `gptoss-context`/`devstral-quality`).
- Loadout mit `draftModelPath` → argv enthält `--spec-draft-model <pfad>` und **kein**
  `--spec-draft-hf`.
- `resolved.draftModelPath` gesetzt → dieser Wert steht in argv, nicht der Loadout-Rohwert.

## Task P2.2 — `buildServerArgv`: mmproj-Pfad (D2)

`--mmproj` lädt den Vision-Tower. Das Flag gehört in den `loadout.args`-Block, weil `mmprojPath`
laut D2 ein `args`-Feld ist. Einfügen direkt nach der `reasoningBudget`-Zeile (aktuell Zeile 39),
vor dem `const s = loadout.speculative ?? {};`:

```diff
   if (a.reasoningBudget != null) argv.push('--reasoning-budget', String(a.reasoningBudget));
+
+  // D2: Vision-Tower. Pfad kommt aufgeloest vom Aufrufer; der Rohwert aus dem
+  // Loadout traegt den Fall "absoluter Pfad in loadouts.json".
+  const mmproj = resolved.mmprojPath ?? a.mmprojPath ?? null;
+  if (mmproj != null) argv.push('--mmproj', mmproj);
```

Akzeptanz:
- Loadout ohne `args.mmprojPath` und ohne `resolved.mmprojPath` → argv enthält kein `--mmproj`
  (Regressionsschutz für `gptoss-context`/`devstral-quality`).
- `a.mmprojPath` gesetzt → `--mmproj <pfad>` genau einmal in argv.
- `resolved.mmprojPath` überschreibt `a.mmprojPath`.

## Task P2.3 — `buildStartCommand`/`startUnit`: `resolved` durchreichen (D2)

Beide Funktionen bekommen den Parameter als letztes Argument, damit die bestehenden Aufrufe
(`server.mjs` Zeile 349: `startUnit(loadout, modelPath, doc.defaults, LLAMA_BIN);`) bis zum
Umbau in P3 gültig bleiben.

```diff
-export function buildStartCommand(loadout, modelPath, defaults, binPath) {
+export function buildStartCommand(loadout, modelPath, defaults, binPath, resolved = {}) {
```
```diff
-export function startUnit(loadout, modelPath, defaults, binPath) {
-  const [cmd, ...args] = buildStartCommand(loadout, modelPath, defaults, binPath);
+export function startUnit(loadout, modelPath, defaults, binPath, resolved = {}) {
+  const [cmd, ...args] = buildStartCommand(loadout, modelPath, defaults, binPath, resolved);
   execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe' });
 }
```

und im Rückgabe-Array von `buildStartCommand` die argv-Zeile anpassen:

```diff
-    ...buildServerArgv(loadout, modelPath, defaults),
+    ...buildServerArgv(loadout, modelPath, defaults, resolved),
```

Akzeptanz: `buildStartCommand(loadout, '/m.gguf', {host:'127.0.0.1'}, '/bin/llama-server')` ohne
fünftes Argument wirft nicht und liefert dieselbe argv wie vor dieser Änderung, solange das
Loadout weder `draftModelPath` noch `mmprojPath` trägt.

## Task P2.4 — Autorestart-Properties an `systemd-run` (D3)

`--property=Restart=on-failure` und `--property=RestartSec=5` müssen **vor** dem `--`-Trenner
stehen — alles danach ist das auszuführende Kommando und würde als llama-server-Argument
durchgereicht (llama-server bräche mit unbekanntem Argument ab).

```diff
 export function buildStartCommand(loadout, modelPath, defaults, binPath, resolved = {}) {
   return [
     'systemd-run', '--user',
     `--unit=${unitName(loadout.slug)}`,
     // --collect: ohne das Flag bleibt eine fehlgeschlagene transiente Unit im
     // Zustand 'failed' stehen und blockiert den Unit-Namen -- der naechste
     // Startversuch scheitert dann mit "unit already exists", obwohl nichts laeuft.
     '--collect',
+    // D3: systemd uebernimmt den Neustart nativ, kein Polling-Watchdog noetig.
+    // Zusammenspiel mit --collect (design.md D3): Restart=on-failure greift ZUERST --
+    // systemd startet neu, BEVOR die Unit den Endzustand 'failed' erreicht. --collect
+    // raeumt erst auf, wenn alle Restart-Versuche endgueltig gescheitert sind. Beide
+    // Properties widersprechen sich also nicht; die Reihenfolge (vor '--') ist Pflicht,
+    // alles nach '--' waere ein llama-server-Argument.
+    '--property=Restart=on-failure',
+    '--property=RestartSec=5',
     `--description=llama.cpp loadout ${loadout.slug}`,
     '--',
     binPath,
     ...buildServerArgv(loadout, modelPath, defaults, resolved),
   ];
 }
```

Akzeptanz (Reihenfolge ist die eigentliche Aussage, nicht bloße Anwesenheit):
- `buildStartCommand(...)` enthält `--property=Restart=on-failure` und `--property=RestartSec=5`.
- Der Index beider Properties ist **kleiner** als der Index von `'--'`.
- `--collect` bleibt erhalten und steht ebenfalls vor `'--'`.
- Die argv nach `'--'` beginnt weiterhin mit `binPath`, gefolgt von `-m <modelPath>`.

## Task P2.5 — Live-Verifikation der D3-Nebenwirkung am GPU-Host

Diese Prüfung ist in `design.md` D3 ausdrücklich verlangt („im Test explizit zu verifizieren")
und lässt sich nicht offline abbilden — sie läuft gegen `gptoss-context`, **nicht** gegen Gemma
(Migration Plan Schritt 3: „ohne Gemma anzufassen"). Reihenfolge:

1. Loadout starten: `curl -sS -XPOST http://127.0.0.1:18235/admin/loadouts/gptoss-context/start`
2. Property am laufenden Unit bestätigen:
   `systemctl --user show llama-gptoss-context.service --property=Restart,RestartSec,NRestarts`
   → erwartet `Restart=on-failure`, `RestartSec=5s`.
3. Neustart erzwingen: `systemctl --user kill -s SIGKILL llama-gptoss-context.service`,
   nach ~10 s erneut `--property=NRestarts` abfragen → Wert muss gestiegen sein, `ActiveState`
   wieder `active`.
4. `--collect`-Aufräumung: Loadout mit absichtlich falschem `-m`-Pfad starten (temporärer
   Loadout-Eintrag oder direkter `systemd-run`-Aufruf mit der von `buildStartCommand` erzeugten
   argv), bis die Restart-Versuche erschöpft sind; danach
   `systemctl --user show llama-<slug>.service --property=LoadState` → `not-found`
   (Unit weggeräumt, Name wieder frei). Das ist der Beleg, dass `Restart=on-failure` die
   `--collect`-Aufräumung nur verzögert, nicht verhindert.
5. Aufräumen: `curl -sS -XPOST http://127.0.0.1:18235/admin/loadouts/gptoss-context/stop`,
   temporären Loadout-Eintrag entfernen.

Ergebnis dieses Tasks wird als Notiz im PR-Body festgehalten (Kommandos + beobachtete Werte für
`NRestarts` und `LoadState`), weil er nicht durch CI reproduzierbar ist.
