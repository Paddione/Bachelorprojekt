# p1-stage-auto-tick — Stage-Auto-Tick-Wake (force-tick-Flag + factory.service-Kick)

Rolle: `impl` · Ziel-Dateien: `scripts/vda/ticket/stage-plan.sh`,
`openspec/changes/unified-llm-gateway/tasks.d/p3-factory-wake.md`.

Erfüllt `REQ-SF-AUTOTICK-001` (design.md §p1, Entscheidungen D1/D2): nach dem
`plan_staged`-UPDATE schreibt `stage-plan.sh` idempotent das Steuer-Flag
`force-tick-requested` (`tickets.factory_control`, `brand IS NULL`,
`set_by='stage-plan'`) und startet best-effort `factory.service`, damit ein frisch
gestagter Plan **sofort** getickt wird statt bis zum nächsten `factory.timer`-Intervall
zu warten. Beide Trigger sind non-fatal: DB- oder systemd-Fehler degradieren auf den
Timer-Pfad (Warnung auf stderr, Exit bleibt 0). Dieses Partial **supersedet
T002102-p3 Task 1/4/5** (D2) — der Supersede-Hinweis wird in Task 2 dort eingetragen.

**Kein** `task test:*`-Final-Verify (lebt im `tasks.md`-Index), **kein** RED-Failing-Test-Step
(lebt in `p5-tests`). Der rot→grün-Test für dieses Verhalten ist der p5-Fall
`stage-plan writes force-tick-requested flag` in `tests/spec/software-factory.bats`
(design.md §p5 Punkt 1). Jeder Task hier endet mit einem konkreten lokalen Prüf-Step.

**Konsument bleibt unangetastet:** `scripts/factory/wakeup.sh:70-83` liest das Flag
(`SELECT … LIMIT 1`) und löscht **alle** passenden Zeilen (`DELETE … WHERE key=…
AND brand IS NULL`, ohne LIMIT). Dadurch ist die Präsenz-Semantik selbstheilend: selbst
falls eine `NULL`-brand-Zeile nicht dedupliziert wird (Postgres behandelt NULL im
`UNIQUE (key, brand)`-Index als distinct), bleibt wiederholtes Stagen harmlos.

## S1-Zeilenbudgets (wirksame Schwelle je Datei)

| `path` | Ist | Budget |
| --- | --- | --- |
| `scripts/vda/ticket/stage-plan.sh` | 58 | 442 |

`scripts/vda/ticket/stage-plan.sh` ist **nicht** gebaselined (`s1_baseline: null`) ⇒
wirksame Schwelle = `.sh`-Extension-Limit 500, Budget = 500 − 58 = **442**. Der Einschub
umfasst ~14 Zeilen (Endstand ~72), reichlich Reserve. Die zweite Ziel-Datei
`openspec/changes/unified-llm-gateway/tasks.d/p3-factory-wake.md` ist Markdown und
**S1-ungated** (kein Zeilenbudget); sie kollidiert mit keinem anderen Partial dieses Change.

---

## Task 1: `stage-plan.sh` — Force-Tick-Flag-Upsert + `factory.service`-Kick

Nach dem `EOF`, das den `factory_phase_events`-INSERT-Heredoc terminiert (aktuell Z.52),
und **vor** dem finalen `echo "Ticket $id staged …"` (aktuell Z.53) zwei non-fatale
Wake-Trigger einfügen. Der DB-Write nutzt das bestehende `_exec_sql "$pod" -v … <<'EOF'`-
Heredoc-Muster (wie Z.25/29/42) und mirrort die `writeControl()`-Semantik aus
`website/src/lib/factory-floor.ts:79-86` byte-genau (`INSERT … ON CONFLICT (key, brand)
DO UPDATE`, `brand` `NULL`) — dieselbe Constraint `UNIQUE (key, brand)` aus
`website/src/lib/tickets/tables/factory-control.ts:18`. Der `set_by`-Wert ist
`'stage-plan'` (nicht `'admin-ui'`), damit die Herkunft im Audit unterscheidbar bleibt.

Der Fehlerpfad ist explizit: `_exec_sql` läuft mit `-v ON_ERROR_STOP=1`, liefert bei
DB-Fehler also non-zero. Der `if ! …; then`-Wrapper fängt das ab, gibt eine Warnung auf
stderr aus und lässt `main` **weiterlaufen** (kein Abbruch, Exit 0). Der `systemctl`-Kick
ist fire-and-forget und darf ohne `--user`-Manager nicht abbrechen.

- [ ] Direkt nach Z.52 (`EOF` des `factory_phase_events`-INSERT), vor dem finalen `echo`
      (Z.53), den Force-Tick-Upsert via `_exec_sql "$pod" -v setby='stage-plan'` in einem
      `if ! …; then echo WARN >&2; fi`-Block einfügen (non-fatal, Warnung auf stderr).
- [ ] Danach `systemctl --user start factory.service 2>/dev/null || true` anhängen
      (fire-and-forget, non-fatal ohne systemd).
- [ ] Kommentar: Beide Trigger sind Best-Effort — ohne DB/systemd kommt der Tick weiterhin
      über `factory.timer` (Degradation auf heutiges Verhalten); Flag-Semantik + Konsument
      (`wakeup.sh:70-83`) referenzieren.

```bash
  # Auto-tick wake (REQ-SF-AUTOTICK-001; supersedes T002102-p3 Task 1/4/5, D2):
  # after a successful stage, request a force-tick and kick factory.service so the
  # staged plan is picked up now instead of on the next factory.timer interval.
  # Both triggers are best-effort — a DB or systemd failure degrades to the timer
  # path (warn, non-fatal, exit stays 0). Flag mirrors writeControl()
  # (website/src/lib/factory-floor.ts): key='force-tick-requested', brand NULL,
  # ON CONFLICT (key, brand). The consumer (scripts/factory/wakeup.sh:70-83) reads
  # LIMIT 1 and DELETEs all matching rows, so a repeated stage is harmless even
  # when a NULL-brand row is not deduped by the unique index.
  if ! _exec_sql "$pod" -v setby='stage-plan' <<'EOF' >/dev/null 2>&1
INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
VALUES ('force-tick-requested', NULL, now()::text, :'setby', now())
ON CONFLICT (key, brand) DO UPDATE
  SET value = EXCLUDED.value, set_by = EXCLUDED.set_by, updated_at = now();
EOF
  then
    echo "WARN: stage-plan: force-tick flag write failed — factory will tick on the next factory.timer interval" >&2
  fi
  systemctl --user start factory.service 2>/dev/null || true
```

**Verify:**

```bash
bash -n scripts/vda/ticket/stage-plan.sh
# erwartet: exit 0 (keine Syntaxfehler)
grep -c "force-tick-requested" scripts/vda/ticket/stage-plan.sh
# erwartet: 1 (genau eine Trefferzeile im Upsert)
grep -c "systemctl --user start factory.service" scripts/vda/ticket/stage-plan.sh
# erwartet: 1 (fire-and-forget-Kick vorhanden)
```

---

## Task 2: `p3-factory-wake.md` — Supersede-Hinweisblock oben eintragen (D2)

In `openspec/changes/unified-llm-gateway/tasks.d/p3-factory-wake.md` **oberhalb** der
H1-Zeile einen HTML-Kommentar-Hinweisblock einfügen, der Task 1/4/5 dieses Partials als
supersedet markiert und auf `factory-flash-bonsai-gang / p1-stage-auto-tick` verweist.
**Sonst keine Zeile ändern** — Task 2 (dispatcher `/healthz`-Gate) und Task 3
(`FACTORY_MODEL`) dieses Fremd-Partials bleiben gültig und werden ausdrücklich als
weiterhin gültig benannt. Der Block ist ein reiner Hinweis-Kommentar; der restliche
Inhalt der Datei bleibt unverändert (kein Löschen, kein Umschreiben der Tasks dort).

- [ ] Als allererste Zeilen der Datei (vor `# p3-factory-wake — …`) den unten stehenden
      `<!-- … -->`-Kommentarblock einfügen.
- [ ] Verifizieren, dass keine bestehende Zeile der Datei geändert/entfernt wurde
      (`git diff --stat` zeigt nur Additions).

```markdown
<!-- SUPERSEDED (partial, D2): Tasks 1, 4 and 5 of this partial (stage-plan force-tick
     writer, forcetick-poll.sh, factory-forcetick.service/.timer) are SUPERSEDED by
     factory-flash-bonsai-gang / p1-stage-auto-tick (T002128, REQ-SF-AUTOTICK-001),
     which wires the stage->tick wake directly in stage-plan.sh (flag + factory.service
     kick, no poll timer). Do NOT implement Tasks 1/4/5 from here. Tasks 2 (dispatcher
     /healthz gate) and 3 (FACTORY_MODEL env split-brain fix) remain valid and stay with
     unified-llm-gateway. -->
```

**Verify:**

```bash
head -8 openspec/changes/unified-llm-gateway/tasks.d/p3-factory-wake.md | grep -q "SUPERSEDED (partial, D2)" && echo "supersede-note ok"
# erwartet: "supersede-note ok"
git -C . diff --stat openspec/changes/unified-llm-gateway/tasks.d/p3-factory-wake.md
# erwartet: nur Additions (keine gelöschten Zeilen an bestehenden Tasks)
```
