# Release-Attribution — Checkliste

**Ticket:** T901032
**Policy:** `docs/legal/reuse-policy.md`

Vor jedem Release alle Punkte abhaken. Jeder Punkt nennt die prüfende
Stelle: Manifest (`docs/legal/third-party-manifest.json`), NOTICE
(`docs/legal/NOTICE.md`), Checker (`scripts/legal/license-check.sh`)
oder Policy-Anker.

## Checkliste

- [ ] **Manifest aktuell.** Jede Drittkomponente steht mit exakt
  gepinnter Version und verifizierter Revision im Manifest; keine
  Ranges, kein `latest`. Prüfstelle: Manifest, Anker RP-3.
- [ ] **NOTICE aktuell.** Jeder Manifest-Eintrag hat einen Abschnitt in
  NOTICE mit Name, Version, Quelle, Lizenz und Copyright-Zeile.
  Prüfstelle: NOTICE gegen Manifest, automatisiert durch den Checker.
- [ ] **Lizenztexte beigelegt.** Anwendbare LICENSE/NOTICE-Texte und
  Apache-2.0-Änderungshinweise liegen dem Release-Artefakt bei.
  Prüfstelle: Release-Artefakt gegen Manifest-`notices`, Anker RP-3.
- [ ] **Checker grün.** `bash scripts/legal/license-check.sh` meldet
  `license-check: PASS`; der CI-Workflow `license-policy` ist grün.
  Prüfstelle: Checker und CI.
- [ ] **Keine AGPL-Ausnahme still genehmigt.** Jede AGPL-Ausnahme
  braucht den separaten Architektur- und Lizenzbeschluss mit
  Compliance-Plan; ohne Beschluss kein AGPL-Material im Release.
  Prüfstelle: Anker RP-4, Checker-Denylist.
- [ ] **Quell-Angebots-Pflichten geprüft.** Bei Netznutzung
  modifizierter Versionen copyleft-lizenzierter Komponenten sind
  anwendbare Quell-Angebots-Pflichten erfüllt und dokumentiert.
  Prüfstelle: Anker RP-4 und RP-7.
- [ ] **Assets attribuiert.** Jedes ausgelieferte Asset ist nach
  `docs/legal/asset-licensing.md` dokumentiert; Quarantäne-Material
  ist nicht im Release enthalten. Prüfstelle: Asset-Doku, Anker RP-6.
