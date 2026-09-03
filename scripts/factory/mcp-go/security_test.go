// Behavioral tests for the shared HTTP security boundary baked into
// factory-mcp (facsimile of scripts/lib/mcp-http-security.mjs semantics).
//
// Output-verification convention (CLAUDE.md T002448-M4): every assertion runs
// routeWithGuard against a real httptest.Server and inspects the actual HTTP
// status/body — it never greps main.go source. [T900052]
package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

// newGuardTestServer builds an httptest.Server wired exactly like main(): /health
// is public, /mcp goes through the security guard with the given token + origins.
func newGuardTestServer(token string, origins []string) *httptest.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/mcp", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"ok":true}}`))
	})
	originsSet := map[string]bool{}
	for _, o := range origins {
		originsSet[o] = true
	}
	srv := httptest.NewServer(routeWithGuard(mux, token, originsSet))
	return srv
}

func mcpPost(url, token, origin string) (*http.Response, []byte) {
	body := bytes.NewBufferString(`{"jsonrpc":"2.0","id":1,"method":"ping"}`)
	req, _ := http.NewRequest(http.MethodPost, url+"/mcp", body)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return resp, nil
	}
	defer resp.Body.Close()
	buf := &bytes.Buffer{}
	_, _ = buf.ReadFrom(resp.Body)
	return resp, buf.Bytes()
}

func TestGuardAllowsNoOriginCLIWithValidBearer(t *testing.T) {
	srv := newGuardTestServer("secret-token", nil)
	defer srv.Close()

	resp, body := mcpPost(srv.URL, "secret-token", "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", resp.StatusCode, body)
	}
}

func TestGuardRejectsWrongToken(t *testing.T) {
	srv := newGuardTestServer("secret-token", nil)
	defer srv.Close()

	resp, body := mcpPost(srv.URL, "wrong-token", "")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (body=%s)", resp.StatusCode, body)
	}
}

func TestGuardRejectsMissingToken(t *testing.T) {
	srv := newGuardTestServer("secret-token", nil)
	defer srv.Close()

	resp, body := mcpPost(srv.URL, "", "")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (body=%s)", resp.StatusCode, body)
	}
}

func TestGuardAllowsExactAllowedBrowserOrigin(t *testing.T) {
	srv := newGuardTestServer("secret-token", []string{"https://app.example.com"})
	defer srv.Close()

	resp, body := mcpPost(srv.URL, "secret-token", "https://app.example.com")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", resp.StatusCode, body)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "https://app.example.com" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want exact allowed origin", got)
	}
}

func TestGuardRejectsForeignBrowserOrigin(t *testing.T) {
	srv := newGuardTestServer("secret-token", []string{"https://app.example.com"})
	defer srv.Close()

	resp, body := mcpPost(srv.URL, "secret-token", "https://evil.example.com")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (body=%s)", resp.StatusCode, body)
	}
}

func TestGuardRejectsForeignHost(t *testing.T) {
	srv := newGuardTestServer("secret-token", nil)
	defer srv.Close()

	// DNS-rebinding: overrides the Host header with a foreign hostname.
	body := bytes.NewBufferString(`{"jsonrpc":"2.0","id":1,"method":"ping"}`)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/mcp", body)
	req.Host = "evil.example.com"
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer secret-token")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (foreign Host)", resp.StatusCode)
	}
}

func TestGuardDoesNotSetWildcardCORS(t *testing.T) {
	srv := newGuardTestServer("secret-token", nil)
	defer srv.Close()

	resp, _ := mcpPost(srv.URL, "secret-token", "")
	// No allowed origin configured -> no Allow-Origin header at all; never "*".
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got == "*" {
		t.Fatalf("Access-Control-Allow-Origin = *, wildcard must never be set")
	}
}

func TestGuardAllowsOptionsPreflightFromAllowedOrigin(t *testing.T) {
	srv := newGuardTestServer("secret-token", []string{"https://app.example.com"})
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/mcp", nil)
	req.Header.Set("Origin", "https://app.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204 for preflight", resp.StatusCode)
	}
	if resp.Header.Get("Access-Control-Allow-Origin") != "https://app.example.com" {
		t.Fatalf("preflight Allow-Origin = %q, want exact origin", resp.Header.Get("Access-Control-Allow-Origin"))
	}
}

func TestGuardDeniesOptionsPreflightFromForeignOrigin(t *testing.T) {
	srv := newGuardTestServer("secret-token", []string{"https://app.example.com"})
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/mcp", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 for foreign-origin preflight", resp.StatusCode)
	}
}

func TestGuardHealthIsPublic(t *testing.T) {
	srv := newGuardTestServer("secret-token", nil)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("get health: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 for public /health", resp.StatusCode)
	}
}
