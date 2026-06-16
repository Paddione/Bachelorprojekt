#!/usr/bin/env bash
# scripts/lib/ticket-grill.sh
# Pure helper sourced by ticket.sh — declares cmd_grill only.
# No top-level side effects, no back-imports. Uses _pgpod/_exec_sql/$NS/$CTX/$USER/$DB from ticket.sh.
#
# Writes a grilling Q/A session into tickets.tickets.grilling_answers (JSONB), per-question
# accumulating merge, forward-compatible with the T000737 GrillingAnswersPanel
# (shape: { <questionnaire-id>: { <questionId>: <answer> } }). Optionally posts a readable
# timeline comment (author 'grilling') unless --no-comment.

# Build a compact JSON object {"qid":"text",...} from repeated --answer qid=text pairs.
# Each pair is shell-quoted into a jq arg; jq guarantees valid JSON escaping.
_grill_answers_json() {
  local json='{}' pair k v
  for pair in "$@"; do
    k="${pair%%=*}"; v="${pair#*=}"
    if [[ "$pair" != *=* || -z "$k" ]]; then
      echo "ERROR: --answer expects <qid>=<text> (got '$pair')." >&2
      return 2
    fi
    json=$(jq -c --arg k "$k" --arg v "$v" '. + {($k): $v}' <<<"$json")
  done
  printf '%s' "$json"
}

# Parse a tolerant grilling doc into TSV output:
#   First line:  questionnaireId \t title \t count
#   Rest lines:  id \t prompt \t section \t answer (empty if blank)
# Mirrors website/src/lib/tickets/grilling.ts parseGrillingDoc (same markers/placeholders/auto-ids).
_grill_parse_doc() {
  local file="$1" fallback="$2"
  awk -v fallback="$fallback" '
    function flush(  a) {
      if (have) {
        ids[n]=(curid!="" ? curid : "q" (n+1)); prompts[n]=curprompt; secs[n]=cursec;
        ans[n]=curans; n++;
      }
      have=0; curid=""; curprompt=""; cursec=""; curans="";
    }
    function trim(s){ gsub(/^[ \t]+|[ \t]+$/,"",s); return s }
    function isblank(s,  t){ t=tolower(trim(s));
      return (t==""||t=="—"||t=="-"||t=="tbd"||t=="(offen)"||t=="n/a") }
    BEGIN{ fm=0; n=0; have=0; qid=fallback; title="" }
    NR==1 && $0 ~ /^---[ \t]*$/ { fm=1; next }
    fm==1 {
      if ($0 ~ /^---[ \t]*$/) { fm=0; next }
      if ($0 ~ /^questionnaire[ \t]*:/) { sub(/^questionnaire[ \t]*:[ \t]*/,""); qid=trim($0); next }
      if ($0 ~ /^title[ \t]*:/) { sub(/^title[ \t]*:[ \t]*/,""); title=trim($0); next }
      next
    }
    {
      line=$0
      if (line ~ /^#{2,3}[ \t]+/) { flush(); p=line; sub(/^#{2,3}[ \t]+/,"",p); split_id(p); have=1; next }
      if (line ~ /^[ \t]*(q?[0-9]+[.)])[ \t]+/) {
        flush(); m=line; eid=m; sub(/^[ \t]*/,"",eid);
        if (eid ~ /^q[0-9]+/) { num=eid; sub(/[.)].*/,"",num); sub(/^q/,"",num); curid_pre="q" num } else { curid_pre="" }
        p=line; sub(/^[ \t]*q?[0-9]+[.)][ \t]+/,"",p); split_id(p); if (curid_pre!="") curid=curid_pre; have=1; next
      }
      if (line ~ /^[ \t]*\*\*.+\?\*\*[ \t]*$/) { flush(); p=line; gsub(/^[ \t]*\*\*|\*\*[ \t]*$/,"",p); split_id(p); have=1; next }
      if (!have) next
      if (tolower(line) ~ /^[ \t]*(antwort|a)[ \t]*:/) { sub(/^[ \t]*(antwort|a|Antwort|A)[ \t]*:[ \t]*/,"",line); addans(trim(line)); next }
      if (line ~ /^[ \t]*>/) { sub(/^[ \t]*>[ \t]?/,"",line); addans(trim(line)); next }
      if (trim(line)=="") next
      addans(trim(line))
    }
    function split_id(p,  idm){ curprompt=p; if (match(p,/\{#[A-Za-z0-9_-]+\}[ \t]*$/)) {
        idm=substr(p,RSTART+2,RLENGTH-3); sub(/[ \t]*\{#[A-Za-z0-9_-]+\}[ \t]*$/,"",curprompt); curid=trim(idm) }
        curprompt=trim(curprompt) }
    function addans(s){ curans=(curans=="" ? s : curans "\n" s) }
    END{
      flush();
      if (title=="") title=qid;
      printf("%s\t%s\t%d\n", qid, title, n);
      for (k=0;k<n;k++) {
        a=ans[k]; if (isblank(a)) a="";
        printf("%s\t%s\t%s\t%s\n", ids[k], prompts[k], secs[k], a);
      }
    }
  ' "$file"
}

cmd_grill() {
  local id="" questionnaire="coaching-sessions-v1" json="" answers_file="" grilling_doc="" no_comment="false" dry_run_json=""
  local -a answers=()
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)            id="$2"; shift 2 ;;
      --questionnaire) questionnaire="$2"; shift 2 ;;
      --json)          json="$2"; shift 2 ;;
      --answers-file)  answers_file="$2"; shift 2 ;;
      --answer)        answers+=("$2"); shift 2 ;;
      --grilling-doc)  grilling_doc="$2"; shift 2 ;;
      --dry-run-json)  dry_run_json="true"; shift ;;
      --no-comment)    no_comment="true"; shift ;;
      --brand)         shift 2 ;;  # consumed pre-source by ticket.sh BRAND handling; ignore here
      *)               echo "Unknown grill option: $1" >&2; exit 2 ;;
    esac; done

  # --- Validate BEFORE _pgpod so bad-arg errors are deterministic w/o a cluster (FA-SF-35/50). ---
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  if [[ -z "$questionnaire" ]]; then echo "ERROR: --questionnaire must not be empty." >&2; exit 2; fi
  local sources=0
  [[ -n "$json" ]] && sources=$((sources+1))
  [[ -n "$answers_file" ]] && sources=$((sources+1))
  [[ ${#answers[@]} -gt 0 ]] && sources=$((sources+1))
  [[ -n "$grilling_doc" ]] && sources=$((sources+1))
  if [[ "$sources" -eq 0 ]]; then
    echo "ERROR: one answer source is required (--json | --answers-file | --answer qid=text ...)." >&2
    exit 2
  fi
  if [[ "$sources" -gt 1 ]]; then
    echo "ERROR: use exactly one of --json | --answers-file | --answer." >&2
    exit 2
  fi

  if [[ -n "$grilling_doc" && ! -s "$grilling_doc" ]]; then
    echo "ERROR: grilling doc missing or empty: $grilling_doc" >&2; exit 2
  fi

  # --- If grilling-doc is given, parse it (still cluster-free). ---
  local answers_json="" meta_questions="" doc_title=""
  if [[ -n "$grilling_doc" ]]; then
    local base; base=$(basename "$grilling_doc"); base="${base%.*}"
    local tsv; tsv=$(_grill_parse_doc "$grilling_doc" "$base")
    local header; header=$(head -n1 <<<"$tsv")
    questionnaire=$(cut -f1 <<<"$header")
    doc_title=$(cut -f2 <<<"$header")
    local parsed
    parsed=$(tail -n +2 <<<"$tsv" | jq -R -s --arg qn "$questionnaire" --arg title "$doc_title" '
      ( split("\n") | map(select(length>0) | split("\t"))
        | { questionnaireId:$qn, title:$title,
            answers: ( map(select(.[3] != "")) | map({ (.[0]): .[3] }) | add // {} ),
            questions: ( map({ id:.[0], prompt:.[1] } + (if .[2]=="" then {} else {section:.[2]} end)) ) } )')
    if [[ "$dry_run_json" == "true" ]]; then printf '%s\n' "$(jq -c . <<<"$parsed")"; exit 0; fi
    answers_json=$(jq -c '.answers' <<<"$parsed")
    meta_questions=$(jq -c '.questions' <<<"$parsed")
  elif [[ -n "$json" ]]; then
    answers_json="$json"
  elif [[ -n "$answers_file" ]]; then
    if [[ ! -s "$answers_file" ]]; then echo "ERROR: answers file missing or empty: $answers_file" >&2; exit 2; fi
    answers_json=$(cat "$answers_file")
  else
    answers_json=$(_grill_answers_json "${answers[@]}") || exit $?
  fi
  # Fail closed on malformed JSON before touching the cluster.
  if [[ -z "$grilling_doc" ]] && ! jq -e . >/dev/null 2>&1 <<<"$answers_json"; then
    echo "ERROR: answers are not valid JSON" >&2; exit 2
  fi

  local pod; pod=$(_pgpod)

  # Idempotent self-protection: works independent of T000737 merge timing, same column/shape.
  _exec_sql "$pod" <<'EOF' >/dev/null
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_answers JSONB;
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_meta JSONB;
EOF

  # Per-question accumulating merge (existing answers kept; same questionId overwritten).
  local affected
  affected=$(_exec_sql "$pod" -v ext_id="$id" -v qid="$questionnaire" -v answers="$answers_json" <<'EOF'
UPDATE tickets.tickets
   SET grilling_answers =
       COALESCE(grilling_answers, '{}'::jsonb)
       || jsonb_build_object(
            :'qid',
            COALESCE(grilling_answers -> :'qid', '{}'::jsonb) || :'answers'::jsonb
          )
 WHERE external_id = :'ext_id'
RETURNING 1;
EOF
)
  if [[ -z "$affected" ]]; then
    echo "ERROR: Ticket $id not found." >&2
    exit 1
  fi

  # When a grilling doc was absorbed, merge its questions/definitions into grilling_meta.
  if [[ -n "$grilling_doc" ]]; then
    _exec_sql "$pod" -v ext_id="$id" -v qid="$questionnaire" -v title="$doc_title" -v questions="$meta_questions" <<'EOF' >/dev/null
UPDATE tickets.tickets t
   SET grilling_meta =
       COALESCE(t.grilling_meta, '{}'::jsonb)
       || jsonb_build_object(:'qid', (
            jsonb_build_object('title', :'title')
            || jsonb_build_object('questions', :'questions'::jsonb)
            || jsonb_build_object('dismissed',
                 COALESCE(t.grilling_meta -> :'qid' -> 'dismissed', '[]'::jsonb))
          ))
 WHERE t.external_id = :'ext_id';
EOF
  fi

  # Universal visibility: a readable Q/A timeline comment unless suppressed.
  if [[ "$no_comment" != "true" ]]; then
    local summary
    if [[ -n "$grilling_doc" ]]; then
      local n_total n_ans n_open
      n_total=$(jq 'length' <<<"$meta_questions")
      n_ans=$(jq 'keys|length' <<<"$answers_json")
      n_open=$(( n_total - n_ans ))
      summary="Grilling-Doc absorbiert ($questionnaire): $n_total Fragen ($n_ans beantwortet, $n_open offen)."
    else
      summary=$(jq -r --arg q "$questionnaire" \
        '"Grilling-Session (\($q)):\n" + (to_entries | map("- \(.key): \(.value)") | join("\n"))' \
        <<<"$answers_json")
    fi
    _exec_sql "$pod" -v ext_id="$id" -v body="$summary" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, 'grilling', :'body', 'internal'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  fi

  if [[ -n "$grilling_doc" ]]; then
    echo "Grilling-Doc ($questionnaire) absorbed into ticket $id"
  else
    echo "Grilling session ($questionnaire) saved to ticket $id"
  fi
}
