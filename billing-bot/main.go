// billing-bot bridges Mattermost interactive messages with the Invoice Ninja v5 API.
//
// Endpoints:
//   POST /slash    — Mattermost slash command (/billing)
//   POST /actions  — Mattermost interactive message actions (button clicks)
//   GET  /healthz  — Liveness/readiness probe
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// ── Configuration ────────────────────────────────────────────────

var (
	listenAddr      = env("LISTEN_ADDR", ":8090")
	invoiceNinjaURL = env("INVOICENINJA_URL", "http://invoiceninja:8080")
	invoiceNinjaKey = env("INVOICENINJA_API_TOKEN", "")
	mattermostURL   = env("MATTERMOST_URL", "http://mattermost:8065")
	mattermostToken = env("MATTERMOST_BOT_TOKEN", "")
	billingDomain   = env("BILLING_DOMAIN", "billing.localhost")
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── Mattermost Types ─────────────────────────────────────────────

type SlashRequest struct {
	Token       string `json:"token"`
	TeamID      string `json:"team_id"`
	ChannelID   string `json:"channel_id"`
	ChannelName string `json:"channel_name"`
	UserID      string `json:"user_id"`
	UserName    string `json:"user_name"`
	Command     string `json:"command"`
	Text        string `json:"text"`
	ResponseURL string `json:"response_url"`
}

type ActionRequest struct {
	UserID    string            `json:"user_id"`
	UserName  string            `json:"user_name"`
	ChannelID string            `json:"channel_id"`
	PostID    string            `json:"post_id"`
	Context   map[string]string `json:"context"`
}

type SlashResponse struct {
	ResponseType string       `json:"response_type"`
	Text         string       `json:"text,omitempty"`
	Attachments  []Attachment `json:"attachments,omitempty"`
}

type Attachment struct {
	Text    string   `json:"text,omitempty"`
	Color   string   `json:"color,omitempty"`
	Actions []Action `json:"actions,omitempty"`
}

type Action struct {
	ID          string      `json:"id"`
	Type        string      `json:"type"`
	Name        string      `json:"name"`
	Style       string      `json:"style,omitempty"`
	Integration Integration `json:"integration"`
}

type Integration struct {
	URL     string            `json:"url"`
	Context map[string]string `json:"context"`
}

type ActionResponse struct {
	Update        *UpdatePost `json:"update,omitempty"`
	EphemeralText string      `json:"ephemeral_text,omitempty"`
}

type UpdatePost struct {
	Message     string       `json:"message"`
	Attachments []Attachment `json:"attachments,omitempty"`
}

// ── Invoice Ninja Types ──────────────────────────────────────────

type INClient struct {
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	Contacts []INContact `json:"contacts"`
}

type INContact struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
}

type INLineItem struct {
	ProductKey string  `json:"product_key"`
	Notes      string  `json:"notes"`
	Cost       float64 `json:"cost"`
	Quantity   float64 `json:"quantity"`
}

type INInvoice struct {
	ID        string       `json:"id"`
	Number    string       `json:"number"`
	ClientID  string       `json:"client_id"`
	Date      string       `json:"date"`
	DueDate   string       `json:"due_date"`
	Amount    float64      `json:"amount"`
	LineItems []INLineItem `json:"line_items"`
}

type INQuote struct {
	ID        string       `json:"id"`
	Number    string       `json:"number"`
	ClientID  string       `json:"client_id"`
	Date      string       `json:"date"`
	Amount    float64      `json:"amount"`
	LineItems []INLineItem `json:"line_items"`
}

type INExpense struct {
	ID       string  `json:"id"`
	Number   string  `json:"number"`
	ClientID string  `json:"client_id,omitempty"`
	Amount   float64 `json:"amount"`
	Category string  `json:"category"`
}

type INResponse[T any] struct {
	Data T `json:"data"`
}

// ── Main ─────────────────────────────────────────────────────────

func main() {
	http.HandleFunc("/slash", handleSlash)
	http.HandleFunc("/actions", handleAction)
	http.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "ok")
	})

	log.Printf("billing-bot listening on %s", listenAddr)
	log.Fatal(http.ListenAndServe(listenAddr, nil))
}

// ── Slash Command Handler ────────────────────────────────────────

func handleSlash(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	req := SlashRequest{
		ChannelID:   r.FormValue("channel_id"),
		ChannelName: r.FormValue("channel_name"),
		UserID:      r.FormValue("user_id"),
		UserName:    r.FormValue("user_name"),
		Text:        strings.TrimSpace(r.FormValue("text")),
		ResponseURL: r.FormValue("response_url"),
	}

	var resp SlashResponse

	switch {
	case req.Text == "" || req.Text == "help":
		resp = buildMainMenu(req.ChannelName)
	case strings.HasPrefix(req.Text, "client "):
		resp = handleQuickClient(req)
	case strings.HasPrefix(req.Text, "invoice "):
		resp = handleQuickInvoice(req)
	default:
		resp = SlashResponse{
			ResponseType: "ephemeral",
			Text:         fmt.Sprintf("Unbekannter Befehl: `%s`. Nutze `/billing` oder `/billing help` fuer die Aktionen.", req.Text),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// buildMainMenu returns the interactive button menu shown when user types /billing
func buildMainMenu(channelName string) SlashResponse {
	actionURL := fmt.Sprintf("http://billing-bot:8090/actions")

	return SlashResponse{
		ResponseType: "ephemeral",
		Attachments: []Attachment{
			{
				Text:  fmt.Sprintf("**Buchhaltung** — Channel: `%s`\nWas moechtest du erstellen?", channelName),
				Color: "#1E88E5",
				Actions: []Action{
					{
						ID:    "create_invoice",
						Type:  "button",
						Name:  "Rechnung erstellen",
						Style: "primary",
						Integration: Integration{
							URL:     actionURL,
							Context: map[string]string{"action": "create_invoice"},
						},
					},
					{
						ID:   "create_quote",
						Type: "button",
						Name: "Angebot erstellen",
						Integration: Integration{
							URL:     actionURL,
							Context: map[string]string{"action": "create_quote"},
						},
					},
					{
						ID:   "create_expense",
						Type: "button",
						Name: "Ausgabe erfassen",
						Integration: Integration{
							URL:     actionURL,
							Context: map[string]string{"action": "create_expense"},
						},
					},
					{
						ID:    "create_client",
						Type:  "button",
						Name:  "Kunde anlegen",
						Style: "success",
						Integration: Integration{
							URL:     actionURL,
							Context: map[string]string{"action": "create_client"},
						},
					},
					{
						ID:   "list_invoices",
						Type: "button",
						Name: "Rechnungen anzeigen",
						Integration: Integration{
							URL:     actionURL,
							Context: map[string]string{"action": "list_invoices"},
						},
					},
					{
						ID:   "open_dashboard",
						Type: "button",
						Name: "Dashboard oeffnen",
						Integration: Integration{
							URL:     actionURL,
							Context: map[string]string{"action": "open_dashboard"},
						},
					},
				},
			},
		},
	}
}

// ── Interactive Action Handler ───────────────────────────────────

func handleAction(w http.ResponseWriter, r *http.Request) {
	var req ActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	action := req.Context["action"]
	log.Printf("action=%s user=%s channel=%s", action, req.UserName, req.ChannelID)

	var resp ActionResponse

	switch action {
	case "create_invoice":
		resp = actionCreateInvoice(req)
	case "create_quote":
		resp = actionCreateQuote(req)
	case "create_expense":
		resp = actionCreateExpense(req)
	case "create_client":
		resp = actionCreateClient(req)
	case "list_invoices":
		resp = actionListInvoices(req)
	case "open_dashboard":
		resp = ActionResponse{
			EphemeralText: fmt.Sprintf("Oeffne das Invoice Ninja Dashboard: [billing.localhost](http://%s)", billingDomain),
		}
	default:
		resp = ActionResponse{
			EphemeralText: fmt.Sprintf("Unbekannte Aktion: `%s`", action),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ── Action Implementations ───────────────────────────────────────

func actionCreateClient(req ActionRequest) ActionResponse {
	client := map[string]interface{}{
		"name": fmt.Sprintf("Kunde von @%s", req.UserName),
		"contacts": []map[string]string{
			{"first_name": req.UserName, "email": req.UserName + "@homeoffice.local"},
		},
	}

	var result INResponse[INClient]
	err := inAPI("POST", "/api/v1/clients", client, &result)
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler beim Anlegen: %v", err)}
	}

	return ActionResponse{
		EphemeralText: fmt.Sprintf(
			"Kunde **%s** angelegt (ID: `%s`).\n\nBearbeiten: [Invoice Ninja](http://%s/#/clients/%s)",
			result.Data.Name, result.Data.ID, billingDomain, result.Data.ID,
		),
	}
}

func actionCreateInvoice(req ActionRequest) ActionResponse {
	// Get first available client, or prompt to create one
	clients, err := inListClients()
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler beim Laden der Kunden: %v", err)}
	}
	if len(clients) == 0 {
		return ActionResponse{
			EphemeralText: "Noch keine Kunden vorhanden. Bitte zuerst einen **Kunden anlegen**.",
		}
	}

	today := time.Now().Format("2006-01-02")
	due := time.Now().AddDate(0, 0, 30).Format("2006-01-02")

	invoice := map[string]interface{}{
		"client_id": clients[0].ID,
		"date":      today,
		"due_date":  due,
		"line_items": []map[string]interface{}{
			{
				"product_key": "SERVICE",
				"notes":       "Dienstleistung (bitte in Invoice Ninja anpassen)",
				"cost":        0,
				"quantity":    1,
			},
		},
	}

	var result INResponse[INInvoice]
	if err := inAPI("POST", "/api/v1/invoices", invoice, &result); err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}

	return ActionResponse{
		EphemeralText: fmt.Sprintf(
			"Rechnung **%s** erstellt fuer Kunde **%s**.\n"+
				"Faellig am: %s\n\n"+
				"Bearbeiten: [Invoice Ninja](http://%s/#/invoices/%s/edit)\n\n"+
				"_Passe Positionen und Betraege direkt in Invoice Ninja an._",
			result.Data.Number, clients[0].Name, due, billingDomain, result.Data.ID,
		),
	}
}

func actionCreateQuote(req ActionRequest) ActionResponse {
	clients, err := inListClients()
	if err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}
	if len(clients) == 0 {
		return ActionResponse{
			EphemeralText: "Noch keine Kunden vorhanden. Bitte zuerst einen **Kunden anlegen**.",
		}
	}

	today := time.Now().Format("2006-01-02")

	quote := map[string]interface{}{
		"client_id": clients[0].ID,
		"date":      today,
		"line_items": []map[string]interface{}{
			{
				"product_key": "SERVICE",
				"notes":       "Angebot (bitte in Invoice Ninja anpassen)",
				"cost":        0,
				"quantity":    1,
			},
		},
	}

	var result INResponse[INQuote]
	if err := inAPI("POST", "/api/v1/quotes", quote, &result); err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}

	return ActionResponse{
		EphemeralText: fmt.Sprintf(
			"Angebot **%s** erstellt fuer Kunde **%s**.\n\n"+
				"Bearbeiten: [Invoice Ninja](http://%s/#/quotes/%s/edit)",
			result.Data.Number, clients[0].Name, billingDomain, result.Data.ID,
		),
	}
}

func actionCreateExpense(req ActionRequest) ActionResponse {
	expense := map[string]interface{}{
		"amount":        0,
		"public_notes":  fmt.Sprintf("Ausgabe erfasst von @%s", req.UserName),
		"private_notes": "Bitte Betrag und Kategorie in Invoice Ninja anpassen",
		"date":          time.Now().Format("2006-01-02"),
	}

	var result INResponse[INExpense]
	if err := inAPI("POST", "/api/v1/expenses", expense, &result); err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}

	return ActionResponse{
		EphemeralText: fmt.Sprintf(
			"Ausgabe erfasst (ID: `%s`).\n\n"+
				"Bearbeiten: [Invoice Ninja](http://%s/#/expenses/%s/edit)\n\n"+
				"_Bitte Betrag und Kategorie anpassen._",
			result.Data.ID, billingDomain, result.Data.ID,
		),
	}
}

func actionListInvoices(req ActionRequest) ActionResponse {
	var result INResponse[[]INInvoice]
	if err := inAPI("GET", "/api/v1/invoices?per_page=5&sort=created_at|desc", nil, &result); err != nil {
		return ActionResponse{EphemeralText: fmt.Sprintf("Fehler: %v", err)}
	}

	if len(result.Data) == 0 {
		return ActionResponse{EphemeralText: "Noch keine Rechnungen vorhanden."}
	}

	var lines []string
	lines = append(lines, "**Letzte Rechnungen:**\n")
	lines = append(lines, "| Nr. | Betrag | Datum | Link |")
	lines = append(lines, "|-----|--------|-------|------|")
	for _, inv := range result.Data {
		lines = append(lines, fmt.Sprintf("| %s | %.2f EUR | %s | [Bearbeiten](http://%s/#/invoices/%s/edit) |",
			inv.Number, inv.Amount, inv.Date, billingDomain, inv.ID))
	}

	return ActionResponse{
		EphemeralText: strings.Join(lines, "\n"),
	}
}

// ── Quick Commands (slash text) ──────────────────────────────────

func handleQuickClient(req SlashRequest) SlashResponse {
	name := strings.TrimPrefix(req.Text, "client ")
	if name == "" {
		return SlashResponse{ResponseType: "ephemeral", Text: "Nutzung: `/billing client <Kundenname>`"}
	}

	client := map[string]interface{}{
		"name":     name,
		"contacts": []map[string]string{{"first_name": name}},
	}

	var result INResponse[INClient]
	if err := inAPI("POST", "/api/v1/clients", client, &result); err != nil {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Fehler: %v", err)}
	}

	return SlashResponse{
		ResponseType: "in_channel",
		Text: fmt.Sprintf(
			"Kunde **%s** angelegt von @%s. [Bearbeiten](http://%s/#/clients/%s)",
			name, req.UserName, billingDomain, result.Data.ID,
		),
	}
}

func handleQuickInvoice(req SlashRequest) SlashResponse {
	// /billing invoice <client-name>
	clientName := strings.TrimPrefix(req.Text, "invoice ")
	if clientName == "" {
		return SlashResponse{ResponseType: "ephemeral", Text: "Nutzung: `/billing invoice <Kundenname>`"}
	}

	// Search for client by name
	var result INResponse[[]INClient]
	if err := inAPI("GET", fmt.Sprintf("/api/v1/clients?filter=%s&per_page=1", clientName), nil, &result); err != nil {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Fehler: %v", err)}
	}
	if len(result.Data) == 0 {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Kein Kunde mit Name `%s` gefunden.", clientName)}
	}

	today := time.Now().Format("2006-01-02")
	due := time.Now().AddDate(0, 0, 30).Format("2006-01-02")

	invoice := map[string]interface{}{
		"client_id": result.Data[0].ID,
		"date":      today,
		"due_date":  due,
		"line_items": []map[string]interface{}{
			{"product_key": "SERVICE", "notes": "Dienstleistung", "cost": 0, "quantity": 1},
		},
	}

	var invResult INResponse[INInvoice]
	if err := inAPI("POST", "/api/v1/invoices", invoice, &invResult); err != nil {
		return SlashResponse{ResponseType: "ephemeral", Text: fmt.Sprintf("Fehler: %v", err)}
	}

	return SlashResponse{
		ResponseType: "in_channel",
		Text: fmt.Sprintf(
			"Rechnung **%s** erstellt fuer **%s** von @%s (faellig: %s)\n[Bearbeiten](http://%s/#/invoices/%s/edit)",
			invResult.Data.Number, clientName, req.UserName, due, billingDomain, invResult.Data.ID,
		),
	}
}

// ── Invoice Ninja API Client ─────────────────────────────────────

func inAPI(method, path string, body interface{}, target interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("JSON encode: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, invoiceNinjaURL+path, bodyReader)
	if err != nil {
		return err
	}
	req.Header.Set("X-API-TOKEN", invoiceNinjaKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("Invoice Ninja unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Invoice Ninja API %d: %s", resp.StatusCode, string(b))
	}

	if target != nil {
		return json.NewDecoder(resp.Body).Decode(target)
	}
	return nil
}

func inListClients() ([]INClient, error) {
	var result INResponse[[]INClient]
	if err := inAPI("GET", "/api/v1/clients?per_page=5", nil, &result); err != nil {
		return nil, err
	}
	return result.Data, nil
}
