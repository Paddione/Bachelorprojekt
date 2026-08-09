# T002770 — Reaper für verwaiste in_progress-Tickets
> **Type:** fix | **Severity:** trivial | **Effort:** mittel

## Tasks

1. [ ] Watchdog-Regel: `in_progress`-Tickets ohne Lock + ohne Remote-Branch nach 60min → `triage`
2. [ ] Kommentar mit Rückstellungsgrund ans Ticket hängen
3. [ ] Verifikation: `bash scripts/factory/watchdog.sh --dry-run` zeigt betroffene Tickets
