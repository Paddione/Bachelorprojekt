#!/usr/bin/env bash
# scripts/gitlab-pipeline-check.sh
# Ticket: T012267 — Diagnose-Werkzeug (read-only) fuer den GitLab-Spiegel.
#
# Fragt den Status der letzten Pipeline auf main des GitLab-Spiegel-Projekts
# (gitlab.com/p.korczewski/Bachelorprojekt, Projekt-ID 85506856) ueber die
# oeffentliche GitLab-API ab — ohne Token lesbar. Keine
#
# PROJEKT-ID KORRIGIERT (T012405): Bis hierher stand 85496968 im Skript. Dieses
# Projekt heisst inzwischen 'Paddione/Bachelorprojekt-deletion_scheduled-85496968'
# und ist zur Loeschung vorgemerkt — der Mirror-Workflow pusht laengst nach
# 85506856 (belegt im Log von Actions-Run 32134537198: "To create a merge request
# ... visit https://gitlab.com/p.korczewski/Bachelorprojekt/-/merge_requests/new").
#
# Das war der gefaehrlichste denkbare Fehler fuer genau dieses Skript: Das tote
# Projekt ANTWORTET weiter und liefert alte, gruene Pipelines. Die Diagnose war
# also nicht kaputt, sondern falsch — sie meldete "Pipeline gruen" fuer ein
# Projekt, in das seit dem Umzug nichts mehr gepusht wird. Ein Ausfall waere
# harmloser gewesen als diese Antwort.
#
# Schreiboperation, kein CI-Gate: das Skript ist ein Diagnose-Werkzeug fuer
# Agents und Runbooks.
#
# Exit-Codes (Klassifikation):
#   0  success        — Pipeline gruen
#   1  failed/canceled — Pipeline rot
#   2  pending/running — KEIN Urteil: kein Runner mit passendem Tag oder
#                        Pipeline haengt (bewusst designt, kein Cloud-Fallback)
#   3  leere/ungueltige API-Antwort oder unbekannter Status — kein Urteil
#
# Abhaengigkeiten: curl + jq (beide in den GitHub-CI-Runnern vorhanden).

set -u

# Ueberschreibbar, damit ein Projektwechsel keinen Commit braucht — der Default
# ist die einzige Fundstelle der ID.
GITLAB_PROJECT_ID="${GITLAB_PROJECT_ID:-85506856}"
API="https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}/pipelines?ref=main&per_page=1"
BODY="$(curl -fsSL "$API" 2>/dev/null || echo "")"

# Nichtleere-Guard ZUERST (T003109-Semantik): eine leere Antwort ist kein
# Urteil — nie "alles ok".
if [[ -z "$BODY" ]] || ! printf '%s' "$BODY" | jq -e 'type == "array" and length > 0' >/dev/null; then
  echo "gitlab-pipeline-check: kein Urteil (leere/ungueltige API-Antwort)" >&2
  exit 3
fi

STATUS="$(printf '%s' "$BODY" | jq -r '.[0].status // "unknown"')"
CREATED="$(printf '%s' "$BODY" | jq -r '.[0].created_at // "?"')"
echo "gitlab-pipeline-check: status=${STATUS} created_at=${CREATED}"

case "$STATUS" in
  success) exit 0 ;;
  failed|canceled) echo "gitlab-pipeline-check: Pipeline rot (${STATUS})" >&2; exit 1 ;;
  pending|running)
    echo "gitlab-pipeline-check: ${STATUS} — kein Runner mit passendem Tag oder Pipeline haengt; KEIN Urteil (Memory: pending statt failed ohne Runner)" >&2
    exit 2 ;;
  *) echo "gitlab-pipeline-check: unbekannter Status '${STATUS}' — kein Urteil" >&2; exit 3 ;;
esac
