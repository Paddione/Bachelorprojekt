// factory-mcp — lightweight Streamable-HTTP MCP server for the Software Factory.
//
// Re-implements scripts/factory/mcp-server.mjs in Go (stdlib only) and adds
// `factory_ask`, an LLM-backed Q&A tool that proxies to a local Qwen 3.5 9B
// served by LMStudio. Default endpoint matches the project's OPENAI_BASE_URL
// (see .opencode/opencode.jsonc). Protocol surface is identical to the
// previous Node version so .mcp.json / .opencode/opencode.jsonc do not change.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// ---------- env ----------

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func repo() string   { return envOr("FACTORY_REPO", "/home/patrick/Bachelorprojekt") }
func port() string   { return envOr("FACTORY_MCP_PORT", "13003") }
func llmKey() string { return envOr("FACTORY_LLM_API_KEY", "lmstudio") }

// resolveLLM calls route-provider.sh to get baseUrl + modelId from provider_config DB.
func resolveLLM() (baseURL, model string) {
	script := repo() + "/scripts/factory/route-provider.sh"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "bash", script, "factory-ask", "haiku").Output()
	if err != nil {
		// Fallback: env overrides (backwards compat for local dev)
		return envOr("FACTORY_LLM_URL", "http://192.168.100.10:1234/v1"),
			envOr("FACTORY_LLM_MODEL", "hermes-3-llama-3.1-8b")
	}
	var route struct {
		Provider string  `json:"provider"`
		ModelID  string  `json:"modelId"`
		BaseURL  *string `json:"baseUrl"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(out), &route); err != nil || route.BaseURL == nil || *route.BaseURL == "" {
		return envOr("FACTORY_LLM_URL", "http://192.168.100.10:1234/v1"),
			envOr("FACTORY_LLM_MODEL", "hermes-3-llama-3.1-8b")
	}
	// Ensure base URL ends with /v1 for OpenAI-compatible chat/completions path
	u := strings.TrimRight(*route.BaseURL, "/")
	if !strings.HasSuffix(u, "/v1") {
		u += "/v1"
	}
	return u, route.ModelID
}

func openspecURL() string {
	return envOr("OPENSPEC_SEARCH_URL", "http://website.website.svc.cluster.local:4321")
}

// ---------- MCP / JSON-RPC 2.0 plumbing ----------

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

const (
	codeParse          = -32700
	codeInvalidRequest = -32600
	codeMethodNotFound = -32601
	codeInvalidParams  = -32602
	codeInternal       = -32603
)

func errResp(id json.RawMessage, code int, msg string) rpcResponse {
	return rpcResponse{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: code, Message: msg}}
}

func okResp(id json.RawMessage, result any) rpcResponse {
	return rpcResponse{JSONRPC: "2.0", ID: id, Result: result}
}

type mcpTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

type mcpToolResult struct {
	Content []map[string]any `json:"content"`
	IsError bool             `json:"isError,omitempty"`
}

type toolCallParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

// ---------- server info ----------

const (
	serverName    = "factory-mcp"
	serverVersion = "2.0.0"
)

func initResult() map[string]any {
	return map[string]any{
		"protocolVersion": "2024-11-05",
		"serverInfo":      map[string]any{"name": serverName, "version": serverVersion},
		"capabilities":    map[string]any{"tools": map[string]any{}},
	}
}

// ---------- HTTP handler ----------

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"server":"factory-mcp"}`))
	})
	mux.HandleFunc("/mcp", handleMCP)
	addr := "127.0.0.1:" + port()
	log.Printf("factory-mcp listening on %s (repo=%s)", addr, repo())
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func handleMCP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errResp(nil, codeParse, "read body: "+err.Error()))
		return
	}
	var req rpcRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errResp(nil, codeParse, "invalid json: "+err.Error()))
		return
	}
	if req.JSONRPC != "2.0" {
		writeJSON(w, http.StatusBadRequest, errResp(req.ID, codeInvalidRequest, "jsonrpc must be 2.0"))
		return
	}
	// Notifications have no ID; per JSON-RPC 2.0 they get no reply.
	if len(req.ID) == 0 || string(req.ID) == "null" {
		// acknowledge silently — no response
		w.WriteHeader(http.StatusNoContent)
		return
	}
	resp := dispatch(req)
	writeJSON(w, http.StatusOK, resp)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func dispatch(req rpcRequest) rpcResponse {
	switch req.Method {
	case "initialize":
		return okResp(req.ID, initResult())
	case "ping":
		return okResp(req.ID, map[string]any{})
	case "tools/list":
		return okResp(req.ID, map[string]any{"tools": toolList()})
	case "tools/call":
		var p toolCallParams
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return errResp(req.ID, codeInvalidParams, "invalid params: "+err.Error())
		}
		text, isErr, err := runTool(p.Name, p.Arguments)
		if err != nil {
			return okResp(req.ID, mcpToolResult{
				Content: []map[string]any{{"type": "text", "text": "error: " + err.Error()}},
				IsError: true,
			})
		}
		return okResp(req.ID, mcpToolResult{
			Content: []map[string]any{{"type": "text", "text": text}},
			IsError: isErr,
		})
	default:
		return errResp(req.ID, codeMethodNotFound, "method not found: "+req.Method)
	}
}

// ---------- tool registry ----------

func toolList() []mcpTool {
	return []mcpTool{
		{
			Name:        "factory_status",
			Description: "Show factory queue depth and whether a tick is running",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
		},
		{
			Name:        "factory_queue",
			Description: "List waiting tickets (backlog + plan_staged)",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
		},
		{
			Name:        "factory_enqueue",
			Description: "Enqueue a ticket into the factory backlog",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"ticket_id": map[string]any{"type": "string", "description": "Ticket external_id (e.g. T000123)"},
				},
				"required": []string{"ticket_id"},
			},
		},
		{
			Name:        "factory_trigger",
			Description: "Trigger an immediate factory tick (runs wakeup.sh in background)",
			InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
		},
		{
			Name:        "factory_recent",
			Description: "Show last N factory run comments from ticket_comments",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"limit": map[string]any{"type": "number", "description": "Number of recent entries (default 10, max 50)"},
				},
			},
		},
		{
			Name:        "openspec_find_similar",
			Description: "Findet semantisch ähnliche OpenSpec Changes zu einer Suchanfrage (wraps /api/openspec/search)",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query":  map[string]any{"type": "string", "description": "Suchanfrage"},
					"limit":  map[string]any{"type": "number", "description": "Default 5"},
					"status": map[string]any{"type": "string", "description": "Filter: planning | plan_staged | archived"},
				},
				"required": []string{"query"},
			},
		},
		{
			Name:        "factory_ask",
			Description: "Ask a natural-language question about the Software Factory. Backed by local Qwen 3.5 9B. For actions (enqueue/trigger/...), prefer the dedicated tools.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"question": map[string]any{"type": "string", "description": "Free-form question about factory state, processes, or conventions"},
				},
				"required": []string{"question"},
			},
		},
	}
}

func runTool(name string, args json.RawMessage) (string, bool, error) {
	switch name {
	case "factory_status":
		return toolFactoryStatus()
	case "factory_queue":
		return toolFactoryQueue()
	case "factory_enqueue":
		var a struct {
			TicketID string `json:"ticket_id"`
		}
		_ = json.Unmarshal(args, &a)
		return toolFactoryEnqueue(a.TicketID)
	case "factory_trigger":
		return toolFactoryTrigger()
	case "factory_recent":
		var a struct {
			Limit json.RawMessage `json:"limit"`
		}
		_ = json.Unmarshal(args, &a)
		return toolFactoryRecent(a.Limit)
	case "openspec_find_similar":
		var a struct {
			Query  string          `json:"query"`
			Limit  json.RawMessage `json:"limit"`
			Status string          `json:"status"`
		}
		_ = json.Unmarshal(args, &a)
		return toolOpenspecSimilar(a.Query, a.Limit, a.Status)
	case "factory_ask":
		var a struct {
			Question string `json:"question"`
		}
		_ = json.Unmarshal(args, &a)
		return toolFactoryAsk(a.Question)
	default:
		return "", true, fmt.Errorf("unknown tool: %s", name)
	}
}

// ---------- psql helper (matches mcp-server.mjs psqlJSON) ----------

func psqlJSON(sql string) string {
	r := repo()
	heredoc := fmt.Sprintf(
		`source "%s/scripts/factory/lib.sh" && factory_resolve && cat <<'SQL' | factory_psql -tA
%s
SQL`, r, sql)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "bash", "-c", heredoc).Output()
	if err != nil {
		bb, _ := exec.CommandContext(ctx, "bash", "-c", heredoc).CombinedOutput()
		return fmt.Sprintf(`{"error":%q}`, strings.TrimSpace(string(bb)))
	}
	return strings.TrimSpace(string(out))
}

// ---------- tool implementations ----------

func toolFactoryStatus() (string, bool, error) {
	// Mirrors mcp-server.mjs:27 — flock -n returns 0 when lock is FREE.
	lockHeld, err := runShell(`test -f /tmp/factory-tick.lock || { echo 'false'; exit; }; (flock -n 9 2>/dev/null && echo 'false' || echo 'true') 9>/tmp/factory-tick.lock`, 3*time.Second)
	if err != nil {
		return "", false, err
	}
	lockHeld = strings.TrimSpace(lockHeld)
	backlog := psqlJSON("SELECT count(*) FROM tickets.tickets WHERE status='backlog'")
	planStaged := psqlJSON("SELECT count(*) FROM tickets.tickets WHERE status='plan_staged'")
	out := map[string]any{
		"backlog":      backlog,
		"plan_staged":  planStaged,
		"tick_running": lockHeld == "true",
	}
	b, _ := json.MarshalIndent(out, "", "  ")
	return string(b), false, nil
}

func toolFactoryQueue() (string, bool, error) {
	sql := `SELECT COALESCE(json_agg(row_to_json(q)), '[]') FROM (SELECT external_id, title, priority, status FROM tickets.tickets WHERE status IN ('backlog','plan_staged') ORDER BY CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 ELSE 3 END, created_at) q;`
	return psqlJSON(sql), false, nil
}

func toolFactoryEnqueue(ticketID string) (string, bool, error) {
	if ticketID == "" {
		return "", true, fmt.Errorf("ticket_id is required")
	}
	out, err := runShellCapture(fmt.Sprintf(`%s/scripts/ticket.sh enqueue --id %s`, repo(), ticketID), 15*time.Second)
	if err != nil {
		return "", true, fmt.Errorf("%s: %s", err.Error(), out)
	}
	out = strings.TrimSpace(out)
	if out == "" {
		return "enqueued " + ticketID, false, nil
	}
	return out, false, nil
}

func toolFactoryTrigger() (string, bool, error) {
	cmd := exec.Command("bash", repo()+"/scripts/factory/wakeup.sh")
	cmd.Stdout, cmd.Stderr = nil, nil
	if err := cmd.Start(); err != nil {
		return "", true, err
	}
	pid := cmd.Process.Pid
	// Detach — we don't wait. wakeup.sh is meant to run independently.
	go func() { _ = cmd.Wait() }()
	return fmt.Sprintf(`{"wakeup_started":true,"pid":%d}`, pid), false, nil
}

func toolFactoryRecent(limitJSON json.RawMessage) (string, bool, error) {
	limit := 10
	if len(limitJSON) > 0 && string(limitJSON) != "null" {
		if n, err := strconv.Atoi(strings.TrimSpace(string(limitJSON))); err == nil {
			limit = n
		}
	}
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}
	sql := fmt.Sprintf(`SELECT COALESCE(json_agg(row_to_json(q)), '[]') FROM (SELECT ticket_id, author_label AS author, body, created_at FROM tickets.ticket_comments WHERE author_label='factory' ORDER BY created_at DESC LIMIT %d) q;`, limit)
	return psqlJSON(sql), false, nil
}

func toolOpenspecSimilar(query string, limitJSON json.RawMessage, status string) (string, bool, error) {
	if strings.TrimSpace(query) == "" {
		return "", true, fmt.Errorf("query is required")
	}
	u := openspecURL() + "/api/openspec/search?" + buildQuery(query, limitJSON, status)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", true, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return string(body), true, nil
	}
	return string(body), false, nil
}

// ---------- factory_ask — LLM Q&A ----------

const factorySystemPrompt = `You are the assistant for the Software Factory MCP server in the bachelorprojekt monorepo.
Answer briefly and concretely. Prefer suggesting the right factory_* tool call when the user
wants an action (factory_status, factory_queue, factory_enqueue, factory_trigger,
factory_recent, openspec_find_similar). When the caller already invoked this tool,
they want a free-form answer, not a tool recommendation.

Available factory state (read-only via separate tools):
- Tickets in tickets.tickets with statuses triage, planning, plan_staged, backlog, in_progress, in_review, awaiting_deploy, done.
- A factory tick runs periodically (or via factory_trigger) and picks from backlog + plan_staged.
- OpenSpec changes live under openspec/changes/ (proposals) and openspec/specs/ (SSOT).

Keep replies under 200 words. Respond in the same language as the question.
IMPORTANT: Do not output chain-of-thought or reasoning blocks. Provide the final answer only.`

func toolFactoryAsk(question string) (string, bool, error) {
	q := strings.TrimSpace(question)
	if q == "" {
		return "", true, fmt.Errorf("question is required")
	}
	llmBase, model := resolveLLM()
	body := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": factorySystemPrompt},
			{"role": "user", "content": q},
		},
		"temperature": 0.2,
		"max_tokens":  1500,
	}
	if strings.Contains(strings.ToLower(model), "qwen") {
		body["chat_template_kwargs"] = map[string]any{"enable_thinking": false}
	}
	bb, _ := json.Marshal(body)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, llmBase+"/chat/completions", bytes.NewReader(bb))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+llmKey())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", true, fmt.Errorf("llm request: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return string(raw), true, nil
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content          string `json:"content"`
				ReasoningContent string `json:"reasoning_content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", true, fmt.Errorf("llm parse: %w (body: %s)", err, truncate(string(raw), 500))
	}
	if len(parsed.Choices) == 0 {
		return `{"answer":"(empty)","model":"` + model + `"}`, false, nil
	}
	msg := parsed.Choices[0].Message
	ans := strings.TrimSpace(msg.Content)
	src := "content"
	if ans == "" {
		// Qwen3 reasoning models often spend the budget on reasoning_content and
		// leave content empty. Fall back to the visible part of the reasoning
		// trace, trimmed to a usable answer.
		ans = extractAnswerFromReasoning(msg.ReasoningContent)
		src = "reasoning_content"
	}
	if ans == "" {
		ans = fmt.Sprintf("(model returned empty content, finish_reason=%s)", parsed.Choices[0].FinishReason)
	}
	out := map[string]any{
		"answer": ans,
		"model":  model,
		"source": src,
	}
	b, _ := json.Marshal(out)
	return string(b), false, nil
}

// extractAnswerFromReasoning trims a Qwen3 reasoning trace down to the part
// after the last "answer:" / "Final answer:" marker, falling back to the
// last non-empty paragraph. Reasoning traces often end with the actual reply.
func extractAnswerFromReasoning(reasoning string) string {
	r := strings.TrimSpace(reasoning)
	if r == "" {
		return ""
	}
	lower := strings.ToLower(r)
	markers := []string{"final answer:", "answer:"}
	best := -1
	for _, m := range markers {
		if i := strings.LastIndex(lower, m); i > best {
			best = i + len(m)
		}
	}
	if best >= 0 {
		return strings.TrimSpace(r[best:])
	}
	// Fall back: last paragraph (split on double newline).
	if parts := strings.Split(r, "\n\n"); len(parts) > 1 {
		return strings.TrimSpace(parts[len(parts)-1])
	}
	return r
}

// ---------- shell helpers ----------

func runShell(shellCmd string, timeout time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "bash", "-c", shellCmd).Output()
	return string(out), err
}

func runShellCapture(shellCmd string, timeout time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "bash", "-c", shellCmd)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	return buf.String(), err
}

func buildQuery(q string, limitJSON json.RawMessage, status string) string {
	vals := url.Values{}
	vals.Set("q", q)
	if len(limitJSON) > 0 && string(limitJSON) != "null" {
		if n, err := strconv.Atoi(strings.TrimSpace(string(limitJSON))); err == nil && n > 0 {
			vals.Set("limit", strconv.Itoa(n))
		}
	}
	if s := strings.TrimSpace(status); s != "" {
		vals.Set("status", s)
	}
	return vals.Encode()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
