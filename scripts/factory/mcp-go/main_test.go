// RED test for T002663: factory_ask ignores the routed apiKeyEnv (always
// authenticates with the hardcoded "lmstudio" literal) and never releases
// the provider slot it claims via route-provider.sh. See
// openspec/changes/factory-mcp-ask-key-slots/design.md for the root-cause
// write-up this test encodes.
//
// Output-verification convention (CLAUDE.md T002448-M4): every assertion
// below runs toolFactoryAsk() against a fake LLM backend and a stubbed
// FACTORY_REPO (route-provider.sh / release-slot.sh replaced by scripts
// under a temp dir) and inspects the actual HTTP request received / the
// actual release-slot.sh invocation logged — never greps main.go source.
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeStubRepo builds a fake FACTORY_REPO layout: scripts/factory/route-provider.sh
// always emits routeJSON verbatim; scripts/factory/release-slot.sh appends its
// argument list (space-joined) as one line to releaseLogPath on every invocation.
func writeStubRepo(t *testing.T, routeJSON, releaseLogPath string) string {
	t.Helper()
	repoDir := t.TempDir()
	factoryDir := filepath.Join(repoDir, "scripts", "factory")
	if err := os.MkdirAll(factoryDir, 0o755); err != nil {
		t.Fatalf("mkdir stub factory dir: %v", err)
	}
	routeScript := "#!/usr/bin/env bash\ncat <<'JSON'\n" + routeJSON + "\nJSON\n"
	if err := os.WriteFile(filepath.Join(factoryDir, "route-provider.sh"), []byte(routeScript), 0o644); err != nil {
		t.Fatalf("write route-provider.sh stub: %v", err)
	}
	releaseScript := fmt.Sprintf("#!/usr/bin/env bash\necho \"$@\" >> %q\n", releaseLogPath)
	if err := os.WriteFile(filepath.Join(factoryDir, "release-slot.sh"), []byte(releaseScript), 0o644); err != nil {
		t.Fatalf("write release-slot.sh stub: %v", err)
	}
	return repoDir
}

// fakeLLMServer captures the Authorization header of the first request it
// receives into *capturedAuth and answers with a minimal valid chat-completion
// body (statusCode==200) or an error body (statusCode>=400).
func fakeLLMServer(t *testing.T, capturedAuth *string, statusCode int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*capturedAuth = r.Header.Get("Authorization")
		if statusCode >= 400 {
			w.WriteHeader(statusCode)
			_, _ = w.Write([]byte(`{"error":"boom"}`))
			return
		}
		resp := map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"content": "ok"}, "finish_reason": "stop"},
			},
		}
		b, _ := json.Marshal(resp)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(b)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// Positive anchor (T002356-M1): a route with apiKeyEnv:null must keep using
// the documented FACTORY_LLM_API_KEY/"lmstudio" fallback both before and
// after the fix — this test is expected to PASS already. It proves the test
// harness itself (stub FACTORY_REPO, fake LLM server) is wired correctly
// before the red assertions below are trusted to mean anything.
func TestFactoryAsk_NullApiKeyEnv_FallsBackToLiteral(t *testing.T) {
	var gotAuth string
	srv := fakeLLMServer(t, &gotAuth, http.StatusOK)

	routeJSON := fmt.Sprintf(`{"provider":"llamacpp","modelId":"gemma26-factory","baseUrl":%q,"slotId":null,"ctx":0,"apiKeyEnv":null,"emergency":false}`, srv.URL)
	repoDir := writeStubRepo(t, routeJSON, filepath.Join(t.TempDir(), "release.log"))
	t.Setenv("FACTORY_REPO", repoDir)
	t.Setenv("FACTORY_LLM_API_KEY", "")

	_, isErr, err := toolFactoryAsk("ping")
	if err != nil {
		t.Fatalf("toolFactoryAsk: unexpected error: %v", err)
	}
	if isErr {
		t.Fatalf("toolFactoryAsk: unexpected tool-level error result")
	}
	if gotAuth != "Bearer lmstudio" {
		t.Fatalf("Authorization = %q, want fallback %q", gotAuth, "Bearer lmstudio")
	}
}

// RED: route-provider.sh names the real secret via apiKeyEnv, but
// toolFactoryAsk still authenticates with the hardcoded "lmstudio" literal
// (llmKey()) instead of resolving apiKeyEnv. Fails until resolveLLM/
// toolFactoryAsk honor the routed apiKeyEnv.
func TestFactoryAsk_RoutedApiKeyEnv_UsesRoutedSecret(t *testing.T) {
	var gotAuth string
	srv := fakeLLMServer(t, &gotAuth, http.StatusOK)

	routeJSON := fmt.Sprintf(`{"provider":"deepseek","modelId":"deepseek-chat","baseUrl":%q,"slotId":"deepseek","ctx":123,"apiKeyEnv":"TEST_FACTORY_ASK_APIKEY","emergency":false}`, srv.URL)
	repoDir := writeStubRepo(t, routeJSON, filepath.Join(t.TempDir(), "release.log"))
	t.Setenv("FACTORY_REPO", repoDir)
	t.Setenv("TEST_FACTORY_ASK_APIKEY", "sk-real-deepseek-secret")

	_, _, err := toolFactoryAsk("ping")
	if err != nil {
		t.Fatalf("toolFactoryAsk: unexpected error: %v", err)
	}
	want := "Bearer sk-real-deepseek-secret"
	if gotAuth != want {
		t.Fatalf("Authorization = %q, want %q (routed apiKeyEnv, not the hardcoded lmstudio literal)", gotAuth, want)
	}
}

// RED: main.go never calls release-slot.sh, so a claimed slot is leaked
// until reap-provider-slots.sh's 30-minute TTL clears it. Fails until
// toolFactoryAsk releases the slot after a successful request.
func TestFactoryAsk_ReleasesSlotAfterSuccess(t *testing.T) {
	var gotAuth string
	srv := fakeLLMServer(t, &gotAuth, http.StatusOK)

	releaseLog := filepath.Join(t.TempDir(), "release.log")
	routeJSON := fmt.Sprintf(`{"provider":"deepseek","modelId":"deepseek-chat","baseUrl":%q,"slotId":"deepseek","ctx":123,"apiKeyEnv":null,"emergency":false}`, srv.URL)
	repoDir := writeStubRepo(t, routeJSON, releaseLog)
	t.Setenv("FACTORY_REPO", repoDir)

	if _, _, err := toolFactoryAsk("ping"); err != nil {
		t.Fatalf("toolFactoryAsk: unexpected error: %v", err)
	}

	logBytes, readErr := os.ReadFile(releaseLog)
	if readErr != nil {
		t.Fatalf("release-slot.sh was not invoked (no log written): %v", readErr)
	}
	line := strings.TrimSpace(string(logBytes))
	want := "deepseek true 123"
	if line != want {
		t.Fatalf("release-slot.sh invocation = %q, want %q", line, want)
	}
}

// RED: same leak on the error path — release-slot.sh must still run with
// success=false so release-slot.sh's failure_count/cooldown bookkeeping gets
// a chance to run, and the slot is freed immediately instead of waiting out
// the reaper TTL. Fails until toolFactoryAsk releases the slot on this path.
func TestFactoryAsk_ReleasesSlotAfterFailure(t *testing.T) {
	var gotAuth string
	srv := fakeLLMServer(t, &gotAuth, http.StatusInternalServerError)

	releaseLog := filepath.Join(t.TempDir(), "release.log")
	routeJSON := fmt.Sprintf(`{"provider":"deepseek","modelId":"deepseek-chat","baseUrl":%q,"slotId":"deepseek","ctx":123,"apiKeyEnv":null,"emergency":false}`, srv.URL)
	repoDir := writeStubRepo(t, routeJSON, releaseLog)
	t.Setenv("FACTORY_REPO", repoDir)

	if _, _, err := toolFactoryAsk("ping"); err != nil {
		t.Fatalf("toolFactoryAsk: unexpected transport-level error: %v", err)
	}

	logBytes, readErr := os.ReadFile(releaseLog)
	if readErr != nil {
		t.Fatalf("release-slot.sh was not invoked on the error path (no log written): %v", readErr)
	}
	line := strings.TrimSpace(string(logBytes))
	want := "deepseek false 123"
	if line != want {
		t.Fatalf("release-slot.sh invocation = %q, want %q", line, want)
	}
}
