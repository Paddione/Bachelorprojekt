# p4 — recovery-browser: Gate-Assertion auf Emails-Datei-Verfahren (T011902)

## Ziel

Seit der Keycloak→Pocket-ID-Migration (T001068, Commit 1fe5859de, PR #2042) nutzt
`k3d/recovery-browser.yaml` das Flag `--authenticated-emails-file` statt
`--allowed-groups=/recovery-access` (Pocket ID hat kein Gruppenkonzept —
Kommentar im Manifest, Zeile 10). Der Test
`tests/unit/recovery-browser-manifest.bats` prüft seit seiner Erstellung
(PR #1271) die alte Keycloak-Syntax und schlägt fehl.

Die SICHERHEITSZUSICHERUNG ("oauth2-proxy ist gegated") muss erhalten bleiben:
nicht nur das Flag-Literal tauschen, sondern das gesamte Verfahren zusichern —
Flag UND Datenquelle (ConfigMap-Mount). Die Testdatei ist der älteste Fall der
Serie; der Testname wird an die neue Semantik angepasst.

## Steps

1. **RED.** Testlauf auf dem aktuellen Stand:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/recovery-browser-manifest.bats
# expected: FAIL (grep auf --allowed-groups=/recovery-access findet nichts)
```

2. **GREEN.** In `tests/unit/recovery-browser-manifest.bats` den Test
   "oauth2-proxy is gated to the /recovery-access group" umbauen:
   - Testname → "oauth2-proxy is gated via authenticated-emails-file".
   - Assertion 1: `grep -q -- "--authenticated-emails-file=/etc/oauth2/allowed-emails" "$MF"`.
   - Assertion 2 (Datenquelle, erhält die Sicherheitstiefe): die ConfigMap
     `oauth2-proxy-recovery-allowed-emails` wird als Volume eingebunden —
     `grep -q -- "name: oauth2-proxy-recovery-allowed-emails" "$MF"`.

   Die übrigen Tests der Datei (Manifest existiert, readOnly-Mount, Client/Upstream,
   Ingress, kustomization) bleiben unverändert.

3. **Verifikation.**

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/recovery-browser-manifest.bats
```

## Acceptance

- Der Gate-Test assertiert das aktuelle Verfahren (Flag + ConfigMap-Mount) — die
  Zusicherung "der Proxy ist gegated" ist nicht schwächer geworden.
- Kein Produktcode geändert (`k3d/recovery-browser.yaml` unangetastet).
