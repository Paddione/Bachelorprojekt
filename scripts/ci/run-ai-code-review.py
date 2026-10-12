#!/usr/bin/env python3
"""
scripts/ci/run-ai-code-review.py [T016521]
Fuehrt automatisierte Code-Reviews gegen den lokalen LLM-Proxy (llm-services / vLLM) aus.
Funktioniert auch lokal oder in GitHub Actions ueber das devmesh-Tailnet.
"""

import os
import sys
import json
import urllib.request
import urllib.error
import subprocess

IGNORE_PATTERNS = [
    ".snapshot.json",
    "-inventory.json",
    ".lock",
    "pnpm-lock.yaml",
    "package-lock.json",
    ".generated.",
    "dist/",
    ".worktrees/",
]

def get_git_diff(base_ref: str = "origin/main") -> str:
    """Holt das Git-Diff im Vergleich zu base_ref, schliesst generierte/Lock-Dateien aus."""
    try:
        # Geaenderte Dateien ermitteln
        cmd = ["git", "diff", "--name-only", f"{base_ref}...HEAD"]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        files = res.stdout.strip().splitlines()

        filtered_files = [
            f for f in files
            if not any(pattern in f for pattern in IGNORE_PATTERNS)
        ]

        if not filtered_files:
            return ""

        diff_cmd = ["git", "diff", f"{base_ref}...HEAD", "--"] + filtered_files
        diff_res = subprocess.run(diff_cmd, capture_output=True, text=True, check=True)
        return diff_res.stdout
    except Exception as e:
        print(f"[review] Fehler beim Lesen des Diffs: {e}", file=sys.stderr)
        return ""

def call_llm_api(endpoint: str, token: str, diff_text: str, model: str = "default") -> str:
    """Sendet den Review-Request an den OpenAI-kompatiblen Inferenz-Endpoint."""
    prompt = (
        "Du bist ein praeziser Code-Reviewer fuer das Bachelorprojekt (GitOps, TypeScript/Svelte, Python, K8s).\n"
        "Analysiere das folgende PR-Diff knapp und strukturiert:\n"
        "1. Zusammenfassung der Aenderungen (1-2 Saetze)\n"
        "2. Potenzielle Bugs, Race Conditions oder Sicherheitsrisiken (falls vorhanden)\n"
        "3. Konventionen & Architektur-Hinweise (falls vorhanden)\n"
        "Wenn alles sauber und fehlerfrei ist, gib ein kurzes 'LGTM: Keine Auffaelligkeiten' aus.\n\n"
        f"Diff:\n```diff\n{diff_text[:12000]}\n```"
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Du bist ein erfahrener Software-Architekt und Security-Reviewer."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 800
    }

    url = f"{endpoint.rstrip('/')}/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except urllib.error.URLError as e:
        print(f"[review] LLM Endpoint nicht erreichbar ({url}): {e}", file=sys.stderr)
        return ""
    except Exception as e:
        print(f"[review] Unerwarteter Fehler bei LLM-Anfrage: {e}", file=sys.stderr)
        return ""

def main():
    base_ref = os.environ.get("BASE_REF", "origin/main")
    endpoint = os.environ.get("LLM_ENDPOINT", "http://llm-services:18235")
    token = os.environ.get("LLM_TOKEN", "dev-llm-proxy-admin-token-12345")
    output_file = os.environ.get("REVIEW_OUTPUT_FILE", "")

    diff = get_git_diff(base_ref)
    if not diff:
        print("[review] Keine relevanten Code-Aenderungen fuer Review gefunden.")
        review_text = "### 🤖 AI Code Review\nKeine relevanten Code-Aenderungen im Scope gefunden."
    else:
        print(f"[review] Sende Diff ({len(diff)} Bytes) an {endpoint}...")
        review_text = call_llm_api(endpoint, token, diff)
        if not review_text:
            print("[review] Warnung: Lokaler LLM-Endpoint antwortete nicht oder offline. Graceful Fallback.")
            review_text = "### 🤖 AI Code Review (Advisory)\n_Hinweis: Lokaler Inferenz-Service (llm-services) war waehrend dieses Laufs offline. Review uebersprungen._"
        else:
            review_text = f"### 🤖 AI Code Review (Local Inferenz)\n\n{review_text}"

    print("\n--- Review Ergebnis ---")
    print(review_text)

    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(review_text)
        print(f"[review] Gespeichert in {output_file}")

if __name__ == "__main__":
    main()
