# pxe-inference-tablet — Proposal

**Warum:** PK-Tablet läuft heute unter Windows mit LM Studio
(`scripts/llm/pk-devices/pk-tablet-startup.ps1`) und einem separaten
llama-server für Rerank (`scripts/llm/start-tablet-rerank.ps1`). Windows
belegt RAM und Platte, die der iGPU fehlen, und der Modellwechsel ist
GUI-gebunden. Ein minimales Ubuntu als dedizierter Endpoint gibt dem Modell
den ganzen Speicher und macht das Loadout per Repo-Datei austauschbar.

**Was:** PXE-Profil `inference` für `setup-pxe.sh`, Geräte-Loadout im
bestehenden Loadout-Schema, Apply-Werkzeug vom Dev-Rechner, Runbook.
Details und Entscheidungen D1–D6: `design.md`.

**Nicht im Umfang:** Änderungen an der Rollenkette in
`scripts/llm/loadouts.json` (Endpunkt `192.168.100.12:8080` bleibt gleich),
Rückbau der Windows-Skripte (erst nach erfolgreichem Umzug), andere Geräte.
