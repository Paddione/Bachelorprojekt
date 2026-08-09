#!/usr/bin/env bash
# scripts/lib/kubelet-cert-hint.sh — T002999
# Sourcebare Hinweis-Bibliothek: erkennt die irrefuehrende x509-Kubelet-Fehlermeldung
# im kubectl-exec-Fehlerpfad und uebersetzt sie in einen diagnostischen Hinweis.
#
# Die Fehlermeldung "tls: failed to verify certificate: x509: certificate is valid
# for … not …" nennt psql und die Ticket-Tabelle und zeigt damit auf das falsche
# Subsystem. Der gemeinsame Exec-Helfer (_exec_sql in _ticket-core.sh) wendet
# _kubelet_cert_hint auf seine stderr-Ausgabe an, bevor er sie an den Aufrufer
# weiterreicht.
#
# Eigene Datei statt Funktion in _ticket-core.sh: die vier weiteren _pgpod-Kopien
# (scripts/factory/lib.sh, scripts/factory/conflict-check.sh,
# scripts/mishap-categorize.sh, scripts/batch-gap-analysis.sh) koennen sie ohne
# Umbau uebernehmen (T002386).

# Erkennungsmuster: x509 und "certificate is valid for" — an der Fehlersemantik
# ankern, nicht am exakten kubectl-Wortlaut [T002716].
_kubelet_cert_hint() {
  local text="$1"
  if [[ "$text" == *x509* && "$text" == *"certificate is valid for"* ]]; then
    {
      echo ""
      echo "HINWEIS (T002999): Die obige Fehlermeldung betrifft das KUBELET-Serving-Zertifikat"
      echo "des k3d-Clusters — NICHT die Datenbank oder das Ticket-System, auch wenn die Meldung"
      echo "\"psql\" und \"tickets\" nennt. Die Ursache ist eine veraltete IP im SAN des"
      echo "Kubelet-Zertifikats (typisch nach Docker-IP-Tausch, Container-Neustart o.ae.)."
      echo ""
      echo "  Diagnose:  bash scripts/sdlc/kubelet-cert-check.sh"
      echo "  Reparatur: bash scripts/sdlc/kubelet-cert-check.sh --repair"
      echo ""
    } >&2
  fi
  return 0
}
