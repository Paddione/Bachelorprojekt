# Partial p1 — Branch-Name-Guard in worktree-create.sh + pre-commit

**Ticket:** T002471
**Rolle:** `branch-name-guard`
**Ziel-Dateien:** `scripts/worktree-create.sh`, `.githooks/pre-commit`
**Mishaps:** M4 (Branch-Namen mit Kleinbuchstaben)

## Mishap 4

worktree-create.sh erlaubt Branch-Namen wie `chore/mishap-t002424`, die der pre-commit-Guard
später ablehnt (case-sensitive Regex `T[0-9]{6,}`). Planarbeit bleibt für immer im Staging.

## Fix: worktree-create.sh

In `scripts/worktree-create.sh`, nachdem der Branch-Name aus `<slug>` und Ticket-ID konstruiert wurde,
einen Guard einbauen:

```bash
# [T002471-M4] Branch-Name-Guard: Ticket-ID muss GROSS geschrieben sein
_ticket_id=$(echo "$branch" | grep -oE '[tT][0-9]{6,}' | head -1)
if [[ -n "$_ticket_id" && "$_ticket_id" != "$(echo "$_ticket_id" | tr '[:lower:]' '[:upper:]')" ]]; then
  echo "ERROR: Ticket-ID im Branch-Namen '$branch' ist kleingeschrieben. Verwende ${_ticket_id^^} statt $_ticket_id." >&2
  exit 1
fi
```

## Fix: .githooks/pre-commit

Die Fehlermeldung beim case-sensitive Regex-Mismatch verbessern, damit der User versteht,
dass der Branch-Name umbenannt werden muss und wie:

```bash
# Aktuelle Meldung (ca. Zeile 129):
#   echo "✗ keine Ticket-ID gefunden. Sie muss GROSS geschrieben sein: T002338, nicht t002338."
# Neu: Hinweis auf Branch-Umbenennung anfügen:
echo "  Fix: git branch -m <aktueller-name> <name-mit-grossem-T>"
```

## Abnahmekriterien

1. worktree-create.sh lehnt Branch-Namen mit kleinem 't' in der Ticket-ID ab
2. pre-commit-Guard zeigt Branch-Umbenennungs-Kommando in der Fehlermeldung
3. Ein Branch ohne Ticket-ID (chore/cleanup) wird weiterhin akzeptiert
