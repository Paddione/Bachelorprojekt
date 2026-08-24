# Design: db-identity-guard

## Entscheidungen

### D1 — Zwei Schichten im Choke-Point statt dezentraler Worker-Guards
`_pgpod` ist der einzige Pod-Selektor der ticket.sh-Familie (T002386-Kommentar listet die
Ausnahmen außerhalb des Scopes, → T015669). Beide Schichten liegen dort:

```
_pgpod()
  ├─ kubectl get pod … (bestehend)
  ├─ NEU: Zeilen > 1 → Exit 1, Kandidatenliste im Fehler        [Schicht 1]
  └─ NEU: _assert_db_identity "$pod" (einmal pro Prozess)       [Schicht 2]
        ├─ BATS-Sentinel-Regime → skip (T002224-Konsistenz)
        ├─ TICKET_ALLOW_UNVERIFIED_DB=1 → WARN + ok
        ├─ SELECT identity FROM tickets.db_identity
        │    leer/fehlend → Exit 1 + Migrations-Remediation
        │    ≠ Konstante  → Exit 1 + Mismatch-Meldung
        └─ Ergebnis in globale Var gecacht (keine Zweitprobe)
```

Begründung gegen Alternativen: Probe in `_exec_sql` würde Reads und Writes nicht unterscheiden
können und mehrfach pro Prozess feuern; Guards in den ~10 Write-Workern verfehlen die Read-Pfade
(Refuse-Ghost-Data war explizite Anforderung).

### D2 — Identitätssignal: feste UUID-Konstante, zwei Standorte, Paritäts-Test
Migration `migrations/20260824-db-identity-marker.sql`:

```sql
CREATE TABLE IF NOT EXISTS tickets.db_identity (
  identity UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO tickets.db_identity (identity)
SELECT '9f1d3c6e-4b2a-4f8a-9c1d-7e5b3a2f1d00'
WHERE NOT EXISTS (SELECT 1 FROM tickets.db_identity);
```

Erwartungswert steht als dieselbe Konstante in `_ticket-core.sh` (`TICKET_DB_IDENTITY_EXPECTED`,
per Env überschreibbar für bewusste Re-Identity nach Restore). Strukturtest erzwingt Parität der
beiden Literale (Spec-Requirement 3).

Stale-Snapshot-Restanz (gleiche UUID wie SSOT) bleibt für Schicht 2 unsichtbar — genau dafür ist
Schicht 1 da: ein Koexistenz-Ghost macht die Pod-Auswahl ambig. Ein Ghost, der den echten Pod
ERSETZT hat und einen Snapshot trägt, ist mit vertretbarem Aufwand nicht erkennbar; dokumentierte
Restrisiko-Grenze.

### D3 — Fail-closed inklusive Reads, Escape-Hatch env-var-basiert
Die eingefrorene fleet-Kopie (TICKET_CTX=fleet) trägt den Marker nicht → fleet-Lesen braucht
`TICKET_ALLOW_UNVERIFIED_DB=1`. Bewusst kein CTX-Sonderfall: der Hatch ist sichtbar im Aufruf,
nicht implizit im Kontextnamen.

### D4 — Rollout-Reihenfolge als Guard-Eigenschaft
Fehlender Marker bricht ALLES laut ab — das ist die Absicht (kein stiller Übergang). Das Fehler-
output nennt `task db:migrate ENV=mentolder` wörtlich. Deploy-Notiz landet im Plan-Verify-Task.

## Risiken

- **Probe-Latenz:** ein zusätzlicher `kubectl exec` pro Prozessaufruf (~100–300 ms). Akzeptiert;
  Cache verhindert Mehrfachproben.
- **CI-Falle wie T015008:** jeder Offline-Test, der `_pgpod` erreicht, bekommt die Probe nur im
  Nicht-BATS-Fall — unter BATS skip (D1). Die Singleton-Assertion sieht Stub-Antworten (eine
  Zeile) und bleibt grün. Regelfall abgedeckt; neue Tests mit Mehrzeil-Pod-Antworten müssen das
  Assertion-Verhalten bewusst testen.
- **Migration vor Guard:** bis `task db:migrate` gelaufen ist, bricht jedes Ticket-Kommando ab.
  Zeitfenster zwischen Merge und Migration minimal halten (Plan-Verify führt die Migration nicht
  aus — Operator-Schritt, im Merge-Kommentar vermerkt).
