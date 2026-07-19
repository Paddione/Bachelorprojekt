# mishap-bundle — Delta-Spec

## Purpose

Fix two mishaps: qwen35-iq4 subagent empty output and triage_ticket component parameter.
No spec changes — implementation fixes to subagent prompt handling and ticket-mcp.

## ADDED Requirements

### Requirement: MISHAP-001 — Subagent output is non-empty

The qwen35-iq4 subagent returns meaningful output instead of empty strings
when delegated tasks complete or timeout.

### Requirement: MISHAP-002 — triage_ticket accepts component parameter

The ticket-mcp triage_ticket tool correctly processes the component field
without silent failures.
