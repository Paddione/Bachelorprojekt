#!/usr/bin/env bats
# brain-ingress-policy.bats — T002465 (K6): allow-website-to-brain-ingress
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): MANIFEST-STRUKTUR — die
# dokumentierte Ausnahme von der Output-Regel. Geprueft wird der gerenderte
# Kustomize-Baum, nicht der Dateitext: was zaehlt, ist die Policy, die der
# Cluster tatsaechlich zu sehen bekommt, nicht die Vorlage im Repo.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  RENDERED="$(mktemp)"
  kubectl kustomize "$REPO/k3d" > "$RENDERED" 2>/dev/null
}

teardown() {
  rm -f "$RENDERED"
}

@test "T002465 Positiv-Anker: allow-website-to-vaultwarden-ingress rendert genau einmal" {
  # Ohne diesen Anker beweist ein Treffer fuer `brain` nichts ueber die
  # Renderbarkeit des Baums — ein komplett leerer Kustomize-Output wuerde
  # alle Negativ-Aussagen vakuos bestaetigen.
  [ "$(grep -c 'name: allow-website-to-vaultwarden-ingress' "$RENDERED")" -eq 1 ]
}

@test "T002465 allow-website-to-brain-ingress rendert mit podSelector app=brain" {
  [ "$(grep -c 'name: allow-website-to-brain-ingress' "$RENDERED")" -eq 1 ]
  local block
  block="$(awk '/name: allow-website-to-brain-ingress/{f=1} f{print} /^---$/{if(f)exit}' "$RENDERED")"
  echo "$block" | grep -q 'app: brain'
}

@test "T002465 allow-website-to-brain-ingress erlaubt Ingress auf Port 8787" {
  # Port 8787 ist der Container-Port (k3d/brain.yaml: containerPort 8787),
  # nicht der Service-Port 80 — NetworkPolicies filtern auf dem Container-Port.
  grep -A 14 'name: allow-website-to-brain-ingress' "$RENDERED" | grep -q 'port: 8787'
}

@test "T002465 allow-website-to-brain-ingress traegt kein egress (Negativtest + Anker)" {
  # Positiv-Anker: der Block wurde ueberhaupt gefunden — sonst waere die
  # Negativ-Aussage trivial. Die Policy ist eine reine Ingress-Erlaubnis;
  # egress wuerde die Flugbahn vom Website-Pod in andere Netze oeffnen.
  local block
  block="$(awk '/name: allow-website-to-brain-ingress/{f=1} f{print} /^---$/{if(f)exit}' "$RENDERED")"
  [ -n "$block" ]
  ! echo "$block" | grep -q 'egress'
}
