package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// newMockIN creates a test Invoice Ninja server.
// ssoSessionID: what /sso-auth.php returns (empty = don't serve JSON)
// ssoStatus: HTTP status for /sso-auth.php
// All other paths return 200 "IN-response".
func newMockIN(t *testing.T, ssoSessionID string, ssoStatus int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/sso-auth.php" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(ssoStatus)
			if ssoSessionID != "" {
				json.NewEncoder(w).Encode(map[string]string{"session_id": ssoSessionID})
			}
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("IN-response"))
	}))
}

// TestNoEmailHeader: skip-auth paths (no X-Auth-Request-Email) proxy directly.
func TestNoEmailHeader(t *testing.T) {
	mock := newMockIN(t, "", 200)
	defer mock.Close()

	handler := buildHandler(mock.URL)
	req := httptest.NewRequest("GET", "/favicon.ico", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d", w.Code)
	}
	if w.Body.String() != "IN-response" {
		t.Errorf("want IN-response, got %q", w.Body.String())
	}
	if w.Header().Get("Set-Cookie") != "" {
		t.Error("expected no Set-Cookie header")
	}
}

// TestAlreadyHasSession: authenticated request with _sso_injected indicator proxies directly.
func TestAlreadyHasSession(t *testing.T) {
	mock := newMockIN(t, "", 200)
	defer mock.Close()

	handler := buildHandler(mock.URL)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Auth-Request-Email", "user@example.com")
	req.AddCookie(&http.Cookie{Name: ssoInjectedCookie, Value: "1"})
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d", w.Code)
	}
	if w.Header().Get("Set-Cookie") != "" {
		t.Error("expected no Set-Cookie on already-authenticated request")
	}
}

// TestCreateSession: email present, no session → 302 redirect with Set-Cookie.
func TestCreateSession(t *testing.T) {
	mock := newMockIN(t, "abc123", http.StatusOK)
	defer mock.Close()

	handler := buildHandler(mock.URL)
	req := httptest.NewRequest("GET", "/clients", nil)
	req.Header.Set("X-Auth-Request-Email", "user@example.com")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusFound {
		t.Errorf("want 302, got %d", w.Code)
	}
	if w.Header().Get("Location") != "/clients" {
		t.Errorf("want Location /clients, got %q", w.Header().Get("Location"))
	}
	cookie := w.Header().Get("Set-Cookie")
	if cookie == "" {
		t.Fatal("expected Set-Cookie header")
	}
	if !containsStr(cookie, "laravel_session=abc123") {
		t.Errorf("expected laravel_session=abc123 in %q", cookie)
	}
	if !containsStr(cookie, "HttpOnly") {
		t.Errorf("expected HttpOnly in cookie: %q", cookie)
	}

	// Also verify the _sso_injected indicator cookie is set with MaxAge.
	found := false
	for _, c := range w.Result().Cookies() {
		if c.Name == ssoInjectedCookie {
			found = true
			if c.MaxAge != sessionMaxAge {
				t.Errorf("want MaxAge=%d, got %d", sessionMaxAge, c.MaxAge)
			}
			break
		}
	}
	if !found {
		t.Errorf("expected %s cookie to be set", ssoInjectedCookie)
	}
}

// TestSessionCreationFailure: sso-auth.php returns 404 → fall through to IN.
func TestSessionCreationFailure(t *testing.T) {
	mock := newMockIN(t, "", http.StatusNotFound)
	defer mock.Close()

	handler := buildHandler(mock.URL)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Auth-Request-Email", "unknown@example.com")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	// Should proxy to IN (200 "IN-response"), not 302
	if w.Code != http.StatusOK {
		t.Errorf("want 200 (fall-through), got %d", w.Code)
	}
	if w.Header().Get("Set-Cookie") != "" {
		t.Error("expected no Set-Cookie on failure path")
	}
}

// TestHealthz: /healthz returns 200 OK.
func TestHealthz(t *testing.T) {
	mock := newMockIN(t, "", 200)
	defer mock.Close()

	handler := buildHandler(mock.URL)
	req := httptest.NewRequest("GET", "/healthz", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d", w.Code)
	}
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
