---
title: "Ignore locally installed market-cli skills"
ticket_id: "T001783"
domains: [infra]
status: planning
---

# ignore-market-cli-skills — Implementation Plan

## File Structure

- `.gitignore` — erweitern um Known-Market-Cli-Skills + Comment-Konvention
- `openspec/changes/ignore-market-cli-skills/proposal.md` — Problemstellung
- `openspec/changes/ignore-market-cli-skills/tasks.md` — diese Datei

## Task 1: .gitignore erweitern

**File:** `.gitignore`

Bereits vorhandener Eintrag (Zeile 199-200):
```
# ── lobehub market-cli — locally installed skills (not vetted/shared) ──
.claude/skills/haniakrim21-*/
```

Ersetzen durch eine vollständige Liste known-market-cli Skills:
```
# ── lobehub market-cli — locally installed skills (not vetted/shared) ──
# Prefix-gestützt (neue market-cli Skills):  .claude/skills/<prefix>-*/
# Bekannt installiert (Orchestra Research / nextlevelbuilder / haniakrim21):
.claude/skills/haniakrim21-*/
.claude/skills/gguf-quantization/
.claude/skills/llama-cpp/
.claude/skills/speculative-decoding/
.claude/skills/unsloth/
.claude/skills/ui-ux-pro-max/
.claude/skills/whisper/
```

**AC:** Jede Zeile exakt wie oben — kein Regex, kein Glob, keine Platzhalter.

## Task 2: Market-cli Skills aus Git-Index entfernen

```bash
git rm --cached -r \
  .claude/skills/gguf-quantization/ \
  .claude/skills/llama-cpp/ \
  .claude/skills/speculative-decoding/ \
  .claude/skills/unsloth/ \
  .claude/skills/ui-ux-pro-max/ \
  .claude/skills/whisper/
```

Dateien bleiben lokal erhalten — nur der Index-Eintrag wird entfernt.

**AC:** `git status` zeigt die Dateien als `deleted` (aus dem Index), nicht als untracked.

## Task 3: Commit & Push

```bash
git add .gitignore
git commit -m "chore: ignore locally installed market-cli skills [T001783]"
git push -u origin fix/t001783-ignore-market-cli-skills
```

**AC:** Commit enthält `.gitignore` + die `git rm --cached`-Änderungen.

## Task 4: Ticket-Status setzen

Ticket T001783 auf `plan_staged` setzen mit Branch- und Plan-Referenz.

## Verify

```bash
git status    # keine untracked market-cli Skills, keine verschwindenden team-Skills
grep -c 'market-cli\|haniakrim\|gguf-quant\|llama-cpp\|speculative-decod\|ui-ux-pro-max\|unsloth\|whisper' .gitignore
```
