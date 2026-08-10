# p3 — Korrelations-Header

**Rolle:** implementation
**Dateien:** keine — siehe Ergebnis der Machbarkeitsprobe

## Ergebnis der Probe (2026-08-10, Branch-Stand 64f07d0fc)

**Die Probe trägt nicht.** opencode kann pro Dispatch keine eigenen Header senden: das
Konfigurationsschema (`https://opencode.ai/config.json`, referenziert in
`.opencode/opencode.jsonc:2`) erlaubt unter `provider.<name>.options` abschließend `apiKey`,
`baseURL`, `enterpriseUrl`, `setCacheKey` und die Timeout-Familie — kein `headers`, kein
`additionalProperties`. Header existieren nur unter `provider.<name>.models.<model>.headers`, also
als **statische** Konfiguration, die keinen wechselnden Wert tragen kann. Da die Factory über
`scripts/factory/sandbox-run.sh` opencode startet und `pipeline.mjs` selbst keine HTTP-Aufrufe an
`:18235` macht, erreichen Ticket und Partial den Proxy auf diesem Weg nicht.

Ob `{env:}` in `models.headers` interpoliert wird, blieb offen: der Laufzeitversuch gegen einen
Echo-Server lief in den Timeout, ohne den Server zu erreichen. Vollständige Messung samt Befehlen
im Ticket-Kommentar zu T003277.

**Umgesetzt wird daher nur die Leseseite** — sie liegt bereits in p2: der Proxy nimmt die drei
Header entgegen und schreibt sie in die Zeile. Wer sie sendet, wird korreliert; sonst bleiben die
Spalten `NULL`. Das Delta-Requirement wurde entsprechend umgeschrieben. Eine geratene Zuordnung
über Zeitfenster wird nicht gebaut.

**Der in D6 erwartete Nebeneffekt tritt nicht ein:** die Per-Slot-Queue-Isolation bleibt
wirkungslos, weil weiterhin niemand `x-slot-id` sendet. Der dazu gemeldete Mishap bleibt offen.

---

_Der ursprüngliche Auftrag dieses Partials, zur Nachvollziehbarkeit:_

## Kontext

Der Proxy weiß von einem Request heute nichts über Ticket, Partial oder Slot. `extractSlotId()`
liest `x-slot-id` seit T002483 aus, aber **kein** Aufrufer sendet den Header — die Per-Slot-Semaphore
in `scripts/llm-proxy/slot-queue.mjs` bildet ihren Schlüssel deshalb immer aus `backend.name` allein,
womit Slot 0 und Slot 1 einander weiterhin blockieren. Siehe `design.md` → D6.

Ob der opencode-Dispatch-Pfad eigene Header überhaupt senden kann, ist **nicht belegt**: in
`.opencode/agent-models.jsonc` tragen alle Provider ausschließlich `"options": { "baseURL": … }`.
Ein `headers`-Feld erscheint nur bei den MCP-Servern (`.opencode/opencode.jsonc:78`), also an einer
anderen Konfigurationsfläche. Deshalb steht am Anfang dieses Partials eine Probe, kein Umbau.

## Aufgaben

- [ ] **Machbarkeitsprobe zuerst.** Im gemma26-Provider-Block von `.opencode/agent-models.jsonc`
      versuchsweise ein `headers`-Feld neben `baseURL` eintragen, einen Dispatch auslösen und am
      Proxy nachsehen, ob der Header ankommt:

```bash
# Proxy-Log mitlesen, waehrend ein Dispatch laeuft
journalctl --user -u llm-proxy -f &
# in einer zweiten Shell einen lokalen Subagenten dispatchen, dann:
source scripts/factory/lib.sh && factory_resolve
echo "SELECT slot_id, dispatch_ticket, dispatch_partial FROM tickets.llm_proxy_request_log ORDER BY id DESC LIMIT 1;" | factory_psql
# erwartet bei Erfolg: die drei Spalten sind gefuellt statt NULL
```

- [ ] **Ergebnis der Probe im Ticket festhalten** — mit dem ausgeführten Befehl und dem Commit,
      gegen den gemessen wurde. Eine Zahl ohne den Befehl, der sie erzeugt hat, ist keine Messung
      (Mess-Konvention T002717).

- [ ] **Trägt die Probe:** die drei Header `x-slot-id`, `x-dispatch-ticket` und
      `x-dispatch-partial` im Provider-Block setzen und ihre Werte in `scripts/factory/pipeline.mjs`
      dort befüllen, wo der Dispatch die Partial- und Ticket-Kennung ohnehin schon kennt.

- [ ] **Trägt die Probe nicht:** die Header nur dort setzen, wo der Aufrufer sie kontrolliert, und
      es dabei belassen. Die Spalten bleiben dann `NULL`, was der Spec ausdrücklich zulässt. Eine
      nachträgliche Zuordnung über Zeitfenster gegen `factory_phase_events` wird **nicht** gebaut:
      bei parallelen Slots ist das eine Vermutung, und eine Vermutung, die im Panel wie eine
      Messung aussieht, ist schädlicher als eine leere Spalte.

- [ ] **Wirksamkeit der Slot-Isolation nachweisen.** Sobald `x-slot-id` gesendet wird, ändert sich
      das Warteschlangenverhalten des Proxys. Zwei gleichzeitige Anfragen mit verschiedenen
      Slot-Kennungen absetzen und belegen, dass die zweite nicht hinter der ersten wartet:

```bash
( time curl -s -X POST http://127.0.0.1:18235/v1/chat/completions -H 'x-slot-id: 0' \
    -H 'content-type: application/json' \
    -d '{"model":"gemma26-factory","messages":[{"role":"user","content":"eins"}]}' >/dev/null ) &
( time curl -s -X POST http://127.0.0.1:18235/v1/chat/completions -H 'x-slot-id: 1' \
    -H 'content-type: application/json' \
    -d '{"model":"gemma26-factory","messages":[{"role":"user","content":"zwei"}]}' >/dev/null ) &
wait
# erwartet: beide Laufzeiten liegen nahe beieinander statt sich zu addieren
```

      Bleibt dieser Nachweis aus, wird die Änderung am Slot-Header zurückgenommen statt sie
      unbelegt zu lassen: sie greift dann in ein laufendes Warteschlangenverhalten ein, ohne dass
      der beabsichtigte Effekt gezeigt wäre.

## Budgets

Beide Dateien dieses Partials liegen **außerhalb** der S1-Messung, deshalb steht hier bewusst keine
Budgetzahl: `scripts/factory/pipeline.mjs` ist in `docs/code-quality/gates.yaml` → `s1.ignore`
gelistet, `.opencode/agent-models.jsonc` fällt unter keine Extension-Regel in `s1.limits`. Eine
Budgetangabe für eine ungemessene Datei sähe wie ein Befund aus und wäre keiner.
