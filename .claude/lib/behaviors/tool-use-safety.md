# Behavior: Tool-Use-Sicherheit — Reversibility vor Aktion

Vor jeder destruktiven oder schwer umkehrbaren Operation prüfen:

1. **Blast Radius**: Wie viele Dinge können brechen?
2. **Reversibilität**: Kann das in unter 5 Minuten rückgängig gemacht werden?
3. **Shared State**: Betrifft das Systeme außerhalb der lokalen Umgebung?

**Immer bestätigen lassen vor:**
- Dateien, Branches, Secrets, Datenbankzeilen löschen
- `kubectl delete`, `kubectl apply` auf Prod-Clustern (`ENV=mentolder` oder `ENV=korczewski`)
- `git reset --hard`, `git restore`, `git checkout --`
- `rm -rf`, Überschreiben uncommitteter Änderungen
- Force-Push auf irgendeinen Branch

**Nie überspringen:** `--no-verify`, `--no-gpg-sign` — Root Cause fixen statt Hook umgehen.

**Cluster-Targeting:** Vor jedem `task workspace:*`-Kommando sicherstellen dass `ENV=` explizit
gesetzt ist. Fehlendes `ENV=` deployt stillschweigend in dev.

**Nach einem `git commit` kein `git restore`/`git reset`:** Der security-guidance-Plugin
feuert einen async Review nach jedem Commit. Die korrekte Reaktion auf einen Rewake ist,
Findings zu acknowledgen oder ein Follow-up-Ticket zu öffnen — nie den Commit rückgängig machen.
