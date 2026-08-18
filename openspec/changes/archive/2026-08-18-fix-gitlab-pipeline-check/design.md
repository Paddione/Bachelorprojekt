# Design: fix-gitlab-pipeline-check

_Ticket: T012267_

## Root-Cause

Der GitLab-Spiegel (gitlab.com/Paddione/Bachelorprojekt, Projekt-ID 85496968,
Etappe 1 T011790) läuft als Zweitverifikation — aber kein Werkzeug im Repo
liest den Pipeline-Status. Zwei Zustände bleiben für Agents unbeantwortbar:
(1) Pipelines stehen ohne Runner mit passendem Tag auf `pending` statt
`failed` (bewusst so designt, kein Cloud-Fallback — Memory
gitlab-mirror-project); (2) ob die Pipeline überhaupt startete, kann niemand
feststellen. „Does even run" ist auf der GitLab-Seite unbeantwortbar —
dieselbe Fehlerklasse, die T012239 auf der GitHub-Seite behob.
Sekundärbefund 4 aus T012239.

## D-Entscheidungen

**D1 — Kleines read-only Prüf-Werkzeug.** Neues Skript
`scripts/gitlab-pipeline-check.sh`: curl auf die öffentliche GitLab-API
(`/api/v4/projects/85496968/pipelines?ref=main&per_page=1` — ohne Token
lesbar), jq auf die letzte Pipeline, Ausgabe:
`status=<status> created_at=<iso> [classification]`.
Klassifikation: `success` → grün (exit 0); `failed`/`canceled` → rot (exit 1);
`pending`/`running` → **kein Urteil** (exit 2) mit Meldung
„pending — kein Runner mit passendem Tag oder Pipeline hängt; kein Urteil".
Leere/ungültige API-Antwort → exit 3 „kein Urteil (leere Antwort)".

**D2 — Nichtleere-Guard zuerst (T003109-Semantik).** Erst prüfen, dass die
Antwort ein nicht-leeres JSON-Array ist, dann das Status-Prädikat — eine leere
Antwort ist kein Urteil, nie „alles ok".

**D3 — Abhängigkeiten.** curl + jq; beide existieren in den
GitHub-CI-Runnern (git/curl/jq sind im bats-unit-Job installiert) — kein neuer
Runner-Bedarf. Kein Token, keine Schreiboperation, kein CI-Gate: das Skript
ist ein Diagnose-Werkzeug für Agents und Runbooks.

**D4 — Non-Goals:** Einbindung in babysit-prs.sh/Notify (späterer Schritt,
eigenes Ticket), Runner-Auto-Setup, alle T012263-Themen.

## Edge-Cases

- **Mehrere Pipelines in der Antwort:** nur der erste Eintrag (per_page=1) zählt.
- **Netzwerkfehler/curl-Ausfall:** exit 3 mit Diagnose — kein Absturz.
- **Alte pending-Pipeline:** `created_at` wird mit ausgegeben; die Bewertung
  „hängt seit X" bleibt dem Aufrufer überlassen (Diagnose, kein Urteil).

## Tests

`tests/spec/ci-cd/gitlab-pipeline-check.bats` — curl-Stub (PATH, Body aus
Marker-Datei), Output-Verifikation: Positiv-Anker success → exit 0;
Negativtests: pending → exit 2 mit Runner-Klassifikation, leere Antwort →
exit != 0. Kein echtes Netz im Test.
