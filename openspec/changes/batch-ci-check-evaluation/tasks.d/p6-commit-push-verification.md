# P6 — Commit-Push-Verifikation (T002815)

Rolle: **impl**. Fix für T002815 (Runbook-Ebene, wie vom Ticket vorgeschlagen): Ein vom
commit-msg-Hook abgelehnter `git commit` gefolgt von einem durchlaufenden `git push` in
derselben Kommando-Kette pusht nur den älteren Merge-Commit — die Push-Ausgabe ist von
einem Erfolg nicht unterscheidbar (PR #3915/#3918). Die bestehende Commit-Verifikation in den
git-workflow-Skills (T000925, git-crypt-Clean-Filter) wird um die Hook-Ablehnung ergänzt.

## File `.claude/skills/git-workflow/SKILL.md` (geändert)

### Task P6.1 — Commit-Verifikation um Hook-Ablehnung erweitern

- [ ] Im Schritt 2 (Commit) den bestehenden Block „Commit-Verifikation" (T000925,
      `HEAD_SHA != BASE_SHA`) um den T002815-Fall ergänzen: Nach `git commit` IMMER
      `git log -1 --oneline` ausführen und prüfen, dass der erwartete Commit (Subject
      sichtbar) gelandet ist — eine Hook-Ablehnung („commit-msg hook rejected the message")
      hinterlässt KEINEN neuen Commit; in dem Fall NIE im selben Kommando weiterpushen.
- [ ] Als Gegenmittel dokumentieren: `git commit … && git push …` verketten (Exit-Code der
      Kette bricht beim abgelehnten Commit ab) ODER SHA-Prüfung nach dem Commit — mit
      Verweis auf `scripts/factory/mishap-rollup.sh` (verkettet laut Skriptkopf bereits
      bewusst).
- [ ] Bezug auf den pre-push Empty-Branch-Guard [T002240] herstellen: Der Hook blockt nur
      die Neuanlage eines leeren Branches; der T002815-Fall (älterer Merge-Commit maskiert
      die Ablehnung) ist NICHT durch den Hook erkennbar und bleibt Agenten-Pflicht.
- [ ] Kennzeichnung im Text mit T002815, damit der Paritäts-Test (P7.6) einen stabilen
      Anker hat.

## File `.agents/skills/git-workflow/SKILL.md` (geändert)

### Task P6.2 — identische Ergänzung in der zweiten Harness

- [ ] Dieselbe Ergänzung im Schritt-2-Block einpflegen (die beiden SKILL.md-Dateien sind
      bewusst parallel — beide Harnesses müssen dieselbe Regel tragen); Abweichungen im
      Aufbau beim Umsetzen dokumentieren, die Regel selbst identisch formulieren.
- [ ] Verweis auf den Paritäts-Test (P7.6), der beide Dateien prüft.

### Task P6.3 — Verifikation (konkrete Test-Schritte)

S1-Budget: beide SKILL.md-Dateien sind nicht S1-gemessen (unbaseline/ignored) — kein
Zahlen-Claim.

- [ ] Test-Schritt A: `grep -qF "T002815" .claude/skills/git-workflow/SKILL.md` UND
      `.agents/skills/git-workflow/SKILL.md` — beide Treffer.
- [ ] Test-Schritt B: `grep -qF "git log -1 --oneline"` in beiden Dateien — die
      Verifikations-Regel ist wörtlich verankert.
- [ ] Test-Schritt C: `grep -rn "Commit-Verifikation" .claude/skills/git-workflow/
      .agents/skills/git-workflow/` — keine widersprechende Formulierung in zitierten
      Referenz-Dokumenten (Befund beim Umsetzen dokumentieren).
