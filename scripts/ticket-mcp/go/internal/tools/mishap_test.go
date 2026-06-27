package tools

import (
	"encoding/json"
	"testing"
)

func TestClassifyBundleNoCritical(t *testing.T) {
	entries := []MishapEntry{
		{Title: "DB slow", Description: "Queries timing out", Component: "database", Type: "degraded", ReportedAt: "2026-06-21T10:00:00Z"},
		{Title: "UI broken", Description: "Button missing", Component: "frontend", Type: "degraded", ReportedAt: "2026-06-21T10:01:00Z"},
	}
	bundle := classifyBundle(entries)

	if bundle.Severity != "minor" {
		t.Errorf("expected severity=minor, got %s", bundle.Severity)
	}
	if bundle.Priority != "mittel" {
		t.Errorf("expected priority=mittel, got %s", bundle.Priority)
	}
	if bundle.Areas != "database,frontend" {
		t.Errorf("expected areas=database,frontend, got %s", bundle.Areas)
	}
	if bundle.Title != "Mishap-Bundle: database, frontend (2 Einträge)" {
		t.Errorf("unexpected title: %s", bundle.Title)
	}
}

func TestClassifyBundleWithCritical(t *testing.T) {
	entries := []MishapEntry{
		{Title: "Auth broken", Description: "Login fails", Component: "auth", Type: "broken", ReportedAt: "2026-06-21T10:00:00Z"},
		{Title: "Data leak", Description: "Exposed PII", Component: "api", Type: "security", ReportedAt: "2026-06-21T10:01:00Z"},
		{Title: "Slow query", Description: "Query takes 30s", Component: "database", Type: "degraded", ReportedAt: "2026-06-21T10:02:00Z"},
	}
	bundle := classifyBundle(entries)

	if bundle.Severity != "major" {
		t.Errorf("expected severity=major, got %s", bundle.Severity)
	}
	if bundle.Priority != "hoch" {
		t.Errorf("expected priority=hoch, got %s", bundle.Priority)
	}
	if bundle.Areas != "auth,api,database" {
		t.Errorf("expected areas=auth,api,database, got %s", bundle.Areas)
	}
}

func TestClassifyBundleInsertionOrder(t *testing.T) {
	entries := []MishapEntry{
		{Title: "A", Description: "x", Component: "database", Type: "degraded", ReportedAt: ""},
		{Title: "B", Description: "x", Component: "auth", Type: "degraded", ReportedAt: ""},
		{Title: "C", Description: "x", Component: "database", Type: "degraded", ReportedAt: ""},
	}
	bundle := classifyBundle(entries)

	if bundle.Areas != "database,auth" {
		t.Errorf("expected insertion-order areas=database,auth, got %s", bundle.Areas)
	}
}

func TestClassifyBundleDescription(t *testing.T) {
	entries := []MishapEntry{
		{Title: "DB slow", Description: "Queries timing out", Component: "database", Type: "degraded", ReportedAt: "2026-06-21T10:00:00Z"},
	}
	bundle := classifyBundle(entries)

	expectedTitle := "### Mishap 1: DB slow\n**Typ:** degraded | **Komponente:** database\n\nQueries timing out"
	if bundle.Description != expectedTitle {
		t.Errorf("expected description:\n%s\n\ngot:\n%s", expectedTitle, bundle.Description)
	}
}

func TestClassifyBundleEmptyComponents(t *testing.T) {
	entries := []MishapEntry{
		{Title: "A", Description: "x", Component: "  ", Type: "degraded", ReportedAt: ""},
		{Title: "B", Description: "x", Component: "", Type: "degraded", ReportedAt: ""},
	}
	bundle := classifyBundle(entries)

	if bundle.Areas != "" {
		t.Errorf("expected empty areas for blank components, got %s", bundle.Areas)
	}
}

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

func TestMishapEntryJSON(t *testing.T) {
	entry := MishapEntry{
		Title: "Test", Description: "Desc", Component: "comp", Type: "broken", ReportedAt: "2026-06-21T10:00:00Z",
	}
	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatal(err)
	}
	var decoded MishapEntry
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Title != "Test" || decoded.Type != "broken" || decoded.Component != "comp" {
		t.Errorf("JSON roundtrip failed: %+v", decoded)
	}
}
