# p2 — Guard-Suffix-Normalisierung: `-T<id>`-Suffix-Drift im Worktree-Lock auflösen (T003991)

## Ziel

`scripts/hooks/worktree-write-guard.sh` kennt als einzige Pfad-Normalisierung `_abs_wt`
(Zeilen 122–127, relativ → absolut gegen `MAIN_ROOT`). `worktree-create.sh` legt den
Worktree aber mit `-T<id>`-Suffix an, auch wenn der Pfad ohne Suffix übergeben wird
(Design D2) — ein Lock, dessen `worktree`-Feld das Suffix trägt, zeigt damit auf einen
nicht existierenden Pfad. Der T002412-Skip (`[ -d "$wt" ] || continue`, Zeile 148)
verwirft den EIGENEN Claim als tot; der Schreibzugriff fällt in den Fremd-Zweig
(Zeilen 162–166) und Regel 3 (Zeilen 199–210) blockiert ALLE Schreibzugriffe der
eigenen Session.

Der Guard normalisiert den Lock-Pfad deshalb zusätzlich: existiert der gespeicherte Pfad
nicht, aber derselbe Pfad ohne `-T<digits>`-Suffix, gilt der reale (suffixfreie) Pfad —
VOR der SID-/Claim-Zuordnung, damit der eigene Claim als lebend erkannt wird.

## Budget (S1)

| Datei | Ist | Budget |
|---|---|---|
| `scripts/hooks/worktree-write-guard.sh` | 213 | 587 |

Messung 2026-08-14: `wc -l scripts/hooks/worktree-write-guard.sh` → 213. Baseline:
`nicht-baselined` (`jq -r '."S1:scripts/hooks/worktree-write-guard.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json`)
→ wirksame Schwelle = statisches `.sh`-Limit **800** aus `docs/code-quality/gates.yaml`
(T002452-Anhebung). Budget = 800 − 213 = **587**. Die Erweiterung (~12 Zeilen) liegt weit
unter der Schwelle — kein Split/Shrink nötig.

## Task 1: RED — Failing-Test aus dem Tests-Partial p6 läuft rot (≤ 2h)

Referenz auf den Failing-Test des Tests-Partials p6:
`tests/spec/batch-worktree-guard-tooling-fixes/write-guard-suffix-normalization.bats` —
Lock-JSON mit `worktree`-Pfad + `-T<id>`-Suffix, realer Worktree-Ordner ohne Suffix,
eigene `owner_sid` im Claim. Der unveränderte Guard erkennt den eigenen Claim nicht als
lebend und blockiert den Schreibzugriff. Die Testdatei wird im Tests-Partial p6 angelegt
und liegt vor diesem Lauf vor.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/write-guard-suffix-normalization.bats
# expected: FAIL (rot — die Suffix-Normalisierung aus Task 2 existiert noch nicht)
```

## Task 2: GREEN — `_abs_wt` um die Suffix-Drift-Normalisierung erweitern (≤ 2h)

Datei: `scripts/hooks/worktree-write-guard.sh` (Ist 213 · Budget 587).

Geänderte Stelle: Funktion `_abs_wt()` (Zeilen 122–127) samt Doc-Kommentar
(Zeilen 115–121). Der Aufruf in Zeile 137 bleibt unverändert — die Normalisierung wirkt
damit automatisch VOR der SID-/Claim-Zuordnung (Zeile 139), dem T002412-Skip
(Zeile 148) und dem Fremd-Zweig (Zeilen 162–166).

Schritte:

1. `_abs_wt` auf eine lokale Variable umstellen und nach der Absolut-Machung
   (relativ → `$MAIN_ROOT/…`) die Drift-Prüfung ergänzen:
   - existiert der normalisierte Pfad nicht (`[ ! -d "$wt" ]`) UND
   - matcht er das Ticket-Suffix-Muster am Ende (`[[ "$wt" =~ -T[0-9]{6,}$ ]]`),
   - dann das Suffix per Parameter-Expansion abstreifen (`"${wt%-T*}"` — entfernt vom
     letzten `-T`, dessen Position der Regex am Pfadende bestätigt hat) und
   - NUR wenn der gestrippte Pfad existiert (`[ -d "$stripped" ]`) auf diesen
     normalisieren.
2. Konservativ bleiben: ein lebender Lock-Pfad wird nie umgeschrieben, und es wird nie
   auf einen nicht existierenden Pfad normalisiert (beide Bedingungen absichern).
3. Doc-Kommentar (Zeilen 115–121) um den neuen Schritt ergänzen — Referenz T003991,
   Drift-Quelle `worktree-create.sh` (Design D2).

Referenz-Snippet (die Bedingungslogik, keine wörtliche Festschreibung):

```bash
_abs_wt() {
  local wt
  case "$1" in
    /*) wt="$1" ;;
    *)  wt="$MAIN_ROOT/${1#./}" ;;
  esac
  # T003991: Lock-Pfad kann -T<id>-Suffix tragen, realer Worktree liegt ohne.
  if [ ! -d "$wt" ] && [[ "$wt" =~ -T[0-9]{6,}$ ]]; then
    local stripped="${wt%-T*}"
    [ -d "$stripped" ] && wt="$stripped"
  fi
  printf '%s\n' "$wt"
}
```

Warum hier: `_abs_wt` ist die einzige Pfad-Normalisierung des Guards (Verifier-Befund).
Der T002412-Skip überspringt eigene Claims auf nicht existierenden Pfaden — mit
Suffix-Drift (Lock sagt `.worktrees/<slug>-T004295`, real liegt `.worktrees/<slug>`)
fällt der eigene Claim in den Fremd-Zweig und Regel 3 blockiert die Session. Die
Normalisierung vor der Claim-Zuordnung heilt genau diesen Pfad (Rot-Grün aus Task 1).

## Task 3: Verifikation (≤ 2h)

- Rot-Grün abschließen: `tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/write-guard-suffix-normalization.bats` → grün (der RED-Lauf aus Task 1 wird grün).
- Syntax: `bash -n scripts/hooks/worktree-write-guard.sh` — gültiger Syntax-Check für
  eine reine `.sh`-Datei (nur für `.bats` ist `bash -n` unbrauchbar, T002351-M2).
- Zeilenbudget: `wc -l scripts/hooks/worktree-write-guard.sh` ≤ 800 (wirksame Schwelle;
  ~12 Zeilen Zuwachs sind im Budget 587 eingeplant).
- Batch-Finalgates laufen über den Index-Plan Task 7 (`task test:changed`,
  `task freshness:regenerate`, `task freshness:check`) — hier bewusst nicht dupliziert.

## Acceptance

- Ein Lock mit `-T<digits>`-Suffix im `worktree`-Feld, dessen realer Ordner ohne Suffix
  existiert, gilt für die eigene SID als lebender eigener Claim — Schreibzugriffe unter
  dem realen Pfad werden erlaubt, statt von Regel 3 blockiert zu werden.
- Lebende Pfade und nicht existierende Zielpfade werden nie umgeschrieben (konservativ).
- `write-guard-suffix-normalization.bats` (aus p6) grün; bestehende Guard-Tests bleiben
  grün — ohne Drift ändert sich kein Verhalten (Positiv-Anker, T002356-M1).
- Datei bleibt unter der wirksamen S1-Schwelle (800); keine Baseline-Einträge nötig.
