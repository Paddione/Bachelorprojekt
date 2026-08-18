# p1 — fleet-dns-cutover: stream-Prefix-Assertions entfernen (T011899)

## Ziel

Der LiveKit-Removal (T002184, Commit 575bab057) strich `stream` aus
`SERVICE_PREFIXES` in `scripts/fleet-dns-cutover.sh` — dort steht nur noch
`SERVICE_PREFIXES=("turn")` (Zeile 20), der Skript-Kommentar sagt explizit
"touches ONLY @, *, turn". Zwei Assertions in `tests/unit/fleet-dns-cutover.bats`
prüfen weiterhin auf `A|stream|…` und schlagen in der vollen Testmenge fehl.

## Steps

1. **RED.** Testlauf auf dem aktuellen Stand — die beiden `A|stream|…`-Assertions
   (Zeile 26 im mentolder-Plan-Test, Zeile 53 im korczewski-Test) schlagen fehl:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/fleet-dns-cutover.bats
# expected: FAIL (stream existiert im Plan-Output nicht mehr)
```

2. **GREEN.** In `tests/unit/fleet-dns-cutover.bats` genau zwei Assertions
   entfernen:
   - Zeile 26: `assert_output --partial 'A|stream|204.168.244.104'`
   - Zeile 53: `assert_output --partial 'A|stream|37.27.251.38'`

   Keine weiteren Zeilen anfassen. Die `A|turn|204.168.244.104`-Assertion
   (Zeile 27) bleibt als Positiv-Anker für den aktiven Prefix erhalten.

3. **Verifikation.**

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/fleet-dns-cutover.bats
```

## Acceptance

- Der mentolder-Plan-Test und der korczewski-Test laufen grün.
- `turn` bleibt per Positiv-Assertion abgesichert; `stream` kommt in keiner
  Assertion mehr vor.
- Kein Produktcode geändert (`scripts/fleet-dns-cutover.sh` unangetastet).
