# Tasks: Local AI Code Review Workflow [T016521]

- [ ] **1. Review-Skript implementieren**
  - Anlegen von `scripts/ci/run-ai-code-review.py`.
  - Differenzierung nach geänderten Dateien (Ignorieren von Snapshots, lockfiles).
  - OpenAI-kompatibler Request gegen den lokalen Inferenz-Endpoint (`http://llm-services:18235/v1/chat/completions`).
  - Graceful degradation wenn lokaler Host nicht antwortet.

- [ ] **2. Test für Review-Skript anlegen**
  - Unit-Test `tests/py/spec/ci/test_ai_code_review.py` zur Validierung von Payload-Aufbereitung und Fallback-Verhalten.

- [ ] **3. GitHub Actions Workflow erstellen**
  - Anlegen von `.github/workflows/ai-code-review.yml`.
  - Optionaler Tailscale-Setup Step (sofern Secret vorhanden) und Aufruf des Skripts.
  - Job auf advisory/non-blocking konfigurieren.

- [ ] **4. Verifikation & Freshness-Gates**
  - Tests ausführen, Freshness regenerieren und committen.
