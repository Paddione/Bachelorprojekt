---
ticket_id: T002458
plan_ref: null
status: active
date: 2026-07-28
---

# SDLC Cockpit — Entscheidungen und Design K1

> Dieses Dokument hat **zwei Teile**. Der vordere hält die Epic-weiten Entscheidungen (E1–E22)
> aus dem Brainstorming zu **T002458** fest — sie gelten für alle Kinder K1–K9 und sind beim
> Anlegen jedes Kind-Tickets die Bezugsquelle. Der hintere Teil ist die ausgearbeitete Spec für
> **K1** (Lavish Design-Kit & Panel-Kontrakt), das einzige Kind, das alle anderen blockiert.
>
> Der LLM-Stack wurde bewusst herausgelöst und ist als eigenes Epic **T002459** erfasst (E19).

## Ausgangslage (erhoben 2026-07-28)

Das bestehende `.lavish/opencode-cockpit.html` (52 KB, standalone HTML+CSS+JS) hat zwei
strukturelle Lücken gegenüber dem, was T002458 beschreibt:

1. **„Datenquellen (alle live)" trifft nicht zu.** Tatsächlich live sind genau zwei:
   - `fetch('https://api.github.com/repos/Paddione/Bachelorprojekt/actions/runs?per_page=8')`, 60 s
   - Localhost-Port-Check der AI-Dienste, 30 s
   Tickets, Factory, K8s/FluxCD, Worktrees, PRs, Agent-Sessions und Commits sind **hartkodierte
   JS-Arrays** — Snapshot vom Zeitpunkt des Schreibens. Die Ticket-Tabelle nennt sie „manuell",
   die Überschrift behauptet „alle live".
2. **Der Port-Check ist unzuverlässig.** Er nutzt `fetch(..., {mode:'no-cors'})` und wertet jede
   nicht abgelehnte Verbindung als `online`. Ein Dienst, der 500er liefert, gilt als gesund.

Beides ist strukturell bedingt: Eine `file://`-Seite kann kein `kubectl`, `gh-axi`, `git` oder
`agent-lock.sh` ausführen und erreicht wegen CORS keinen MCP-Server. **Ohne lokalen Prozess sind
echte Livedaten nicht erreichbar** — Agentensteuerung erst recht nicht.

### Bereits vorhandene Bausteine (nicht neu bauen)

| Vorhanden | Ort | Bedeutung fürs Cockpit |
|---|---|---|
| Zweites Cockpit | `website/src/pages/admin/cockpit.astro` + `components/admin/Cockpit.svelte` (156 Z.) | Paralleler Bau, gleicher Name, überlappender Inhalt |
| Ticket-/Portfolio-API **inkl. Schreibaktionen** | `website/src/pages/api/admin/cockpit/` — `portfolio`, `feature-action(s)`, `reorder`, `reparent`, `batch`, `suggest` | Deckt Ticket-Board + Umsortieren ab |
| Cluster-API | `website/src/pages/api/admin/cluster/` — `graph`, `logs`, `pods-list`, `warnings` | Deckt K8s-Panels ab |
| Factory-Steuerung | `website/src/pages/api/admin/factory-control.ts` | Deckt Factory-Aktionen ab |
| Agent-Push | `website/src/pages/api/admin/agent-push/` | Agent-Anbindung |
| Deployments | `website/src/pages/api/admin/deployments.ts` | Deploy-Panel |
| Mobile-CSS (alt) | `website/src/styles/mobile-cockpit.css` | Vorlage oder Altlast — in K1 zu klären |

**Konsequenz:** Der lokale Daemon erfindet **kein eigenes API**, sondern spricht denselben Vertrag
wie `/api/admin/*`. Der spätere Umzug ins Admin ist dann ein Wechsel der Base-URL, kein Rewrite.

### Lavish-Boards: Duplikationsbefund

| Datei | Größe | CSS-Zeilen |
|---|---|---|
| `opencode-cockpit.html` | 52 726 B | 213 |
| `admin-foundation-brainstorm.html` | 18 669 B | 75 |
| übrige 8 Boards | 4–23 KB | 7–12 |

Kein gemeinsames Stylesheet, keine geteilte JS-Datei. `lavish-axi` liefert eine Basis; alles
Ambitionierte wird bespoke. Einziger echter Konventions-Anker: `data-lavish-question` (21
Vorkommen) — der Annotations-Haken für Feedback.

## Getroffene Entscheidungen

| # | Frage | Entscheidung | Begründung / Konsequenz |
|---|---|---|---|
| E1 | Wo läuft das Cockpit? | **Zunächst Standalone-HTML + lokaler Daten-Daemon**; nach Epic-Abschluss ins Admin-Menü auf den heutigen Platz von *Pipeline* | Datenschicht muss von Anfang an hinter einem **Adapter** liegen (`data.tickets()`, nie `fetch('http://127.0.0.1:…')` im Panel), sonst ist der Umzug ein Rewrite |
| E2 | Verhältnis der beiden Cockpits | **SDLC-Cockpit wird die Dachfläche**; `Cockpit.svelte` und `pipeline.astro` gehen als **Panels** darin auf | Ein Ort für den ganzen Zyklus; beseitigt die heutige Doppelung „zwei Seiten namens Cockpit" |
| E3 | Flächenorganisation | **Fokus-Spalte + Arbeitsbereich** (nicht Kachelwand, nicht Phasen-Workspaces) | Links schmale, immer sichtbare Statusleiste; rechts 1–3 groß aufgezogene Panels |
| E4 | Mobile | **Pflicht, mit eigenen Bedienelementen** | E3 ist dieselbe Struktur wie ein Mobile-Layout, nur nebeneinander: Rail → obere Leiste/Bottom-Sheet, Arbeitsbereich → Ein-Panel-Stack. Ein Panel muss in **drei Größen** funktionieren: Rail-Zeile · Karte · Vollbild |
| E5 | Steuerungstiefe | **Voller Lebenszyklus inkl. Eingriff** — Agent-Session killen, Worktree entfernen, Ticket-Status setzen, PR mergen, Lock brechen | Braucht Bestätigungsdialoge, Audit-Log und harte Lesen/Schreiben-Trennung im Daemon. Mobil ist ein Fehlgriff teuer → eigene Absicherung nötig |
| E6 | **Leitprinzip:** Epic-Sichtbarkeit | **Jedes angelegte Epic ist ab Erstellung bis zum Abschluss durchgehend im Dashboard sichtbar** und in der Fokus-Spalte verankert | Nicht nur „wird angezeigt": das Epic ist eine **dauerhafte Arbeitsfläche**, die es von der Idee bis zum gestagten OpenSpec-Plan begleitet |
| E7 | Epic-Arbeitsfläche | **Panel *und* Vollfläche** — derselbe Canvas, zwei Darstellungsgrößen | Panel für nebenbei (Live-Lage bleibt sichtbar), Vollfläche für konzentriertes Arbeiten. Ein Zustand, ein Vertrag, zwei Layouts |
| E8 | Epic als Planungswerkzeug | Der Canvas trägt die Kette **Brainstorming → Grilling → Verfeinerung → OpenSpec-Entwurf → staged** | Macht die vorhandene, verstreute Maschinerie sichtbar und bedienbar statt sie neu zu erfinden: `record_grill_answers`, `triage_ticket`, `set_plan_meta`, `stage_plan`, `openspec propose/apply` |
| E9 | Lavish-Template zuerst | **Ja** — das Kit entsteht vor allem anderen, damit Boards nichts mehr von Grund auf neu bauen | Kit hat **drei Konsumenten**: Lavish-Boards (heute), Cockpit (jetzt), Astro-Admin (nach K7). Gleiches SSOT-Muster wie `mcp.yaml` für die drei Harness-Configs |
| E10 | Panel-Arten (Ausgangspunkt) | **Status-Panel** (zustandslos, pollt, wird überschrieben) und **Canvas-Panel** (editierbar, ungespeicherte Änderungen, überlebt Reload) | Ein Refresh darf **niemals** Eingaben verlieren. Ein nur für Status-Panels entworfener Vertrag macht den Canvas später zum Fremdkörper. **Später erweitert:** E12 ergänzt **Strom** (append-only), E21 ergänzt **Terminal** (bidirektional) — der endgültige Vertrag umfasst **vier** Typen, siehe Design-Abschnitt 2.1 |
| E11 | Themes als Datenschicht | Tokens austauschbar, keine hartkodierten CSS-Werte | Vorbedingung für K9 (Stil-Datenbank); kostet in K1 fast nichts, nachträglich teuer |
| E12 | „Features beim Entstehen sehen" | **Beides, getrennt**: (a) **Etappen-Panel** als Dauerbegleiter in der Fokus-Spalte — Phase, Partial, Dauer, letzter Meilenstein aus `tickets.factory_phase_events`, Ticket-Status, Commits, PR-Zustand; (b) **Mitlese-Panel** für den live strömenden Agenten-Output, gezielt zu öffnen wenn etwas hängt | Dauerzustand bleibt ruhig, Detailblick bleibt verfügbar. **Erzwingt einen dritten Panel-Typ:** neben Status (Zustand, idempotent nachladbar) und Canvas (editierbar, persistent) nun **Strom** (append-only, Lücken = Datenverlust, eigenes Scroll-/Fehler-/Refresh-Verhalten). Ereignisquelle für (b) noch offen — Kandidaten: Telemetry-SQLite (`opencode-telemetry`), Token-Tracker, opencode-Session-Logs |
| E13 | Wo lebt der Canvas-Inhalt? | **Eigener Canvas-Store**, aus dem heraus in Spec, Ticket-Felder und OpenSpec exportiert wird | Bewusst gewählt trotz benannten Drift-Risikos. **Daraus folgt eine Pflichtanforderung an K5:** die Richtung der Wahrheit muss explizit festgelegt und Auseinanderlaufen erkennbar sein — sonst wiederholt sich das Drift-Muster von Pocket-ID-Clients (`pocket_id.oidc_clients` vs. UI) und den MCP-Configs (Registry vs. handgepflegte Configs). Offen: ein- oder beidseitig (→ OF1) |
| E14 | Prototypen ernten | Nach Projektabschluss werden Prototypen in **wiederverwendbare Komponenten zerlegt**, die zugleich als **Geschmacks-/Farbbeispiel** dienen | Schließt den Kreis zum Kit: fertige Arbeit fließt zurück, statt als Einzelstück liegenzubleiben. Zwei Rollen pro geernteter Komponente — funktionaler Baustein *und* Stilreferenz. Erfordert in K1 einen definierten **Beitragspfad ins Kit** (wie kommt etwas rein, was muss es erfüllen) und speist K9 mit eigenem Material, bevor externe Quellen dazukommen |
| E15 | Richtung der Wahrheit | **Canvas bleibt bis Projektabschluss maßgeblich**; Exporte erzeugen die Artefakte neu | Bewusst gewählt. **Bekannte Folge, in K5 zu entschärfen:** Agenten und CI verändern `openspec/changes/<slug>/`-Dateien *während* der Umsetzung (Task-Häkchen, Delta-Korrekturen) — ein blinder Voll-Überschreib zerstört diesen Fortschritt. Abzuleitende Pflicht für K5: **Eigentumsgrenze pro Artefaktteil** (was gehört dem Canvas, was der Umsetzung) und **Erkennung fremder Änderungen vor dem Export**, statt still zu überschreiben. Zusätzlich zu prüfen: `ticket_plans` ist nach bisherigem Kenntnisstand repo-weit leer — Pläne leben als Branch-Dateien; ein Canvas-Store darf sich nicht auf diese Tabelle stützen |
| E16 | Marken-Umfang | **Nur `mentolder`**; `korczewski` bleibt bewusst außen vor | Hintergrund: getrennte Ticket-DBs, in denen dieselbe `external_id` zwei verschiedene Vorgänge bezeichnet — eine gemeinsame Ansicht wäre bei Schreibaktionen (E5) verwechslungsgefährlich. **Kostenlose Absicherung gegen späteres Nachrüsten (Design-Entscheidung, keine offene Frage):** die Adapter-Schnittstelle führt `brand` von Anfang an als Parameter, fest verdrahtet auf `mentolder`. Eine spätere Öffnung ist dann eine Konfigurationsänderung statt eines Eingriffs in jedes Panel |
| E17 | Absicherung der Schreibmacht | **Getrennte Pfade**: Lesen frei erreichbar, jede Schreibaktion verlangt ein lokales Token (beim Start in eine Datei mit engen Rechten geschrieben, vom Cockpit beim Laden geholt); **jede** Schreibaktion ins Audit-Log mit Zeitstempel, Aktion, Ziel | Verschärfender Umgebungsfaktor: WSL läuft mit `networkingMode=mirrored` und teilt den Netzstack mit Windows — ein Dienst auf `127.0.0.1` ist damit **auch von Windows-Prozessen erreichbar**. „Nur localhost" trägt hier weniger als anderswo. Der Daemon erbt `kubeconfig`, `gh`-Token und Git-Zugang und bündelt damit mehr Autorität als jedes einzelne heutige Werkzeug im Repo |
| E18 | Sichtbare/steuerbare Agenten | **Alles, was ein Agent-Lock hält** (harness-neutral: Factory, opencode, Claude Code) **plus die lokalen Modell-Server als eigene Panel-Gruppe** — GPU-Auslastung, geladene Modelle, Slots, Kontextbudget | `agent-lock.sh` ist die gemeinsame Registrierstelle. **Bekannte Schwäche:** das Lock-Protokoll ist zickig (SID wechselt pro Aufruf, tote Locks bleiben liegen solange der Worktree steht) — was sich nicht registriert, bleibt unsichtbar. Die Modell-Ebene ist **nur Anzeige und Bedienung**; gebaut wird sie im eigenen Epic (E19) |
| E19 | LLM-Stack | **Eigenes Epic — angelegt als T002459** („EPIC: Lokaler llama.cpp-Stack — Speichersicherheit, Modell-Routing und Harness-Integration"), nicht Kind von T002458 | Design-Kit und CUDA-Speicherverwaltung haben keine gemeinsame Abnahme. Bezug zum Cockpit ausschließlich über E18: das Cockpit *beobachtet und bedient* den Stack, es baut ihn nicht |
| E20 | Gestalterische Richtung | **Kontrollraum: Hierarchie statt Gleichförmigkeit** — dunkel, aber serifenlose UI-Schrift für Beschriftungen/Navigation und **Monospace ausschließlich für Daten** (IDs, Zahlen, Pfade, Logs); gestaffelte Flächen statt einer flachen Ebene; **ein** Interaktionsakzent, Statusfarben nur für Status; Bewegung nur wo sie etwas mitteilt | Ausgangszustand: GitHub-Dark, **alles** Monospace, 0.6–0.95 rem, flach, sechs gleich laute Akzentfarben. Beide Lesbarkeitsbremsen sind bewusst zu beseitigen — gleichbreite Glyphen ohne Wortbild sind für Beschriftungen langsamer zu erfassen, und sechs gleichrangige Akzente machen Farbe zur Dekoration statt zum Signal. Bei der geplanten Dichte („jede Schnittstelle sichtbar") ist Hierarchie die Bedingung dafür, dass Dichte nicht in Unauffindbarkeit umschlägt |
| E21 | Terminal im Cockpit | **Eingebettetes Terminal für Harness-Sitzungen in erster Person.** Verhalten: **an bestehende tmux-Sitzung andocken, sonst neue Sitzung starten** (tmux ist Hauptweg, eigener Prozess nur Rückfallebene) | **Vierter Panel-Typ** neben Status/Canvas/Strom: bidirektional, rohe Tastenbehandlung, `SIGWINCH` bei Größenänderung, hängt an einem lebenden Prozess. Nutzen des tmux-Wegs: Sitzung überlebt Browser-Reload und Verbindungsabbruch, ist vom Handy fortsetzbar, und im normalen Terminal gestartete Sitzungen werden erreichbar. **Zwei harte Folgen:** (1) das Standalone-Versprechen fällt — ein Terminal-Emulator im Frontend und ein Pseudo-Terminal im Daemon bedeuten eingebettete Bibliothek oder Build-Schritt; (2) **ausnahmslos** hinter dem Schreib-Token aus E17, denn eine Shell ist jede Schreibaktion gleichzeitig — auf einem Endpunkt, der wegen `networkingMode=mirrored` auch von Windows-Prozessen erreichbar ist |
| E22 | Technische Form des Kits | **Getrennte Schichten (Variante A)**: Tokens + Dokument-Bausteine als **reines CSS ohne JS**, per einer Zeile von jedem handgeschriebenen Board einbindbar; die Panel-Laufzeit (vier Typen, später Layout-Engine) als eigenes JS-Modul nur fürs Cockpit | Vorausgehende Erkenntnis: Boards und Cockpit brauchen **nicht dasselbe**. Ein Board ist ein **Dokument** (Überschriften, Fließtext, Tabellen, Entscheidungsblöcke, Frage-Marker), das Cockpit eine **Panel-Fläche**. Gemeinsam ist nur die unterste Schicht. Der Epic-Canvas ist die Stelle, an der beide zusammentreffen — **ein Dokument im Inneren eines Panels** —, weshalb die Trennung sauber sein muss. **Bewusst in Kauf genommen:** beim Admin-Umzug (K7) existieren die Panel-Bausteine zweimal (JS-Laufzeit + Svelte); die CSS-Schicht bleibt geteilt. Trifft nur ein Kind und ist dort absehbar, statt heute alle Boards zu verkomplizieren |

## Kind-Schnitt

**K1 ist das einzige Kind, das alle anderen blockiert** — und genau das ist „designwise good to go".
Steht der Panel-Vertrag, laufen K2–K9 unabhängig und teils parallel.

| Kind | Inhalt | Hängt ab von |
|---|---|---|
| **K1 (T002460) — Lavish Design-Kit & Panel-Kontrakt** | Design-Tokens, Komponenten-CSS, Panel-Vertrag in drei Größen, zwei Panel-Arten (E10), Fokus-Spalten-IA, Mobile, Aktions-Slot + Bestätigungsmuster, Kontext-Slot, `data-lavish-question`-Konvention | — |
| **K2 (T002461) — Daten-Adapter & lokaler Daemon** | Adapter-Schnittstelle, Daemon spricht `/api/admin/*`-Vertrag, Lese-Quellen live | K1 |
| **K3 (T002462) — Layout-Engine** | Drag & Drop, Resize, Pop-out, Panel-Katalog, Persistenz, Mobile-Gesten | K1 |
| **K4 (T002463) — Steuerung & Audit** | Schreibaktionen (E5), Bestätigungen, Audit-Log, Lesen/Schreiben-Trennung | K2 |
| **K5 (T002464) — Epic-Canvas & Planungs-Workflow** | E6–E8: Canvas, Grilling, OpenSpec-Entwurf, Staging, durchgehende Sichtbarkeit | K1, K2 |
| **K6 (T002465) — Brain-Anbindung** | Kontextuelle Wiki-Verknüpfung; **Auth-Hürde:** Brain hängt hinter `oauth2-proxy` (`k3d/oauth2-proxy-brain.yaml`), hat kein eigenes OIDC. Brain ist ein **generiertes Wiki** (`scripts/brain-ingest.sh` → externes `Paddione/brain`), kein API → sinnvolle Anbindung ist *kontextuell* („zu diesem Ticket gehören diese Seiten"), nicht „noch ein Datenpanel" | K2 |
| **K7 (T002466) — Admin-Migration** | `/admin/cockpit` + `pipeline.astro` als Panels, Menü-Slot | K2, K3 |
| **K8 (T002467) — Agentische Headed-Tests** *(Bonus)* | Optionale, gründliche Playwright-Verifikation von Implementierungen | K7 |
| **K9 (T002468) — Kunst-/Stil-Datenbank** *(später)* | Online-Stilquelle, aus der Modelle Gestaltungsideen ziehen | K1 (via E11) |

---

# Design K1 — Lavish Design-Kit & Panel-Kontrakt

> Freigegeben: Abschnitt 1 (Architektur) am 2026-07-28. Die folgenden Abschnitte wurden auf
> Weisung („reicht dann auch erstmal mit den Fragen") ohne weitere Rückfragen ausgearbeitet;
> die dabei selbst getroffenen Detailentscheidungen sind als **D-Nummern** gekennzeichnet und
> jederzeit revidierbar.

## 1. Architektur

K1 liefert das Kit und den Panel-Vertrag — **keine** echten Daten, **keine** Layout-Engine,
**keine** Schreibaktionen. Diese kommen in K2/K3/K4. K1 muss sie möglich machen, ohne dort zu sein.

```
.lavish/kit/
  tokens.css      Schicht 1 — Farben, Typo-Skala, Abstände, Radien, Bewegung.
                  Nur CSS-Variablen, keine Selektoren. Austauschbar (E11)
  document.css    Schicht 2 — Dokument-Bausteine: Überschriften, Fließtext, Tabellen,
                  Entscheidungsblock, Frage-Marker, Code
                  → von jedem handgeschriebenen Board per <link> nutzbar
  panel.css       Schicht 3 — Panel-Rahmen, Kopf, Aktions-Slot, Kontext-Slot,
                  Zustands- und Größendarstellung
  panel.js        Panel-Laufzeit — vier Typen, drei Größen, Zustände
  adapter.js      Datenschnittstelle (nur Vertrag) + Fixture-Implementierung
```

**Der entscheidende Schnitt ist `adapter.js`.** Panels rufen ausschließlich `data.tickets(…)`,
`data.agents(…)`, `data.ci(…)` auf — **nie `fetch`**. K1 liefert eine Fixture-Implementierung aus
festen Beispieldaten. Drei Wirkungen auf einmal: das Cockpit rendert vollständig, bevor der Daemon
existiert; K2 tauscht später genau eine Datei; die Panels sind ohne laufende Infrastruktur testbar.

`brand` ist Parameter jeder Adapter-Methode, fest auf `mentolder` (E16).

**Nachweis, dass der Vertrag trägt** — K1 liefert zwei Artefakte, ohne die der Vertrag eine
Behauptung bliebe:
1. ein umgebautes **Referenz-Board** (belegt Schicht 1+2 für handgeschriebene Dateien),
2. eine **Cockpit-Hülle** mit je einem Panel pro Typ in allen drei Größen (belegt Schicht 3).

**D1 — Build-Grenze.** Das Terminal (E21) erzwingt einen Build. Er wird **auf das Terminal-Panel
begrenzt**: Kit und übrige Panels bleiben buildfrei und direkt im Browser lauffähig, nur das
Terminal-Panel wird als vorgebautes Bündel eingebunden. Damit stirbt der „mal eben ein Board
tippen"-Weg nicht.

## 2. Panel-Kontrakt

Vier Typen × drei Größen. Der Typ bestimmt Datenverhalten und Fehlerbild, die Größe die Darstellung.

### 2.1 Die vier Typen

| Typ | Datenverhalten | Verlust bei Fehler | Beispiele |
|---|---|---|---|
| **Status** | Zustand. Idempotent nachladbar, Reihenfolge egal, jüngste Antwort gewinnt | Nichts — alter Wert bleibt gültig, wird als veraltet markiert | Pods, FluxCD, CI, PRs, Backlog, Modell-Server |
| **Strom** | Ereignisse. Append-only, Reihenfolge ist Bedeutung | **Lücken sind Datenverlust** und müssen sichtbar sein | Factory-Logs, Agenten-Mitlesen, Audit-Log |
| **Canvas** | Editierbar, hat ungespeicherte Änderungen, überlebt Reload | Nichts darf verworfen werden — niemals | Epic-Canvas, Grilling, Spec-Entwurf |
| **Terminal** | Bidirektional, hängt an einem lebenden Prozess | Verbindung trennbar, Sitzung überlebt (tmux) | Harness-Sitzung in erster Person |

**D2 — Deklaration statt Konvention.** Jedes Panel deklariert seinen Typ maschinenlesbar
(`data-panel-type`). Die Laufzeit leitet daraus Refresh-, Fehler- und Scroll-Verhalten ab. Ein
Panel kann sein Fehlerverhalten damit nicht versehentlich falsch implementieren — es bekommt es.

### 2.2 Die drei Größen

| Größe | Verwendung | Anforderung |
|---|---|---|
| **Rail** | Eine Zeile in der Fokus-Spalte | Muss den Kernzustand in einer Zeile ausdrücken. Kein Scrollen, keine Interaktion außer Aufziehen |
| **Karte** | Standard im Arbeitsbereich | Vollständig bedienbar, Aktions-Slot sichtbar |
| **Vollbild** | Pop-out, Mobil, Canvas-Vollfläche | Nutzt zusätzliche Fläche sinnvoll — nicht dieselbe Karte größer gezogen |

**D3 — Rail-Pflicht.** Jedes Panel **muss** eine Rail-Darstellung haben. Ein Panel, dessen Zustand
sich nicht in eine Zeile fassen lässt, ist zu breit geschnitten und wird geteilt. Das ist die
Disziplin, die verhindert, dass die Fokus-Spalte zur zweiten Kachelwand wird.

### 2.3 Slots

Jedes Panel hat drei feste Slots:

- **Kopf** — Titel, Typ-Kennzeichen, Aktualitätsanzeige (siehe 4.2)
- **Aktions-Slot** — mit **vier** Zuständen, nicht zwei:
  `verfügbar` · `gesperrt (kein Token)` · `bestätigung offen` · `läuft`
  **D4:** Gesperrte Aktionen werden **sichtbar und erkennbar gesperrt** dargestellt, nicht
  ausgeblendet. Grund: Aus E17 folgt ein Dauerzustand „ich sehe alles, darf aber nichts" — bei
  ausgeblendeten Knöpfen ist nicht unterscheidbar, ob eine Aktion fehlt oder nur nicht
  freigeschaltet ist.
- **Kontext-Slot** — Verweise auf zugehörige Brain-Seiten (K6), Spec, Ticket. In K1 nur als
  leerer, gestalteter Platz mit definierter Befüllungsschnittstelle.

### 2.4 Bestätigungsmuster

**D5 — Abgestufte Bestätigung nach Umkehrbarkeit**, nicht pauschal:

| Klasse | Beispiele | Bestätigung |
|---|---|---|
| Wiederholbar | Refresh, Reconcile, Tick auslösen, Enqueue | keine |
| Zustandsändernd, umkehrbar | Ticket-Status setzen, Panel schließen | einfache Rückfrage |
| Nicht umkehrbar | PR mergen, Agent killen, Worktree entfernen, Lock brechen | Rückfrage **mit Nennung des konkreten Ziels**, das der Nutzer bestätigen muss |

**D6 — Mobile Sonderregel.** Nicht umkehrbare Aktionen sind in der Vollbild-/Mobildarstellung
standardmäßig **gesperrt** und müssen pro Sitzung bewusst freigeschaltet werden. Grund: E5 gibt dem
Cockpit Merge-, Kill- und Lock-Break-Rechte; auf einem Touchscreen ist ein Fehlgriff einen
Millimeter entfernt.

## 3. Informationsarchitektur

### 3.1 Desktop

```
┌ Kopfleiste: Marke (mentolder) · Verbindungszustand · Token-Status ────────┐
├──────────────┬───────────────────────────────────────────────────────────┤
│ FOKUS-SPALTE │  ARBEITSBEREICH                                           │
│ (Rail)       │  1–3 Panels in Kartengröße oder ein Vollbild-Panel         │
│              │                                                            │
│ Laufende     │  ┌─────────────────────┐ ┌──────────────────────────────┐ │
│ Epics ────── │  │ Epic-Canvas         │ │ Factory-Queue                │ │
│ (E6: ab      │  │ (Canvas-Panel)      │ │ (Status-Panel)               │ │
│  Erstellung  │  └─────────────────────┘ └──────────────────────────────┘ │
│  dauerhaft)  │  ┌──────────────────────────────────────────────────────┐ │
│              │  │ Agenten-Mitlesen (Strom-Panel)                       │ │
│ Was brennt   │  └──────────────────────────────────────────────────────┘ │
│ Agenten      │                                                            │
│ Modelle      │                                                            │
└──────────────┴───────────────────────────────────────────────────────────┘
```

**D7 — Was in der Fokus-Spalte steht, ist festgelegt, nicht frei konfigurierbar:**
1. **Laufende Epics** (E6 — von Erstellung bis Abschluss, unveränderlich verankert)
2. **Was Aufmerksamkeit braucht** (siehe 3.3)
3. **Aktive Agenten** (E18)
4. **Modell-Server** (E18)

Alles andere lebt im Arbeitsbereich und ist frei wählbar. Grund: Wäre die Rail konfigurierbar,
könnte man E6 wegkonfigurieren — und E6 ist als **Leitprinzip** gesetzt, nicht als Vorschlag.

### 3.2 Mobil

Dieselbe Struktur, untereinander statt nebeneinander:

- Fokus-Spalte → **obere Leiste** (zusammengefasst) + aufziehbares Bottom-Sheet mit den vier
  Rail-Gruppen
- Arbeitsbereich → **Ein-Panel-Stack**, gewischt statt gekachelt
- Panels erscheinen mobil ausschließlich in **Vollbild**-Größe
- **D8:** Terminal-Panel und nicht umkehrbare Aktionen sind mobil standardmäßig gesperrt (D6)

`website/src/styles/mobile-cockpit.css` gehört zum alten Admin-Cockpit und wird **nicht**
übernommen — es beschreibt eine andere Struktur. Bei K7 zu prüfen, ob es dann ersatzlos entfällt.

### 3.3 Aufmerksamkeitsmodell

**D9 — Zurückhaltend, drei Stufen:**

| Stufe | Auslöser | Wirkung |
|---|---|---|
| **Ruhig** | normale Zustandsänderungen | nur im Panel |
| **Auffällig** | CI rot, Flux nicht synchron, Agent länger als erwartet ohne Fortschritt | Eintrag in „Was brennt", Rail-Markierung |
| **Unterbrechend** | Ticket wartet nachweislich auf eine Entscheidung von dir (`attention_mode = needs_human`) | zusätzlich Desktop-Benachrichtigung über das vorhandene Simple-Notify-Plugin |

Grund für die Zurückhaltung: Ein Cockpit, das bei jedem Ereignis piept, wird stummgeschaltet — und
ist dann auch für die Fälle stumm, die zählen.

## 4. Datenfluss und Fehlerverhalten

### 4.1 Fluss

```
Panel ──ruft──► adapter.js ──K1: Fixtures
                           └─K2: Daemon ──► kubectl · gh-axi · git · agent-lock.sh
                                                    · ticket-mcp · factory-mcp
                                                    · /api/admin/*-Vertrag
```

**D10 — Refresh-Rate wird vom Panel deklariert, nicht global gesetzt.** Ein Pod-Status alle 30 s
und ein Ticket-Board alle 5 min sind unterschiedliche Bedürfnisse; eine globale Rate ist für das
eine zu langsam und für das andere Verschwendung.

**D11 — Kein Panel pollt, während es unsichtbar ist.** Bei bis zu einem Dutzend Panels mit je
eigener Rate ist das der Unterschied zwischen einem ruhigen und einem dauerbeschäftigten System.

### 4.2 Fehlerverhalten je Typ

| Typ | Bei Abfragefehler | Bei Verbindungsverlust |
|---|---|---|
| **Status** | letzter Wert bleibt stehen, **Aktualitätsanzeige** springt auf „veraltet seit …" | wie links |
| **Strom** | **Lückenmarkierung im Strom** — sichtbarer Balken „Verbindung unterbrochen 14:22–14:25". Ohne ihn liest man eine lückenhafte Historie als vollständig | wie links, danach Wiederaufnahme mit erneuter Markierung |
| **Canvas** | **nichts wird verworfen**; ungespeicherte Änderungen bleiben, Speicherversuch wird wiederholt, Zustand „nicht gespeichert" bleibt sichtbar | wie links |
| **Terminal** | Verbindungsverlust wird angezeigt; die tmux-Sitzung **läuft weiter** und wird beim Wiederverbinden erneut angedockt | wie links |

**D12 — Aktualität ist immer sichtbar, nicht nur im Fehlerfall.** Jedes Status- und Strom-Panel
zeigt dauerhaft, wie alt seine Daten sind. Ein Dashboard, das im Normalfall keine Zeitangabe macht,
ist im Fehlerfall nicht von einem funktionierenden zu unterscheiden — genau die Falle, in die das
heutige Cockpit mit seinen hartkodierten Arrays gelaufen ist.

**D13 — Kein stiller Ersatzwert.** Ist eine Quelle nicht erreichbar, zeigt das Panel das an. Es
zeigt **nie** eine Null, einen Strich oder einen Beispielwert, der wie ein Messwert aussieht.

## 5. Beitragspfad ins Kit (E14)

**D14 — Eine geerntete Komponente kommt nur mit drei Dingen ins Kit:**
1. ein **Beleg-Ausschnitt** im Referenz-Board oder der Cockpit-Hülle (sie ist damit sichtbar und
   überprüfbar),
2. ausschließlich **Token-Bezüge** statt fester Farb- und Größenwerte (sonst bricht E11 und
   damit K9),
3. eine Zeile im Kit-Verzeichnis mit Zweck und Herkunftsprojekt — das ist zugleich die
   **Stilreferenz**, die E14 verlangt.

Ohne alle drei bleibt sie im Projekt und wandert nicht ins Kit. Grund: Ein Kit, das ungeprüft
wächst, ist nach kurzer Zeit wieder das, was die zehn heutigen Boards sind.

## 6. Tests

K1 ist CSS und eine kleine Laufzeit — der Prüfbedarf liegt auf **Vertragstreue**, nicht auf Optik.

| Was | Wie | Warum |
|---|---|---|
| Jedes Panel deklariert einen gültigen Typ | BATS-Strukturtest über die Kit-Dateien | D2 ist die Grundlage des Fehlerverhaltens |
| Jedes Panel hat eine Rail-Darstellung | BATS | D3 ist die Disziplin, die die Rail schützt |
| Kein Panel ruft `fetch` direkt auf | BATS-Negativtest **mit Positiv-Anker** | Der Adapter-Schnitt ist der Kern der Architektur; ohne ihn ist K7 ein Rewrite |
| Dokument-Bausteine nutzen ausschließlich Tokens | BATS-Negativtest **mit Positiv-Anker** | Vorbedingung für E11/K9 |
| Panel-Laufzeit: Typ→Verhalten-Zuordnung | Vitest | Verhalten statt Aussehen |
| Referenz-Board und Cockpit-Hülle existieren und binden das Kit ein | BATS | Ohne sie ist der Vertrag unbelegt |

**Pflicht bei den beiden Negativtests:** Positiv-Anker im selben Test (Repo-Konvention T002356-M1) —
erst prüfen, dass der gültige Fall durchläuft, dann die Negativ-Aussage. Ohne Anker besteht der
Test vakuos, wenn die Kandidatenliste leer ist.

**Ablage:** `tests/spec/sdlc-cockpit/<kurz-slug>.bats` — ein Verzeichnis pro SSOT-Spec, **eine
Datei pro Vorgang** (Konvention T002416). Nicht an eine Sammeldatei anhängen.

## Offene Fragen

| # | Frage | Wann zu klären |
|---|---|---|
| OF1 | Eigentumsgrenze pro Artefaktteil bei Canvas-Export (aus E15) — was gehört dem Canvas, was der Umsetzung; wie werden fremde Änderungen vor dem Überschreiben erkannt | K5, vor Umsetzung |
| OF2 | Ist `ticket_plans` tatsächlich repo-weit leer? Der Canvas-Store darf sich nicht darauf stützen | K5, vor Umsetzung |
| OF3 | Ereignisquelle für das Agenten-Mitlesen (E12b): Telemetry-SQLite, Token-Tracker oder opencode-Session-Logs | K2 |
| OF4 | Verhältnis zu `website/src/styles/mobile-cockpit.css` — Ersatz oder ersatzloser Wegfall | K7 |
| OF5 | Was „MCP-Server in den llama-Stack migrieren" bezwecken soll | T002459 |


---

# K1 — Vektorspeicher (pgvector in shared-db)

Dieser Abschnitt ist nach [`docs/diagrams/k1-vector-db.md`](../../diagrams/k1-vector-db.md)
umgezogen [T002521]. Er gehört zu Epic T002430 (Brain-Architektur), dessen Kinder K1–K8 je
eine Komponente visualisieren — nicht zu T002458 (SDLC-Cockpit), dessen Kinder ebenfalls mit
`K` nummeriert sind. Die Geschwister K2–K7 legen ihre Diagramme unter `docs/diagrams/` ab.
