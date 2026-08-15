# p1 — MERGED-PR-Positiv-Signal im branch-reaper (Implementierung)

_Ticket: T007032 · Partial p1 (impl) · einziger Implementierungs-Partial_

## Ziel

`scripts/branch-reaper.sh` gewinnt zwei Positiv-Signale, die einen Branch mit Ticket-ID als
REAP-Kandidat freigeben, BEVOR der Blob-Abweichungs-Check gegen die ALLOWLIST greift
(Ticket-Richtung: T005958-Vorgehensweise verallgemeinern):

1. **Eigener MERGED-PR:** `gh pr list --head <branch> --state merged --json headRefOid`
   liefert einen PR, dessen `headRefOid` dem Remote-Tip-SHA des Branches entspricht.
2. **Nachfolge-Branch mit identischen Blobs:** ein anderer Remote-Branch, der selbst einen
   MERGED-PR hat, traegt fuer JEDE Datei der Divergenzmenge des Kandidaten denselben Blob.

Unverifizierbar heisst verschonen (T003074-Muster): gh-Ausfall, kein MERGED-PR, SHA-Mismatch
ohne Nachfolger → bestehender Blob-/Allowlist-Check entscheidet. Die freshness-regen-
Sonderbehandlung (Zeilen 187-209) und die Loeschschleife (ab Zeile 295) bleiben unangetastet.

## Schritte

1. **Header-Doku (Zeilen 17-25) erweitern.** Die Loeschkriterien-Liste bekommt einen Satz:
   „Ein gemergter PR (headRefOid == Branch-Tip) bzw. ein Nachfolge-Branch mit MERGED-PR und
   identischen Blobs ist ein Positiv-Signal: der Blob-Abweichungs-Check entfaellt fuer den
   Branch, weil sein Inhalt nachweislich in main angekommen ist [T007032]."

2. **Helper `_merged_pr_head_oid()`** — direkt nach `_allowed()` (Zeile ~126) einfuegen.
   Exit-Code auswerten, nicht die leere Ausgabe (Muster T004612/T005958):
   ```bash
   _merged_pr_head_oid() {
     local branch="$1" out
     if ! out="$(gh pr list --head "$branch" --state merged --json headRefOid 2>&1)"; then
       printf '%s' "$out" | head -1
       return 1
     fi
     printf '%s' "$out" | grep -o '"headRefOid"[[:space:]]*:[[:space:]]*"[^"]*"' \
       | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//'
   }
   ```
   - Exit 0 + leere Ausgabe: kein MERGED-PR → kein Signal.
   - Exit 0 + OID: MERGED-PR gefunden (bei mehreren: erstes Element).
   - Exit 1: gh-Ausfall, Meldung auf stdout (vom Aufrufer als KEEP-Grund verwendet).

3. **Helper `_merged_successor()`** — direkt danach einfuegen. Prueft, ob ein anderer
   Remote-Branch mit MERGED-PR fuer jede Datei aus `${DIVERGENT[@]}` identische Blobs traegt.
   `MERGED_HEADS` (Branchnamen gemergter PRs) und `DIVERGENT` (Divergenzmenge) werden vom
   Aufrufer befuellt; die Selbstreferenz wird uebersprungen (ein Branch ist nicht sein eigener
   Nachfolger):
   ```bash
   _merged_successor() {
     local branch="$1" s f a b ok
     while IFS= read -r s; do
       [ -z "$s" ] && continue
       [ "$s" = "$branch" ] && continue
       ok=1
       while IFS= read -r f; do
         [ -z "$f" ] && continue
         a="$(git rev-parse "$REMOTE/$s:$f" 2>/dev/null || echo MISSING)"
         b="$(git rev-parse "$REMOTE/$branch:$f" 2>/dev/null || echo MISSING)"
         [ "$a" = "$b" ] || { ok=0; break; }
       done < <(printf '%s\n' "${DIVERGENT[@]:-}")
       [ "$ok" -eq 1 ] && { echo "$s"; return 0; }
     done < <(printf '%s\n' "${MERGED_HEADS[@]:-}")
     return 1
   }
   ```
   Ein Treffer (echo + Exit 0) heisst: Branch-Inhalt ⊆ Nachfolger-Inhalt, Nachfolger gemergt →
   sicher reapbar. Ohne Treffer Exit 1 (kein Signal — Blob-Check entscheidet).

4. **`MERGED_HEADS` einmalig und lazy laden** — in der Kandidaten-Schleife, VOR dem
   Positiv-Signal-2-Block (nur wenn ein Kandidat ihn braucht; eine `gh`-Abfrage pro Lauf):
   ```bash
   if [ -z "${MERGED_HEADS_LOADED:-}" ]; then
     MERGED_HEADS_LOADED=1
     if merged_all="$(gh pr list --state merged --json headRefName 2>&1)"; then
       mapfile -t MERGED_HEADS < <(printf '%s' "$merged_all" \
         | grep -o '"headRefName"[[:space:]]*:[[:space:]]*"[^"]*"' \
         | sed 's/.*:[[:space:]]*"//; s/"$//' || true)
     fi
   fi
   ```
   Schlaegt die Abfrage fehl, bleibt die Liste leer → kein Signal 2 (unverifizierbar =
   verschonen). Deklarationen (`MERGED_HEADS=()`, `MERGED_HEADS_LOADED=0`, `DIVERGENT=()`)
   oben neben den anderen Defaults (Zeile ~62).

5. **Divergenzmenge vorziehen.** Den bestehenden Blob-Check-Block (Zeilen 236-246) so
   umbauen, dass `mapfile -t DIVERGENT < <(_diverging_files "$REMOTE/$branch")` GENAU EINMAL
   pro Branch laeuft — VOR dem Positiv-Signal-2-Block. Der Allowlist-Check darunter iteriert
   dann `${DIVERGENT[@]}` statt `_diverging_files` erneut aufzurufen (keine Doppelberechnung).

6. **Neue Gates in der Kandidaten-Schleife** — eingefuegt NACH dem Ticket-Status-Block
   (endet Zeile ~234), NUR im Zweig `freshness_decided=0` (freshness-Klasse laeuft ihren
   bestehenden Pfad), VOR dem Blob-Check:
   - **Positiv-Signal 1 (eigener MERGED-PR):**
     ```bash
     tip_sha="$(git rev-parse "$REMOTE/$branch")"
     if ! merged_oid="$(_merged_pr_head_oid "$branch")"; then
       echo "KEEP $branch — gh-Abfrage fehlgeschlagen: $merged_oid"
       continue
     fi
     if [ -n "$merged_oid" ] && [ "$merged_oid" = "$tip_sha" ]; then
       echo "REAP $branch"
       REAP_LIST+=("$branch")
       continue
     fi
     ```
   - **Positiv-Signal 2 (Nachfolge-Branch):** nur wenn kein Signal 1 gegriffen hat:
     ```bash
     if [ "${#MERGED_HEADS[@]:-0}" -gt 0 ] && _merged_successor "$branch"; then
       echo "REAP $branch"
       REAP_LIST+=("$branch")
       continue
     fi
     ```
   - Danach laeuft der bestehende Allowlist-Check ueber `${DIVERGENT[@]}` unveraendert.

7. **KEEP-Begruendungen.** Nur eine neue Begruendung entsteht (Signal-1-gh-Ausfall,
   Zeile oben); alle anderen Faelle behalten ihre bestehenden Gruende (Blob-Check, Ticket,
   offener PR). Der Ausgabe-Vertrag REAP/KEEP/DELETED bleibt unveraendert.

## Acceptance

- Sweep-Dry-Run meldet gemergte Branches mit Abweichung ausserhalb der Allowlist als REAP,
  sobald ein eigener MERGED-PR (SHA-Match) oder ein Nachfolger mit identischen Blobs existiert.
- Post-Merge-Pushes (Tip != headRefOid) und alle Unverifizierbarkeiten bleiben KEEP.
- `tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats` ist gruen (p2 laeuft danach).
- Bestehende Reaper-Tests (`tests/spec/ci-cd/branch-reaper*.bats`) bleiben gruen.
