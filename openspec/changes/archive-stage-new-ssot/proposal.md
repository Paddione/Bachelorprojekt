# Proposal: archive-stage-new-ssot

## Why

**Symptom (Fakt):** #5732 archivierte das Epic T900228 (`application-pipeline`) ueber
`devflow-post-merge-finalize.sh`. Der Commit enthaelt nur den Move und die Status-Map;
`openspec/specs/application-pipeline.md` mit fuenf Requirements kam nie auf `main`. Nachgetragen
am 2026-09-23 in #5836 (T900337).

**Ursache (belegt):**
1. `openspec_archive_args` (scripts/lib/openspec-archive-args.sh, T900105) setzt fuer den Stand
   vor #5732 korrekt `--create-new`; `openspec.sh archive application-pipeline --create-new` legt
   den Spec an — als **untracked** Datei (Reproducer unten).
2. `archive_stage_commit` (scripts/lib/archive-staged-scope.sh:73) stagt `openspec/specs` mit
   `git add -u`, also nur getrackte Dateien. Der neue Spec bleibt draussen.

`-u` ist gewollt (T016597): ein pauschales `git add` nahm untracked Arbeit paralleler Sessions
mit. Der Fix muss diese Absicht erhalten.

```bash
# Reproducer: Stand vor #5732 exportieren und archivieren
D=$(mktemp -d); git archive 541330aeb^ openspec scripts | tar -x -C "$D"
cd "$D" && git init -q . && git -c user.name=t -c user.email=t@t add -A && git -c user.name=t -c user.email=t@t commit -qm base
TICKET_OFFLINE=1 bash scripts/openspec.sh archive application-pipeline --create-new
git status --short openspec/specs    # ?? openspec/specs/application-pipeline.md
```

```bash
# Messung: Finalizer-Archivierungen seit T900105, deren Delta-Ziel-Spec danach auf main fehlte
for a in $(git log 8aa801c3a --since=2026-09-17 --format=%h --grep='→ postgres + openspec/archive'); do
  s=$(git show -s --format=%s $a | sed -n 's/.*archive \(.*\) → postgres.*/\1/p')
  for d in $(git show --name-only --format= $a | grep -E "^openspec/changes/archive/[^/]+-$s/specs/[^/]+\.md$"); do
    git cat-file -e "$a:openspec/specs/$(basename "$d")" 2>/dev/null || echo "$a $s $(basename "$d")"
  done
done    # Ergebnis: nur 541330aeb application-pipeline application-pipeline.md
```

## What

`archive_stage_commit` stagt zusaetzlich gezielt `openspec/specs/<name>.md` fuer jede Delta-Datei
des Changes und prueft danach, dass jeder dieser Ziel-Specs im Index liegt (fail-closed).
Fremde untracked Specs bleiben ausgeschlossen.

_Ticket: T900339_
