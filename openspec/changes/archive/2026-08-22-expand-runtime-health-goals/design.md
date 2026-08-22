# Design: Runtime-nahe Repository Health Goals

## Context

`scripts/health-goals-check.sh` ist der ausführbare Messkatalog, während
`.claude/lib/goals.md` das menschenlesbare Register und die Baseline enthält. Der nächtliche
Workflow besitzt bereits `kubectl`-Zugang zum Fleet-Cluster. Prometheus läuft im Namespace
`monitoring`; Flux verwaltet die produktiven Kustomizations und OCI-Artefakte. axe und
Lighthouse sind bereits vorhanden, werden jedoch nicht als dauerhaft messbare Health Goals
ausgewertet.

Die neuen Ziele verbinden vier Ebenen:

```text
origin/main -> signiertes OCI -> Flux Ready -> Pods/PVCs -> Prometheus -> HTTP/Browser
                                G-FLUX01     G-CAP01    G-OBS01    G-SLO01
                                                                  G-FE05
                                                                  G-A11Y01
```

## Decisions

### 1. Messlogik wird gekapselt

Ein neues read-only Messwerkzeug unter `scripts/lib/` liefert pro Subcommand genau eine ganze
Zahl oder `-`. `health-goals-check.sh` bleibt für Vergleich, Darstellung und `--only`-
Routing zuständig. Dadurch lassen sich Kubernetes-, Prometheus- und Browser-Antworten als
Fixtures testen, ohne einen Live-Cluster vorauszusetzen.

Alle Subcommands verwenden positive Anker. Eine nicht erreichbare API, eine fehlende CRD,
eine leere unerwartete Antwort oder ein nicht parsebares Ergebnis wird `-`, niemals `0`.

### 2. G-FLUX01 misst Controller-Zustand, nicht Pod-Zustand

Die Messung liest alle aktiven Flux-Kustomizations und Sources im Cluster und zählt Ressourcen,
deren aktuelle `Ready`-Condition nicht `True` ist oder deren beobachtete Generation hinter der
Metadaten-Generation liegt. Bewusst suspendierte Ressourcen werden nicht stillschweigend grün:
produktive Ressourcen zählen als Verletzung; explizit als nicht-produktiv gekennzeichnete
Ressourcen dürfen über eine dokumentierte Auswahl ausgeschlossen werden.

Target: `0`, Messzyklus täglich.

### 3. G-OBS01 und G-CAP01 verwenden Prometheus als Runtime-Quelle

G-OBS01 fragt die Prometheus HTTP API nach `up == 0` ab. Nur aktive Targets werden betrachtet;
eine leere Kandidatenmenge ist wegen des positiven Ankers nicht erfolgreich. G-CAP01 verwendet
`kubelet_volume_stats_available_bytes / kubelet_volume_stats_capacity_bytes` und zählt gemountete
PVCs in den produktiven Brand-Namespaces unter 20 Prozent freiem Speicher. Ephemere Volumes
und Volumes ohne Kapazitätsmetrik sind nicht als gesund zu erfinden; fehlende Metrikbasis ergibt
`-` und wird separat im Fixture-Test sichtbar.

Targets: jeweils `0`, Messzyklus täglich.

### 4. G-A11Y01 verwendet dieselbe Routenauswahl wie der bestehende axe-Test

Die kanonischen Brand-Routen bleiben in einer einzigen auswertbaren Quelle definiert. Die
Messung summiert `critical`- und `serious`-Violations über beide Brands und liefert die Zahl der
Regelverletzungen, nicht bloß den Exit-Code des Testprozesses. Navigation-, Browser- oder
Parsingfehler ergeben `-`; sie dürfen keine scheinbare Null erzeugen.

Target: `0`, Messzyklus täglich. Die Prüfung bleibt ein Reduktionsziel und wird nicht nebenbei
zum neuen PR-Merge-Gate erklärt.

### 5. G-FE05 liest Lighthouse JSON statt Konsolenprosa

Der aktuelle `grep` auf `lhci autorun`-Ausgabe ist versions- und formatabhängig. Die reparierte
Messung sammelt einen JSON-Report, prüft das Vorhandensein von
`categories.performance.score`, multipliziert den Wert mit 100 und rundet deterministisch auf
eine ganze Zahl ab. Beide Brands werden gemessen; der niedrigere Score ist der Zielwert.

Target: `>= 90`, Messzyklus täglich. Fehlender Browser, Timeout, unvollständiger Report oder
nicht erreichbare URL ergibt `-`.

### 6. G-SLO01 beruht auf kontinuierlichen synthetischen Probes

Eine tägliche Einzelmessung ist keine Verfügbarkeits-SLO. Daher werden Prometheus-Probes für
die öffentlichen Health-Endpunkte beider Brands etabliert beziehungsweise ihre vorhandene
Abdeckung verifiziert. G-SLO01 liest den kleineren Sieben-Tage-Mittelwert von `probe_success`
beider Endpunkte, multipliziert ihn mit 1000 und vergleicht ganzzahlig gegen `995` (= 99,5 %).
Die PromQL-Auswahl muss beide erwarteten Brand-Zeitreihen finden; fehlt eine davon oder ist das
Fenster noch nicht ausreichend gefüllt, lautet das Ergebnis `-`.

Target: `>= 995`, Messzyklus täglich. Die Anzeige formatiert den Wert als Prozentwert, ohne die
ganzzahlige Kernlogik von `row()` zu verändern.

## Risks and mitigations

- **Prometheus aus GitHub Actions nicht direkt erreichbar:** Queries werden read-only über
  einen kurzlebigen `kubectl proxy`/Port-Forward oder `kubectl exec` gegen den Cluster-Service
  ausgeführt; Zugangsdaten werden nicht ausgegeben.
- **Cardinality und Systemtargets bei G-OBS01:** Fixture-Tests fixieren den Selector und die
  dokumentierten Ausschlüsse. Neue Ausschlüsse benötigen einen begründeten Test.
- **Browserlauf verlängert den Nightly-Job:** Browserinstallation und Audits laufen nur bei
  angeforderten IDs und im Full-Scan, nie unter `--fast`.
- **Neue SLO startet ohne sieben Tage Historie:** Bis genügend Samples vorhanden sind, bleibt
  G-SLO01 sichtbar `n/a`; es wird keine künstliche Baseline angenommen.
- **Temporäre Netzwerkfehler:** begrenzte Timeouts und höchstens ein Retry verhindern sowohl
  endloses Warten als auch das Kaschieren längerer Ausfälle.

## Validation strategy

Fixture-basierte BATS-Tests decken für jede Messfamilie mindestens gesund, verletzt und nicht
messbar ab. Ergänzend prüfen bestehende ID-Paritäts- und Messintegritätstests Register,
`row`-Aufrufe und Delta-Spec. Live-Probes werden read-only ausgeführt; der Change setzt keine
Gesundheitswerte von Hand auf grün.
