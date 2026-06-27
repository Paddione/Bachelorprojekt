---
title: "MCP-Server ↔ Skills: vollständiger Adapter + MCP-first"
ticket_id: T001211
domains: [infra, ops, test]
status: active
file_locks: []
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# MCP ↔ Skill Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Implement Slice 1 → Slice 2 → Slice 3 in order — each Slice is its own PR.**

**Goal:** Make the self-built MCP servers a complete 1:1 adapter over the `ticket.sh` verbs that skills use, consolidate `ticket-mcp` onto a single Go binary, flip the high-frequency skills to MCP-first (script fallback retained), register `factory-mcp`, rewrite the tool-guide as the mapping SSOT, and add a hard CI guardrail against re-drift.

**Architecture:** Skills (Markdown) → MCP tools (thin Go adapters) → `ticket.sh`/factory scripts/Taskfile (business-logic SSOT, unchanged). `mcp-tool-guide.md` is the server→tool→when→fallback SSOT; `tests/spec/mcp-tooling.bats` is the mechanical CI guard. Because the logic lives in Bash, the Go consolidation is low-risk and new tools are pure adapter registrations (~15 lines Go each).

**Tech Stack:** Go (`mark3labs/mcp-go`), Bash (`ticket.sh`, BATS), Node (factory-mcp, untouched), go-task, Kustomize-adjacent repo conventions.

## Global Constraints

- **S1 (file-size ratchet) does NOT apply to any file in this change.** Verified against `docs/code-quality/gates.yaml → s1.limits` and `scripts/code-quality/gates/s1-filesize.mjs:37` (`if (extname(file) in limits === false) continue;`). The gated extensions are only: `.astro .ts .svelte .sh .mjs .mts .py .js .jsx .tsx .cjs .bash .java .php`. Every file we touch is `.go`, `.md`, `.json`, `.jsonc`, `.bats`, or `.yml` — none are in `s1.limits`, so each has **no line budget** (S1 = N/A). No file in this change is baselined (`jq '."S1:<path>"' docs/code-quality/baseline.json` → `nicht-baselined` for all candidates), and **no baseline keys are added**. Per-task S1 notes below all read "ext not gated → N/A" and exist only to satisfy the gate-audit convention.
- **S2 (import cycles):** the new Go file `internal/tools/workflow.go` imports only `context`, `strings`, `mcp-go`, and `internal/runner` — identical to its sibling `tools/*.go` files. No new cycle. Verified by `task ... vet`.
- **S3 (hardcoded hostnames):** N/A — no file under `k3d/`, `prod*/`, or `website/src/` is touched; do NOT put `*.mentolder.de` / `*.korczewski.de` literals in any guide/skill code snippet (use `web.<brand>` style or env placeholders if an example URL is unavoidable).
- **S4 (orphans):** `tests/spec/mcp-tooling.bats` MUST be wired into a `task test:*` target (Slice 3) — verified separately because `tests/spec/*.bats` has **no auto-glob runner** today (no Taskfile target references `tests/spec/`; `test:unit` is an explicit subtask list; `runner.sh unit` globs only `tests/unit/`). An unwired guardrail would never gate CI.
- **Adapter discipline:** wrappers stay thin — `ticket.sh` is the validation/business-logic SSOT. Do NOT add logic to `ticket.sh` (it is in the `s1.ignore` list and is a sanctioned 735-line CLI). Declare value enums via `mcp.Enum(...)`; let `ticket.sh` be the final validator (a bad arg → non-zero exit → `RunTicket` surfaces the stderr).
- **Verb→flag contracts (read from `scripts/ticket.sh` + `scripts/vda/ticket/*.sh` + `scripts/lib/*.sh`), authoritative for the wrappers:**
  | Tool | Verb | Invocation (exact) | Required | Optional |
  |---|---|---|---|---|
  | `record_phase_event` | `phase` | `phase <id> <phase> <state> [--detail] [--driver]` (**positional** id/phase/state) | id, phase∈{scout,design,plan,implement,verify,deploy}, state∈{entered,done,blocked} | detail, driver∈{factory,devflow} (default factory) |
  | `record_grill_answers` | `grill` | `grill --id <id> [--questionnaire] (--answer qid=text)…  [--no-comment]` | id, answers (≥1 `qid=text`) | questionnaire (default coaching-sessions-v1), no_comment |
  | `stage_plan` | `stage-plan` | `stage-plan --id --branch --plan` | id, branch, plan | — |
  | `create_ticket` | `create` | `create --type --title --description --brand [--priority --severity --status --attention-mode --areas]` → prints `external_id\|uuid` | **type, title, description** | brand(def mentolder), priority(def mittel), severity, status(def triage), attention_mode, areas |
  | `enqueue_ticket` | `enqueue` | `enqueue --id [--branch --plan]` | id | branch, plan |
  | `set_touched_files` | `set-touched-files` | `set-touched-files --id --files` | id, files | — |
  | `get_attachments` | `get-attachments` | `get-attachments --id --out-dir` | **id, out_dir** | — |
  | `archive_plan` | `archive-plan` | `archive-plan --id --slug --branch --plan-file [--pr]` | **id, slug, branch, plan_file** | pr |
  | `add_pr_link` | `add-pr-link` | `add-pr-link --id --pr` (pr must be integer) | id, pr | — |
  > Notes: the design table under-specified three contracts — `create_ticket` requires **description** (not "brand"); `get_attachments` requires **out_dir**; `archive_plan` requires **slug + branch + plan_file**, not just id. The table above is corrected from the scripts and is authoritative.
- **Grill is deprecated but functional.** `cmd_grill` prints `⚠ … deprecated. Use: vda.sh ticket triage` to **stderr** but still persists `grilling_answers` JSONB and exits 0. `triage_ticket` (already wrapped) sets *triage fields*; it does NOT persist Q/A answers — so `record_grill_answers` is a distinct capability and is still worth wrapping. Keep it; the stderr warning is harmless (RunTicket only fails on non-zero exit).
- **Parity-before-deletion (Slice 1):** the Node adapter exposes `report_mishap`, **`get_mishap_buffer`**, **`flush_mishap_buffer`** and accepts mishap `type: process`; the Go binary today exposes only `report_mishap` and its enum **omits `process`**. mishap-tracker calls all three buffer tools. The Go binary MUST reach parity (port both tools + add `process`) **before** Node is removed, or mishap-tracker regresses.

---

## File Structure

Files created / modified / deleted, grouped by slice (each slice is one PR).

**Slice 1 — `ticket-mcp` Go-SSOT + adapter surface:**
- `scripts/ticket-mcp/go/internal/tools/mishap.go` (modified — `process` type + `get_mishap_buffer`/`flush_mishap_buffer` + `createMishapBundleTicket` helper)
- `scripts/ticket-mcp/go/internal/tools/mishap_test.go` (modified — `process` bundle test)
- `tests/spec/mcp-tooling.bats` (**new** — adapter-completeness guard, written red-first)
- `Taskfile.yml` (modified — new `test:mcp-tooling` task, wired into `test:unit` + `test:changed`)
- `scripts/ticket-mcp/go/internal/tools/workflow.go` (**new** — 9 workflow wrappers + `RegisterWorkflowTools`)
- `scripts/ticket-mcp/go/internal/tools/workflow_test.go` (**new** — registration smoke test)
- `scripts/ticket-mcp/go/cmd/ticket-mcp/main.go` (modified — register workflow tools)
- `scripts/ticket-mcp/go/internal/tools/planning.go` (modified — drop stale Node-compat comments)
- `.opencode/opencode.jsonc` (modified — repoint `ticket-mcp` at the Go binary)
- `scripts/ticket-mcp/server.js` (**deleted**), `scripts/ticket-mcp/tools/` (**deleted**), `scripts/ticket-mcp/lib/` (**deleted**), `scripts/ticket-mcp/package.json` (**deleted**), `scripts/ticket-mcp/package-lock.json` (**deleted**)

**Slice 2 — Skills MCP-first:**
- `.claude/skills/dev-flow-execute/SKILL.md` (modified)
- `.claude/skills/dev-flow-plan/SKILL.md` (modified)
- `.claude/skills/ticket-ops/SKILL.md` (modified)
- `.claude/skills/incident-response/SKILL.md` (modified)
- `.claude/skills/infra-ops/SKILL.md` (modified)

**Slice 3 — hygiene, SSOT doc, guardrail extension:**
- `.mcp.json` (modified — register `factory-mcp`)
- `.opencode/opencode.jsonc` (modified — register `factory-mcp`)
- `.claude/skills/ticket-ops/SKILL.md` (modified — wire factory tools)
- `.claude/skills/operations-management/SKILL.md` (modified — wire factory tools)
- `CLAUDE.md` (modified — server-name drift fix), `AGENTS.md` (modified — server-name drift fix)
- `.claude/skills/references/mcp-tool-guide.md` (modified — rewrite as mapping SSOT)
- `tests/spec/mcp-tooling.bats` (modified — append guide-completeness `@test`)

---

## SLICE 1 — `ticket-mcp`: Go-SSOT + complete adapter surface (PR #1)

**Outcome:** Go binary reaches full parity with Node, gains the 9 new workflow wrappers, opencode is repointed at the (freshly built) Go binary, and the Node adapter is deleted. **Build order is load-bearing: build the Go binary BEFORE flipping opencode, or opencode breaks.**

### Task 1.1: Mishap parity in Go (add `process` type + `get_mishap_buffer` + `flush_mishap_buffer`)

**Files:**
- Modify: `scripts/ticket-mcp/go/internal/tools/mishap.go` (188 lines · `.go` ext not gated → S1 N/A)
- Test: `scripts/ticket-mcp/go/internal/tools/mishap_test.go` (existing · `.go` N/A)

**Interfaces:**
- Consumes: existing `readBuffer()`, `writeBuffer()`, `classifyBundle()`, `MishapEntry`, `MISHAP_TRIGGER`, `runner.RunTicket`, `getArgs` (all already in package `tools`).
- Produces: Go tools `get_mishap_buffer` (no args), `flush_mishap_buffer` (arg: `brand`), and a `process`-aware `report_mishap`; plus an unexported helper `createMishapBundleTicket(bundle []MishapEntry, brand string) (string, error)`.

- [x] **Step 1: Extend the `process` Go test (write failing test).** Add to `mishap_test.go`:

```go
func TestClassifyBundleProcessType(t *testing.T) {
	entries := []MishapEntry{
		{Title: "Skill misfire", Description: "wrong order", Component: "skills/dev-flow", Type: "process", ReportedAt: "2026-06-27T10:00:00Z"},
		{Title: "Doc drift", Description: "stale ref", Component: "skills/infra-ops", Type: "process", ReportedAt: "2026-06-27T10:01:00Z"},
	}
	b := classifyBundle(entries)
	if b.Severity != "minor" || b.Priority != "mittel" {
		t.Errorf("process-only bundle should be minor/mittel, got %s/%s", b.Severity, b.Priority)
	}
}
```

- [x] **Step 2: Run it — expect PASS already** (classifyBundle treats unknown types as non-critical). Run: `cd scripts/ticket-mcp/go && go test ./... -run TestClassifyBundleProcessType -v`. Expected: PASS (this pins the behaviour; the real gap is the enum, fixed next).

- [x] **Step 3: Add `process` to the `report_mishap` enum + validator.** In `mishap.go`, the `mcp.Enum("broken", "degraded", "suspicious", "security", "drift")` → add `"process"`; and `validTypes := []string{"broken", "degraded", "suspicious", "security", "drift"}` → append `"process"`. (Matches Node `MISHAP_TYPE` and `mishap-categorize`/skill classification.)

- [x] **Step 4: Extract the bundle-create helper (DRY).** Add to `mishap.go`:

```go
// createMishapBundleTicket creates one bundled task ticket from the given
// entries via ticket.sh create and returns the parsed external_id.
func createMishapBundleTicket(bundle []MishapEntry, brand string) (string, error) {
	c := classifyBundle(bundle)
	out, err := runner.RunTicket([]string{
		"create",
		"--type", "task",
		"--brand", brand,
		"--title", c.Title,
		"--description", c.Description,
		"--status", "triage",
		"--severity", c.Severity,
		"--priority", c.Priority,
		"--attention-mode", "ai_ready",
		"--areas", c.Areas,
	}, map[string]string{"BRAND": brand})
	if err != nil {
		return "", err
	}
	ext := strings.TrimSpace(out)
	if i := strings.Index(ext, "|"); i >= 0 {
		ext = ext[:i]
	}
	return ext, nil
}
```

Then refactor the existing `report_mishap` create-block to call `createMishapBundleTicket(buffer[:MISHAP_TRIGGER], brand)` instead of inlining the `create` args (behaviour identical: on error it still `writeBuffer(buffer)` and returns the error; on success `writeBuffer(buffer[MISHAP_TRIGGER:])`).

- [x] **Step 5: Register the two buffer tools** at the end of `RegisterMishapTools`:

```go
	s.AddTool(
		mcp.NewTool("get_mishap_buffer",
			mcp.WithDescription("Zeigt den aktuellen Inhalt des Mishap-Buffers (noch nicht zu Tickets gebündelt)."),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			buffer := readBuffer()
			if len(buffer) == 0 {
				return mcp.NewToolResultText("Mishap-Buffer ist leer."), nil
			}
			var lines []string
			for i, e := range buffer {
				lines = append(lines, fmt.Sprintf("%d. [%s] %s (%s) — %s", i+1, e.Type, e.Title, e.Component, e.ReportedAt))
			}
			return mcp.NewToolResultText(fmt.Sprintf("Buffer: %d/%d Einträge\n\n%s", len(buffer), MISHAP_TRIGGER, strings.Join(lines, "\n"))), nil
		},
	)

	s.AddTool(
		mcp.NewTool("flush_mishap_buffer",
			mcp.WithDescription("Erzwingt ein Bundle-Ticket aus dem aktuellen Buffer — auch bei <3 Einträgen (Session-Ende)."),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			brand, _ := a["brand"].(string)
			if brand == "" {
				brand = "mentolder"
			}
			buffer := readBuffer()
			if len(buffer) == 0 {
				return mcp.NewToolResultText("Mishap-Buffer ist leer — nichts zu flushen."), nil
			}
			ext, err := createMishapBundleTicket(buffer, brand)
			if err != nil {
				return nil, err
			}
			writeBuffer([]MishapEntry{})
			return mcp.NewToolResultText(fmt.Sprintf("Bundle-Ticket angelegt: %s (%d Mishaps)\nBuffer geleert.", ext, len(buffer))), nil
		},
	)
```

- [x] **Step 6: Build + vet + test.** Run: `cd scripts/ticket-mcp/go && go vet ./... && go test ./... && make build`. Expected: vet clean, tests PASS, binary written to `scripts/ticket-mcp/ticket-mcp-go`.

- [x] **Step 7: Commit.**

```bash
git add scripts/ticket-mcp/go/internal/tools/mishap.go scripts/ticket-mcp/go/internal/tools/mishap_test.go
git commit -m "feat(ticket-mcp): Go mishap parity — process type + get/flush_mishap_buffer"
```

**Acceptance:** Go `report_mishap` accepts `type: process`; `get_mishap_buffer` and `flush_mishap_buffer` are registered; `go test ./...` green.

---

### Task 1.2: Guardrail-first (adapter-completeness) + 9 workflow wrappers (TDD)

Write the mechanical adapter-completeness guard **first** so it goes red while the
9 wrappers are missing, then add the wrappers until it goes green. This puts the
re-drift guard live from Slice 1 (it depends only on the Go source, not on the
guide — the guide-completeness `@test` is appended in Slice 3, Task 3.4).

**Files:**
- Create: `tests/spec/mcp-tooling.bats` (NEW · `.bats` not gated → S1 N/A)
- Modify: `Taskfile.yml` (`.yml` not gated → S1 N/A — add `test:mcp-tooling`, wire into `test:unit` + `test:changed`)
- Create: `scripts/ticket-mcp/go/internal/tools/workflow.go` (NEW · `.go` not gated → S1 N/A)
- Create: `scripts/ticket-mcp/go/internal/tools/workflow_test.go` (NEW · `.go` N/A)
- Modify: `scripts/ticket-mcp/go/cmd/ticket-mcp/main.go` (73 lines · `.go` N/A)

**Interfaces:**
- Consumes: `getArgs`, `runner.RunTicket`, `mcp`, `server` (package `tools`); the existing BATS core at `tests/unit/lib/bats-core/bin/bats`.
- Produces: `func RegisterWorkflowTools(s *server.MCPServer)` registering exactly the 9 tools from the Global-Constraints verb table; the public task `test:mcp-tooling`; the guard file `tests/spec/mcp-tooling.bats` (adapter-completeness `@test` only in this slice).

> **Why the Taskfile wiring is mandatory:** `tests/spec/*.bats` has no auto-glob runner (verified — no Taskfile target references `tests/spec/`; `runner.sh unit` globs only `tests/unit/`; the unit-coverage-guard only checks `tests/unit/`). Without explicit wiring the guard is an orphan that never gates CI.

- [x] **Step 1: Write the guardrail's adapter-completeness `@test` (red-first).** Create `tests/spec/mcp-tooling.bats`:

```bash
#!/usr/bin/env bats
# tests/spec/mcp-tooling.bats
# SSOT spec: openspec/specs (capability mcp-skill-integration). HARD CI guard —
# fails when a skill-critical ticket.sh verb loses its ticket-mcp wrapper.
# (Slice 3 appends a second @test: every Go tool must be listed in the guide.)
# Simple [ ] assertions (tests/spec/* convention — bats-assert is not loaded).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TOOLS_DIR="$REPO_ROOT/scripts/ticket-mcp/go/internal/tools"
}

@test "every skill-critical ticket.sh verb has a ticket-mcp wrapper" {
  [ -d "$TOOLS_DIR" ]
  verbs=(phase grill stage-plan create enqueue set-touched-files get-attachments archive-plan add-pr-link get add-comment)
  missing=()
  for v in "${verbs[@]}"; do
    # A wrapper = the verb appears as a quoted RunTicket argument in the Go source.
    grep -rqF "\"$v\"" "$TOOLS_DIR" || missing+=("$v")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "# Verbs without a ticket-mcp wrapper: ${missing[*]}" >&2
  fi
  [ "${#missing[@]}" -eq 0 ]
}
```

- [x] **Step 2: Wire it into `Taskfile.yml`.** Add the public task (near the other `test:*` tasks):

```yaml
  test:mcp-tooling:
    desc: "Guardrail: ticket-mcp tools <-> mcp-tool-guide.md <-> skill-critical verbs (hard)"
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/spec/mcp-tooling.bats
```

Register it in the `test:unit:` `cmds:` list by adding `      - task: test:mcp-tooling`. Then add a selection branch in the `test:changed` shell block: after the existing `RUN_*` detection lines add

```bash
        RUN_MCP=false
        echo "$CHANGED" | grep -qE "^(\.claude/skills/|\.mcp\.json|\.opencode/|tests/spec/mcp-tooling\.bats|scripts/ticket-mcp/)" && RUN_MCP=true || true
```

and after the existing `if [ "$RUN_FACTORY" = "true" ] …` line add

```bash
        if [ "$RUN_MCP" = "true" ]; then echo "→ MCP tooling guardrail"; task test:mcp-tooling; fi
```

(Also add `[ "$RUN_MCP" = "false" ]` to the final "no domain-specific changes" all-false guard so a guard-only change does not fall through to vitest-only.)

- [x] **Step 3: Run the guard — expected: fail (red).** Run: `task test:mcp-tooling`. Expected: **fail** — the assertion lists the unwrapped verbs `phase grill stage-plan create enqueue set-touched-files get-attachments archive-plan` (only `get` + `add-comment` are wrapped today), confirming the guard catches missing wrappers before we add them.

- [x] **Step 4: Write the registration smoke test (failing).** `workflow_test.go`:

```go
package tools

import (
	"testing"

	"github.com/mark3labs/mcp-go/server"
)

// RegisterWorkflowTools must register without panicking and the binary must
// compile with all 9 wrappers present (presence is enforced mechanically by
// tests/spec/mcp-tooling.bats; this guards the Go registration path).
func TestRegisterWorkflowToolsNoPanic(t *testing.T) {
	s := server.NewMCPServer("test", "0.0.0")
	RegisterWorkflowTools(s) // must not panic
}
```

- [x] **Step 5: Run it — to verify it fails (undefined: RegisterWorkflowTools).** Run: `cd scripts/ticket-mcp/go && go test ./internal/tools/ -run TestRegisterWorkflowToolsNoPanic -v`. Expected: build error `undefined: RegisterWorkflowTools`.

- [x] **Step 6: Create `workflow.go` (complete file).**

```go
package tools

import (
	"context"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/korczewski/bachelorprojekt/ticket-mcp/internal/runner"
)

// RegisterWorkflowTools registers thin adapters over the skill-critical
// ticket.sh workflow verbs. Each handler forwards to runner.RunTicket;
// ticket.sh stays the validation/business-logic SSOT, so wrappers are thin.
func RegisterWorkflowTools(s *server.MCPServer) {
	brandOf := func(a map[string]any) string {
		if b, _ := a["brand"].(string); b != "" {
			return b
		}
		return "mentolder"
	}
	text := func(raw string, err error) (*mcp.CallToolResult, error) {
		if err != nil {
			return nil, err
		}
		return mcp.NewToolResultText(strings.TrimSpace(raw)), nil
	}

	// record_phase_event → ticket.sh phase <id> <phase> <state> [--detail] [--driver]
	s.AddTool(
		mcp.NewTool("record_phase_event",
			mcp.WithDescription("Schreibt ein Factory/Devflow-Phasen-Event (tickets.factory_phase_events)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("phase", mcp.Description("scout|design|plan|implement|verify|deploy"),
				mcp.Enum("scout", "design", "plan", "implement", "verify", "deploy"), mcp.Required()),
			mcp.WithString("state", mcp.Description("entered|done|blocked"),
				mcp.Enum("entered", "done", "blocked"), mcp.Required()),
			mcp.WithString("detail", mcp.Description("Optionaler Detailtext")),
			mcp.WithString("driver", mcp.Description("factory|devflow (default: factory)"),
				mcp.Enum("factory", "devflow")),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			phase, _ := a["phase"].(string)
			state, _ := a["state"].(string)
			args := []string{"phase", id, phase, state}
			if v, _ := a["detail"].(string); v != "" {
				args = append(args, "--detail", v)
			}
			if v, _ := a["driver"].(string); v != "" {
				args = append(args, "--driver", v)
			}
			return text(runner.RunTicket(args, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// record_grill_answers → ticket.sh grill --id <id> [--questionnaire] (--answer qid=text)… [--no-comment]
	s.AddTool(
		mcp.NewTool("record_grill_answers",
			mcp.WithDescription("Persistiert Grilling-Antworten (tickets.grilling_answers JSONB). 'answers': eine Zeile pro Antwort als qid=text."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("answers", mcp.Description("Antworten, eine pro Zeile: qid=text"), mcp.Required()),
			mcp.WithString("questionnaire", mcp.Description("default: coaching-sessions-v1")),
			mcp.WithBoolean("no_comment", mcp.Description("Kein Timeline-Kommentar (default false)")),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			answers, _ := a["answers"].(string)
			args := []string{"grill", "--id", id}
			if v, _ := a["questionnaire"].(string); v != "" {
				args = append(args, "--questionnaire", v)
			}
			for _, line := range strings.Split(answers, "\n") {
				if line = strings.TrimSpace(line); line != "" {
					args = append(args, "--answer", line)
				}
			}
			if nc, _ := a["no_comment"].(bool); nc {
				args = append(args, "--no-comment")
			}
			return text(runner.RunTicket(args, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// stage_plan → ticket.sh stage-plan --id --branch --plan
	s.AddTool(
		mcp.NewTool("stage_plan",
			mcp.WithDescription("Stellt ein Ticket in die Kommissionierung (status=plan_staged) mit Branch + Plan-Pfad."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("branch", mcp.Description("Feature/Fix-Branch"), mcp.Required()),
			mcp.WithString("plan", mcp.Description("Plan-Datei-Pfad"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			branch, _ := a["branch"].(string)
			plan, _ := a["plan"].(string)
			return text(runner.RunTicket([]string{"stage-plan", "--id", id, "--branch", branch, "--plan", plan}, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// create_ticket → ticket.sh create … (returns external_id|uuid, passed through unchanged)
	s.AddTool(
		mcp.NewTool("create_ticket",
			mcp.WithDescription("Legt ein Ticket an. Gibt 'external_id|uuid' zurück (Skills parsen cut -d'|' -f1)."),
			mcp.WithString("type", mcp.Description("bug|feature|task|project"),
				mcp.Enum("bug", "feature", "task", "project"), mcp.Required()),
			mcp.WithString("title", mcp.Description("Ticket-Titel"), mcp.Required()),
			mcp.WithString("description", mcp.Description("Beschreibung (Pflicht in create.sh)"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
			mcp.WithString("priority", mcp.Description("hoch|mittel|niedrig (default mittel)"),
				mcp.Enum("hoch", "mittel", "niedrig")),
			mcp.WithString("severity", mcp.Description("critical|major|minor|trivial"),
				mcp.Enum("critical", "major", "minor", "trivial")),
			mcp.WithString("status", mcp.Description("Start-Status (default triage)")),
			mcp.WithString("attention_mode", mcp.Description("auto|ai_ready|needs_human"),
				mcp.Enum("auto", "ai_ready", "needs_human")),
			mcp.WithString("areas", mcp.Description("Komma-separierte Bereiche z.B. auth,chat")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			brand := brandOf(a)
			typ, _ := a["type"].(string)
			title, _ := a["title"].(string)
			desc, _ := a["description"].(string)
			args := []string{"create", "--type", typ, "--title", title, "--description", desc, "--brand", brand}
			for flag, key := range map[string]string{"--priority": "priority", "--severity": "severity", "--status": "status", "--attention-mode": "attention_mode", "--areas": "areas"} {
				if v, _ := a[key].(string); v != "" {
					args = append(args, flag, v)
				}
			}
			return text(runner.RunTicket(args, map[string]string{"BRAND": brand}))
		},
	)

	// enqueue_ticket → ticket.sh enqueue --id [--branch --plan]
	s.AddTool(
		mcp.NewTool("enqueue_ticket",
			mcp.WithDescription("Reiht ein Ticket in den Software-Factory-Backlog ein (type=feature, status=backlog)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("branch", mcp.Description("Optionaler Branch")),
			mcp.WithString("plan", mcp.Description("Optionaler Plan-Pfad")),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			args := []string{"enqueue", "--id", id}
			if v, _ := a["branch"].(string); v != "" {
				args = append(args, "--branch", v)
			}
			if v, _ := a["plan"].(string); v != "" {
				args = append(args, "--plan", v)
			}
			return text(runner.RunTicket(args, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// set_touched_files → ticket.sh set-touched-files --id --files
	s.AddTool(
		mcp.NewTool("set_touched_files",
			mcp.WithDescription("Setzt die touched_files eines Tickets (Konflikt-/Scope-Tracking)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("files", mcp.Description("Komma- oder Whitespace-getrennte Pfade (wie ticket.sh erwartet)"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			files, _ := a["files"].(string)
			return text(runner.RunTicket([]string{"set-touched-files", "--id", id, "--files", files}, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// get_attachments → ticket.sh get-attachments --id --out-dir  (out_dir is REQUIRED)
	s.AddTool(
		mcp.NewTool("get_attachments",
			mcp.WithDescription("Lädt die Attachments eines Tickets in ein Zielverzeichnis (out_dir Pflicht)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("out_dir", mcp.Description("Zielverzeichnis (wird angelegt)"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			outDir, _ := a["out_dir"].(string)
			return text(runner.RunTicket([]string{"get-attachments", "--id", id, "--out-dir", outDir}, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// archive_plan → ticket.sh archive-plan --id --slug --branch --plan-file [--pr]
	s.AddTool(
		mcp.NewTool("archive_plan",
			mcp.WithDescription("Archiviert einen Plan und mergt den Delta-Spec in die SSOT."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("slug", mcp.Description("OpenSpec-Change-Slug"), mcp.Required()),
			mcp.WithString("branch", mcp.Description("Feature/Fix-Branch"), mcp.Required()),
			mcp.WithString("plan_file", mcp.Description("Pfad zur Plan-Datei"), mcp.Required()),
			mcp.WithString("pr", mcp.Description("Optionale PR-Nummer (integer)")),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			slug, _ := a["slug"].(string)
			branch, _ := a["branch"].(string)
			planFile, _ := a["plan_file"].(string)
			args := []string{"archive-plan", "--id", id, "--slug", slug, "--branch", branch, "--plan-file", planFile}
			if v, _ := a["pr"].(string); v != "" {
				args = append(args, "--pr", v)
			}
			return text(runner.RunTicket(args, map[string]string{"BRAND": brandOf(a)}))
		},
	)

	// add_pr_link → ticket.sh add-pr-link --id --pr  (pr must be integer; ticket.sh validates)
	s.AddTool(
		mcp.NewTool("add_pr_link",
			mcp.WithDescription("Verknüpft eine PR-Nummer mit einem Ticket (tickets.ticket_links kind=pr)."),
			mcp.WithString("id", mcp.Description("external_id z.B. T000123"), mcp.Required()),
			mcp.WithString("pr", mcp.Description("PR-Nummer (integer)"), mcp.Required()),
			mcp.WithString("brand", mcp.Description("mentolder oder korczewski (default: mentolder)")),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			a := getArgs(req)
			id, _ := a["id"].(string)
			pr, _ := a["pr"].(string)
			return text(runner.RunTicket([]string{"add-pr-link", "--id", id, "--pr", pr}, map[string]string{"BRAND": brandOf(a)}))
		},
	)
}
```

- [x] **Step 7: Register in `main.go`.** After the existing `tools.RegisterMishapTools(mcpServer)` line, add:

```go
	tools.RegisterWorkflowTools(mcpServer)
```

- [x] **Step 8: Build + vet + test.** Run: `cd scripts/ticket-mcp/go && go vet ./... && go test ./... && make build`. Expected: clean vet, PASS, binary rebuilt.

- [x] **Step 9: Re-run the guard — now green; manual stdio smoke lists the 9 names.** Run: `task test:mcp-tooling`. Expected: `1 test, 0 failures` (all skill-critical verbs now wrapped). Then confirm the live tool list:

```bash
cd /tmp/wt-mcp-skill-integration
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hc","version":"1"}}}' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
 | ./scripts/ticket-mcp/ticket-mcp-go 2>/dev/null | grep -o '"name":"[a-z_]*"' | sort -u
```

Expected: includes `record_phase_event`, `record_grill_answers`, `stage_plan`, `create_ticket`, `enqueue_ticket`, `set_touched_files`, `get_attachments`, `archive_plan`, `add_pr_link`, `get_mishap_buffer`, `flush_mishap_buffer`.

- [x] **Step 10: Commit.**

```bash
git add tests/spec/mcp-tooling.bats Taskfile.yml scripts/ticket-mcp/go/internal/tools/workflow.go scripts/ticket-mcp/go/internal/tools/workflow_test.go scripts/ticket-mcp/go/cmd/ticket-mcp/main.go
git commit -m "feat(ticket-mcp): adapter-completeness guard + 9 workflow wrappers (phase/grill/stage-plan/create/enqueue/set-touched-files/get-attachments/archive-plan/add-pr-link)"
```

**Acceptance:** the adapter-completeness guard is wired into `test:mcp-tooling`/`test:unit`/`test:changed` and passes; 9 new tools registered + the 2 mishap parity tools; binary lists all of them; `go test ./...` green.

---

### Task 1.3: Clean up the misleading Node-compat comments in `planning.go`

**Files:**
- Modify: `scripts/ticket-mcp/go/internal/tools/planning.go` (236 lines · `.go` not gated → S1 N/A)

**Behaviour must NOT change** — `priority`/`severity` are still declared on `prepare_feature` but NOT forwarded to `ticket.sh` (the `plan-meta set` verb does not accept them). Only the misleading comment text changes.

- [x] **Step 1: Reword the parameter descriptions** (lines ~118 and ~120): replace `"wird nicht an ticket.sh durchgereicht (Node-Kompatibilität)"` with `"wird nicht an ticket.sh plan-meta durchgereicht (das Verb akzeptiert priority/severity nicht)"` for both `priority` and `severity`.
- [x] **Step 2: Reword the inline comment** (~line 154-155): replace the `// This matches Node behavior exactly …` block with `// priority/severity are declared for caller convenience but plan-meta does not accept them, so they are intentionally not forwarded.`
- [x] **Step 3: Build + vet + test.** Run: `cd scripts/ticket-mcp/go && go vet ./... && go test ./... && make build`. Expected: clean, PASS.
- [x] **Step 4: Commit.**

```bash
git add scripts/ticket-mcp/go/internal/tools/planning.go
git commit -m "chore(ticket-mcp): drop stale Node-compat comments (behaviour unchanged)"
```

**Acceptance:** no `Node-Kompatibilität` / `Node behavior` strings remain in `planning.go`; behaviour identical.

---

### Task 1.4: Build the Go binary, THEN flip opencode, THEN delete the Node adapter

> **ORDER IS LOAD-BEARING.** Build → verify binary → flip opencode → delete Node. If the binary is missing when opencode starts, opencode's `ticket-mcp` server fails to launch.

**Files:**
- Modify: `.opencode/opencode.jsonc` (`.jsonc` not gated → S1 N/A)
- Delete: `scripts/ticket-mcp/server.js`, `scripts/ticket-mcp/tools/` (lifecycle.js, list.js, mishap.js, planning.js, triage.js), `scripts/ticket-mcp/lib/` (mishap-buffer.js, run-ticket.js), `scripts/ticket-mcp/package.json`, `scripts/ticket-mcp/package-lock.json`

- [x] **Step 1: Build the binary first.** Run: `task ticket-mcp:build` (→ `make -C scripts/ticket-mcp/go build`). Expected: `scripts/ticket-mcp/ticket-mcp-go` exists and is executable (`ls -l scripts/ticket-mcp/ticket-mcp-go`). The binary is gitignored (`scripts/ticket-mcp/.gitignore` = `ticket-mcp-go`) — do not commit it.

- [x] **Step 2: Pre-deletion reference scan** (confirm nothing else launches the Node server). Run:

```bash
cd /tmp/wt-mcp-skill-integration
grep -rn "ticket-mcp/server.js\|ticket-mcp/tools\|ticket-mcp/lib\|ticket-mcp/package" \
  --include='*.sh' --include='*.mjs' --include='*.js' --include='*.yml' --include='*.yaml' --include='*.jsonc' --include='*.json' --include='*.md' . \
  | grep -v node_modules | grep -v '/go/'
```

Expected: only `.opencode/opencode.jsonc` (the entry we are about to change) and possibly docs. If a Taskfile/script launches `node …/server.js`, update it to the Go binary in this step.

- [x] **Step 3: Flip opencode to the Go binary.** In `.opencode/opencode.jsonc`, change the `ticket-mcp` entry from:

```jsonc
    "ticket-mcp": {
      "type": "local",
      "command": ["node", "/home/patrick/Bachelorprojekt/scripts/ticket-mcp/server.js"],
      "enabled": true
    }
```

to:

```jsonc
    "ticket-mcp": {
      "type": "local",
      "command": ["/home/patrick/Bachelorprojekt/scripts/ticket-mcp/ticket-mcp-go"],
      "enabled": true
    }
```

(`.mcp.json` already points at the Go binary — no change there.)

- [x] **Step 4: Delete the Node adapter.**

```bash
cd /tmp/wt-mcp-skill-integration
git rm scripts/ticket-mcp/server.js scripts/ticket-mcp/package.json scripts/ticket-mcp/package-lock.json
git rm -r scripts/ticket-mcp/tools scripts/ticket-mcp/lib
```

(If `scripts/ticket-mcp/node_modules/` exists and is tracked, also `git rm -r` it; it is typically untracked.)

- [x] **Step 5: Verify the Go binary still builds + the JSON is valid.** Run:

```bash
task ticket-mcp:build
jq empty .mcp.json && node -e "require('fs').readFileSync('.opencode/opencode.jsonc','utf8')" && echo "configs OK"
```

Expected: build green; `.mcp.json` valid JSON; opencode jsonc readable.

- [x] **Step 6: Commit.**

```bash
git add .opencode/opencode.jsonc scripts/ticket-mcp/
git commit -m "refactor(ticket-mcp): consolidate on Go binary; point opencode at it; remove Node adapter"
```

**Acceptance:** opencode `ticket-mcp.command` is the Go binary; Node adapter files are gone; `task ticket-mcp:build` green.

---

### Task 1.5 (Slice 1 verification gate)

- [x] **Step 1: Go suite + build.** Run: `cd scripts/ticket-mcp/go && go vet ./... && go test ./... && make build`. Expected: all green.
- [x] **Step 2: Tool inventory (parity + completeness).** Re-run the stdio smoke from Task 1.2 Step 9; confirm all 9 workflow tools + `get_mishap_buffer` + `flush_mishap_buffer` + the pre-existing 12 are present (≥23 tool names). Also re-run `task test:mcp-tooling` → `1 test, 0 failures`.
- [x] **Step 3: No Node residue.** Run: `ls scripts/ticket-mcp/` — expect only `go/`, `.gitignore`, and the gitignored `ticket-mcp-go`. No `server.js`/`tools/`/`lib/`/`package*.json`.
- [x] **Step 4: CI-equivalent (changed-scope).** Run: `task test:changed && task freshness:check`. Expected: green (Go changes trigger `test:unit`; quality gate clean — no S1/baseline movement).
- [x] **Step 5: Open PR #1.** Title: `feat(ticket-mcp): Go-SSOT consolidation + complete adapter surface [T001211]`. Merge before starting Slice 2.

---

## SLICE 2 — Skills MCP-first (script fallback retained) (PR #2)

**Outcome:** the five high-frequency skills present `mcp__ticket-mcp__*` / `mcp__mcp-postgres__query` / `mcp__mcp-kubernetes__*` as the **primary** path, with the existing `ticket.sh`/`kubectl exec psql` block kept as a clearly labelled fallback. Pattern exemplar: `.claude/skills/mishap-tracker/SKILL.md` (MCP call shown first, fallback in a "Fallback" step).

> **S1 reminder:** every file in this Slice is `.md` → **not in `s1.limits`** → no line budget. Edits may freely add MCP-first blocks. Still, prefer **replacing** the bare `ticket.sh` line with an "MCP-first + Fallback" pair over duplicating, to keep skills readable.
> **Hard rule (carried from mcp-tool-guide):** Writes/DDL/superuser SQL stay on `kubectl exec … psql`. MCP-first applies only to **reads** and to the **ticket-mcp lifecycle tools**. `mcp__mcp-postgres__query` is READ-ONLY and takes only `sql`.

### Task 2.1: `dev-flow-execute` MCP-first

**Files:** Modify `.claude/skills/dev-flow-execute/SKILL.md` (558 lines · `.md` not gated → S1 N/A)

- [x] **Step 1: Inventory the call sites.** Run: `grep -n "ticket.sh\|kubectl exec.*psql\|psql " .claude/skills/dev-flow-execute/SKILL.md`. Map each to its MCP tool: `phase`→`record_phase_event`, `stage-plan`→`stage_plan`, `get-attachments`→`get_attachments`, `archive-plan`→`archive_plan`, `add-comment`→`add_comment`, `add-pr-link`→`add_pr_link`, plan-metadata **read** (`psql SELECT …`) → `mcp__mcp-postgres__query`.
- [x] **Step 2: Rewrite each lifecycle call site to MCP-first + Fallback.** For every mapped call, restructure to (exemplar for `phase`):

```markdown
Phasen-Event setzen (MCP-first):

> `mcp__ticket-mcp__record_phase_event({ id: "<T-ID>", phase: "implement", state: "entered", driver: "devflow" })`

Fallback (MCP nicht erreichbar):
`bash scripts/ticket.sh phase <T-ID> implement entered --driver devflow`
```

Apply the same shape to `stage_plan`, `get_attachments`, `archive_plan`, `add_comment`, `add_pr_link`.
- [x] **Step 3: Convert plan-metadata READS to `mcp__mcp-postgres__query` first, kubectl fallback** (keep any INSERT/UPDATE on kubectl). Link the availability guard to `.claude/skills/references/mcp-tool-guide.md` rather than re-explaining it.
- [x] **Step 4: Verify no write-path was switched to mcp-postgres.** Run: `grep -n "mcp__mcp-postgres__query" .claude/skills/dev-flow-execute/SKILL.md` and eyeball that each is a SELECT.
- [x] **Step 5: Commit.** `git add .claude/skills/dev-flow-execute/SKILL.md && git commit -m "feat(skills): dev-flow-execute MCP-first (ticket-mcp + mcp-postgres reads), script fallback retained"`

**Acceptance:** every lifecycle call site shows the MCP tool first and the script as labelled fallback; reads use mcp-postgres, writes/DDL stay kubectl.

### Task 2.2: `dev-flow-plan` MCP-first

**Files:** Modify `.claude/skills/dev-flow-plan/SKILL.md` (434 lines · `.md` N/A)

- [x] **Step 1:** `grep -n "ticket.sh" .claude/skills/dev-flow-plan/SKILL.md`. Map `create`→`create_ticket` (parse `external_id|uuid` → `cut -d'|' -f1` still applies to the tool's returned text), `stage-plan`→`stage_plan`.
- [x] **Step 2:** Rewrite both to MCP-first + Fallback (same shape as Task 2.1 Step 2). For `create_ticket`, document that the returned text is still `external_id|uuid` so existing parsing holds.
- [x] **Step 3: Commit.** `git add .claude/skills/dev-flow-plan/SKILL.md && git commit -m "feat(skills): dev-flow-plan MCP-first (create_ticket/stage_plan), script fallback retained"`

**Acceptance:** create + stage-plan are MCP-first; the `cut -d'|' -f1` parse note is present.

### Task 2.3: `ticket-ops` MCP-first

**Files:** Modify `.claude/skills/ticket-ops/SKILL.md` (309 lines · `.md` N/A)

- [x] **Step 1:** `grep -n "ticket.sh\|psql\|kubectl exec" .claude/skills/ticket-ops/SKILL.md`. DB **reads** → `mcp__mcp-postgres__query`; lifecycle → ticket-mcp tools (`transition_status`, `add_comment`, `triage_ticket`, `set_plan_meta`, `add_pr_link`, etc.).
- [x] **Step 2:** Rewrite reads + lifecycle to MCP-first + fallback. Do NOT pre-reference the unregistered `factory-mcp` server here — its wiring lands in Slice 3, Task 3.1; keep this task scoped to `mcp-postgres` reads + `ticket-mcp` lifecycle only.
- [x] **Step 3: Commit.** `git add .claude/skills/ticket-ops/SKILL.md && git commit -m "feat(skills): ticket-ops MCP-first (mcp-postgres reads + ticket-mcp lifecycle)"`

**Acceptance:** ticket-pool/staged-plan reads use mcp-postgres; lifecycle uses ticket-mcp; writes stay kubectl.

### Task 2.4: `incident-response` + `infra-ops` read-paths MCP-first

**Files:** Modify `.claude/skills/incident-response/SKILL.md` (93 lines · `.md` N/A), `.claude/skills/infra-ops/SKILL.md` (586 lines · `.md` N/A)

- [x] **Step 1:** In both, map cluster **status reads** (`kubectl get pods/logs/describe`) → `mcp__mcp-kubernetes__pods_list / pods_log / pods_get / resources_get` (first), kubectl as fallback. DB **reads** → `mcp__mcp-postgres__query`.
- [x] **Step 2:** Keep ALL mutations on kubectl: `kubectl apply`, `rollout restart`, scale, delete, SealedSecrets, DDL, writes — these must stay (per guide). Only reads flip.
- [x] **Step 3:** Rewrite the read steps to MCP-first + fallback; link the guard to `mcp-tool-guide.md`.
- [x] **Step 4: Commit.** `git add .claude/skills/incident-response/SKILL.md .claude/skills/infra-ops/SKILL.md && git commit -m "feat(skills): incident-response + infra-ops read-paths MCP-first (mcp-kubernetes/mcp-postgres), mutations stay kubectl"`

**Acceptance:** status/read steps are MCP-first; every mutation remains kubectl.

### Task 2.5 (Slice 2 verification gate)

- [x] **Step 1: No accidental write-over-MCP.** Run: `grep -rn "mcp__mcp-postgres__query" .claude/skills/{dev-flow-execute,ticket-ops,incident-response,infra-ops}/SKILL.md` and confirm each adjacent SQL is a SELECT.
- [x] **Step 2: Fallbacks intact.** Run: `grep -rn "ticket.sh\|kubectl exec" .claude/skills/{dev-flow-execute,dev-flow-plan,ticket-ops,incident-response,infra-ops}/SKILL.md` — every former call still exists as a labelled fallback (nothing deleted outright).
- [x] **Step 3: S4 — scripts still referenced.** The skills still name `scripts/ticket.sh` etc. (fallbacks), so no script becomes an orphan. Run: `task test:code-quality` → S4 clean.
- [x] **Step 4: CI-equivalent.** Run: `task test:changed && task freshness:check`. Expected: green.
- [x] **Step 5: Open PR #2.** Title: `feat(skills): MCP-first routing for the 5 high-frequency skills [T001211]`. Merge before Slice 3.

---

## SLICE 3 — Hygiene, SSOT doc, hard guardrail (PR #3)

**Outcome:** `factory-mcp` registered in both runtimes and wired into ops skills; CLAUDE.md/AGENTS.md server-name drift fixed; `mcp-tool-guide.md` rewritten as the mapping SSOT (lists every tool); and `tests/spec/mcp-tooling.bats` added + **wired into a task** so it is a hard CI gate.

### Task 3.1: Register `factory-mcp` (HTTP) in both runtimes + wire ops skills

**Files:** Modify `.mcp.json` (`.json` N/A), `.opencode/opencode.jsonc` (`.jsonc` N/A), `.claude/skills/ticket-ops/SKILL.md` (`.md` N/A), `.claude/skills/operations-management/SKILL.md` (48 lines · `.md` N/A)

factory-mcp (`scripts/factory/mcp-server.mjs`) serves StreamableHTTP at `127.0.0.1:13003/mcp` (health: `GET /health`), tools: `factory_status`, `factory_queue`, `factory_enqueue`, `factory_trigger`, `factory_recent`, `openspec_find_similar`.

- [x] **Step 1: Add to `.mcp.json`** (alongside the other HTTP servers):

```json
    "factory-mcp": {
      "type": "http",
      "url": "http://localhost:13003/mcp"
    }
```

- [x] **Step 2: Add to `.opencode/opencode.jsonc`** (alongside the other `"type": "remote"` HTTP servers):

```jsonc
    "factory-mcp": {
      "type": "remote",
      "url": "http://localhost:13003/mcp",
      "enabled": true
    }
```

- [x] **Step 3: Wire `ticket-ops` + `operations-management`** to prefer `mcp__factory-mcp__factory_status` / `factory_queue` / `factory_trigger` over equivalent script calls, with the script path retained as a fallback for when the daemon (`:13003`) is down. Document the health guard: `curl -sf --max-time 2 http://127.0.0.1:13003/health`.
- [x] **Step 4: Validate configs.** Run: `jq empty .mcp.json && jq -r '.mcp["factory-mcp"].url' <(sed 's://.*::' .opencode/opencode.jsonc 2>/dev/null) 2>/dev/null || node -e "require('fs').readFileSync('.opencode/opencode.jsonc','utf8')"; echo OK`. Expected: `.mcp.json` valid; jsonc readable.
- [x] **Step 5: Commit.** `git add .mcp.json .opencode/opencode.jsonc .claude/skills/ticket-ops/SKILL.md .claude/skills/operations-management/SKILL.md && git commit -m "feat(mcp): register factory-mcp (HTTP :13003) in both runtimes + wire ops skills"`

**Acceptance:** both runtime configs contain `factory-mcp` at `:13003/mcp`; ops skills prefer factory tools with script fallback.

### Task 3.2: Fix server-name drift in CLAUDE.md + AGENTS.md

**Files:** Modify `CLAUDE.md` (277 lines · `.md` N/A), `AGENTS.md` (178 lines · `.md` N/A)

- [x] **Step 1: Locate drift.** Run: `grep -rn "mcp-k8s\|mcp-factory" CLAUDE.md AGENTS.md`.
- [x] **Step 2: Fix.** In the opencode MCP descriptions, replace `mcp-k8s` → `mcp-kubernetes`. Replace `mcp-factory` claims with the now-real `factory-mcp` (registered in Task 3.1). Ensure the opencode server list reads: `mcp-kubernetes`, `mcp-browser`, `mcp-postgres`, `mcp-github`, `mcp-task-runner`, `task-master-ai`, `openspec`, `ticket-mcp`, `factory-mcp`.
- [x] **Step 3: Commit.** `git add CLAUDE.md AGENTS.md && git commit -m "docs: fix opencode MCP server-name drift (mcp-kubernetes; factory-mcp now real)"`

**Acceptance:** no `mcp-k8s` remains; `factory-mcp` is described as registered; `grep -rn "mcp-factory\b" CLAUDE.md AGENTS.md` returns nothing (or only as the registered server name).

### Task 3.3: Rewrite `mcp-tool-guide.md` as the mapping SSOT

**Files:** Modify `.claude/skills/references/mcp-tool-guide.md` (56 lines · `.md` N/A)

- [x] **Step 1: Enumerate the live Go tool set** (the guardrail in Task 3.4 checks this exact set is listed). Run:

```bash
grep -rhoE 'mcp\.NewTool\("[a-z_]+"' scripts/ticket-mcp/go/internal/tools/ | sed -E 's/.*"([a-z_]+)"/\1/' | sort -u
```

Expected ~23 names (12 pre-existing + `get_mishap_buffer`,`flush_mishap_buffer` + the 9 workflow tools).
- [x] **Step 2: Rewrite the guide** with one section per server: `mcp-postgres` (read-only `query`), `mcp-kubernetes` (status/read tools), `ticket-mcp` (**list every tool name from Step 1**, grouped: list/get, triage/planning, lifecycle, workflow, mishap), `factory-mcp` (`factory_status/queue/enqueue/trigger/recent/openspec_find_similar`, requires `:13003` daemon), `mcp-task-runner` (task execution + OTel), `task-master-ai` (**optional/available** — PRD/complexity, no skill logic), `mcp-browser` (untouched, Playwright). For each: Tools · When to prefer · Fallback.
- [x] **Step 3: Preserve the invariants** verbatim: the portforward/availability guard (curl health check), the "READ-ONLY, only `sql`" note for mcp-postgres, and the **kubectl-for-writes/DDL/superuser** rule.
- [x] **Step 4: Self-check guide completeness now** (pre-empt the guardrail). Run:

```bash
for t in $(grep -rhoE 'mcp\.NewTool\("[a-z_]+"' scripts/ticket-mcp/go/internal/tools/ | sed -E 's/.*"([a-z_]+)"/\1/' | sort -u); do
  grep -qF "$t" .claude/skills/references/mcp-tool-guide.md || echo "MISSING: $t"
done
```

Expected: no `MISSING:` lines.
- [x] **Step 5: Commit.** `git add .claude/skills/references/mcp-tool-guide.md && git commit -m "docs(mcp-tool-guide): rewrite as server→tool→when→fallback SSOT (lists all ticket-mcp + factory-mcp tools)"`

**Acceptance:** guide lists every Go tool name + factory-mcp tools; invariants retained; Step-4 check clean.

### Task 3.4: Extend the guardrail with the guide-completeness `@test`

The guard file `tests/spec/mcp-tooling.bats` and all Taskfile wiring (`test:mcp-tooling`
in `test:unit` + `test:changed`) already exist from **Slice 1, Task 1.2**. This task
only **appends a second `@test`** that enforces guide completeness, now that Task 3.3
has rewritten the guide to list every tool. Written red-first: the new `@test` would
fail against an un-updated guide, and Task 3.3's rewrite is what makes it pass.

**Files:**
- Modify: `tests/spec/mcp-tooling.bats` (`.bats` not gated → S1 N/A) — append the guide-completeness `@test` and add `GUIDE` to `setup()`.

- [x] **Step 1: Add `GUIDE` to `setup()`.** In `tests/spec/mcp-tooling.bats`, add to the existing `setup()`:

```bash
  GUIDE="$REPO_ROOT/.claude/skills/references/mcp-tool-guide.md"
```

- [x] **Step 2: Append the guide-completeness `@test`** to `tests/spec/mcp-tooling.bats`:

```bash
@test "every ticket-mcp Go tool is listed in mcp-tool-guide.md" {
  [ -d "$TOOLS_DIR" ]
  [ -f "$GUIDE" ]
  missing=()
  while IFS= read -r tool; do
    [ -z "$tool" ] && continue
    grep -qF "$tool" "$GUIDE" || missing+=("$tool")
  done < <(grep -rhoE 'mcp\.NewTool\("[a-z_]+"' "$TOOLS_DIR" | sed -E 's/.*"([a-z_]+)"/\1/' | sort -u)
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "# Tools missing from mcp-tool-guide.md: ${missing[*]}" >&2
  fi
  [ "${#missing[@]}" -eq 0 ]
}
```

- [x] **Step 3: Run the full guard — expected: pass** (Task 3.3 rewrote the guide to list every tool; Slice 1 wrapped every verb). Run: `task test:mcp-tooling`. Expected: `2 tests, 0 failures`.
- [x] **Step 4: Sanity — prove the new `@test` fails on drift** (temporary). Delete one tool line from `mcp-tool-guide.md`, run `task test:mcp-tooling` → expect 1 failure naming the missing tool; then `git checkout .claude/skills/references/mcp-tool-guide.md` to restore.
- [x] **Step 5: Verify wiring is intact.** Run: `grep -n "test:mcp-tooling" Taskfile.yml` → still appears in the task def, the `test:unit` list, and `test:changed` (all added in Slice 1; this task changes none of them).
- [x] **Step 6: Regenerate test inventory (likely no-op).** Run: `task test:inventory`. NOTE: `scripts/build-test-inventory.sh` scans only `tests/local`, `tests/prod`, `tests/e2e/specs` — NOT `tests/spec/` — so `website/src/data/test-inventory.json` is expected to be **unchanged**. If `git status` shows it changed, commit it.
- [x] **Step 7: Commit.** `git add tests/spec/mcp-tooling.bats && git add -A website/src/data/test-inventory.json 2>/dev/null; git commit -m "test(mcp): extend guardrail with guide-completeness @test"`

**Acceptance:** `task test:mcp-tooling` runs both `@test`s and passes; the guide-completeness `@test` fails on injected guide drift; Taskfile wiring from Slice 1 unchanged.

### Task 3.5 (Slice 3 verification gate = FINAL CI-equivalent gate)

- [x] **Step 1: OpenSpec validation (must be green before commit/push).** Run: `task test:openspec` (≡ `bash scripts/openspec.sh validate`). Expected: `openspec validate: OK` (the change delta has `## ADDED Requirements`, `### Requirement:` H3 entries, no H2 `## Requirement:`).
- [x] **Step 2: Guardrail green.** Run: `task test:mcp-tooling`. Expected: `2 tests, 0 failures`.
- [x] **Step 3: Targeted tests for changed domains.** Run: `task test:changed`. Expected: green (this Slice's changes under `.claude/skills/`, `.mcp.json`, `.opencode/`, `tests/spec/` trigger the new `RUN_MCP` branch → the guardrail runs).
- [x] **Step 4: Regenerate generated artifacts.** Run: `task freshness:regenerate`. Then re-run `task test:inventory` (no diff expected, per Task 3.4 Step 8). Commit any regen output (resolve generated-artifact conflicts with `git checkout --ours` per CLAUDE.md if a freshness regen collides on rebase).
- [x] **Step 5: Freshness + quality ratchet (CI equivalent).** Run: `task freshness:check`. Expected: green — S1 (no gated file touched), S2 (no new cycle), S3 (no host literals), S4 (no orphan; guard is wired, scripts still referenced by fallbacks), and **baseline key-count unchanged**.
- [x] **Step 6: Go suite still green** (in case of rebase). Run: `cd scripts/ticket-mcp/go && go vet ./... && go test ./... && make build`.
- [ ] **Step 7: Open PR #3.** Title: `feat(mcp): factory-mcp registration, tool-guide SSOT, re-drift guardrail [T001211]`. Ensure required checks (`Offline Tests`, `Security Scan`, `Brett TypeScript`, `Vitest (website)`, `Conventional Commits`) are green; auto-merge with `--squash`.

---

## Self-Review (author checklist — done)

- **Spec coverage:** ticket-mcp adapter completeness → Slice 1 (Tasks 1.1–1.2); Go-consolidation + parity → Slice 1 (1.1, 1.4); MCP-first routing → Slice 2; tool-guide SSOT → Slice 3 (3.3); factory-mcp registration → Slice 3 (3.1); server-name drift → Slice 3 (3.2); re-drift guardrail + execution → Slice 1 (1.2, adapter-completeness, red-first + wired) **and** Slice 3 (3.4, guide-completeness `@test`). All 6 requirements mapped.
- **Placeholder scan:** no open placeholder tokens in prose; full Go file + full bats file + exact JSON/jsonc/Taskfile edits + exact commands with expected output provided.
- **Type/name consistency:** tool names match the spec delta and the verb table; `RegisterWorkflowTools` matches main.go registration; `createMishapBundleTicket` matches its callers; guardrail verb list matches the skill-critical set in the spec delta.
- **Design corrections folded in (flagged in Global Constraints):** `create_ticket` requires `description`; `get_attachments` requires `out_dir`; `archive_plan` requires `slug`+`branch`+`plan_file`; mishap parity (`process` + buffer tools) is a deletion pre-condition; grill is deprecated-but-functional and distinct from triage_ticket.
