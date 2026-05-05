# Quick Attack Panel — Design Spec

**Date:** 2026-05-05
**Feature:** Custom-target attack panel for the local pentest dashboard
**Status:** Approved

---

## Problem

The existing pentest dashboard only attacks hardcoded targets (mentolder.de and korczewski.de). The user needs to point standard recon/vuln tools at any arbitrary domain or IP without leaving the dashboard or hand-crafting commands in the Custom tab.

---

## Scope

Single new sidebar section **"Quick Attack"** added to `pentest-dashboard/static/index.html`. No backend changes — all probe commands are built client-side and submitted to the existing `POST /api/scan/run` endpoint as `custom_command`.

---

## Design

### Navigation

New nav item added between "Custom" and "Report":

```
{ id: 'quickattack', icon: '🎯', label: 'Quick Attack' }
```

### Layout

```
┌─ Target Inputs ─────────────────────────────────┐
│  Domain / Hostname  │  IPv4 / IPv6               │
│  [sub.example.com ] │  [1.2.3.4              ]   │
│                                                   │
│  Derived URL: https://sub.example.com  (muted)   │
└───────────────────────────────────────────────────┘

┌─ Probe Grid (3 columns) ─────────────────────────┐
│  Ping + HTTP  │  Nmap Top-100  │  Nmap Full       │
│  HTTP Headers │  SSL/TLS       │  WhatWeb         │
│  Nikto        │  Nuclei        │  Dir Brute       │
└───────────────────────────────────────────────────┘

┌─ Terminal (shared) ──────────────────────────────┐
│  [Kill] [Clear] [→ Finding]                       │
│  live output…                                     │
└───────────────────────────────────────────────────┘
```

### Target Inputs

| Field | Validation | Used by |
|-------|-----------|---------|
| `Domain / Hostname` | non-empty alphanumeric+dots+hyphens | HTTP tools, sslscan, theHarvester |
| `IPv4 / IPv6` | basic IP regex | nmap, direct port tools |

- At least one field must be filled before run buttons are enabled.
- Derived URL: `https://<domain>` if domain is set, else `http://<ip>`.
- If only IP is provided, HTTP tools use `http://<ip>`.
- If only domain is provided, nmap targets the domain directly.

### Probe Cards

| # | Card Name | Tool | Enabled when | Command sketch |
|---|-----------|------|--------------|----------------|
| 1 | Ping + HTTP | ping / curl | host (domain or IP) | `ping -c 4 <host> && curl -sI --max-time 8 <url>` |
| 2 | Nmap Top-100 | nmap | host | `nmap -sV --open -T4 --top-ports 100 <host>` |
| 3 | Nmap Full | nmap | host | `nmap -sV -sC --open -p- -T4 <host>` |
| 4 | HTTP Headers | curl | url | `curl -sI --max-time 8 <url>` + grep for security headers |
| 5 | SSL/TLS | sslscan | host | `sslscan --no-colour <host>` |
| 6 | WhatWeb | whatweb | url | `whatweb -a 3 --color=never <url>` |
| 7 | Nikto | nikto | url | `nikto -h <url> -maxtime 120 -no404 2>&1` |
| 8 | Nuclei | nuclei | url | `nuclei -target <url> -severity medium,high,critical -no-color 2>&1` |
| 9 | Dir Brute | gobuster | url | `gobuster dir -u <url> -w /usr/share/wordlists/dirb/common.txt -t 20 -k --no-error -q 2>&1` |

Each card shows: name, one-line description, tool badge, and a `▶ Run` button.

### Terminal

Reuses the existing `terminalOutput`, `scanning`, `currentRunId`, `eventSource` state and the `_startScan()` / `killScan()` / `saveOutputAsFinding()` methods. The terminal `x-ref` is `terminalQuick`.

### Timeline logging

Submitted with `scan_id: 'custom'` so it appears in the Timeline tab under the `custom` category badge.

---

## What is NOT in scope

- Saving custom targets persistently across sessions
- Re-targeting the existing predefined scan templates
- Adding new backend API endpoints

---

## Implementation files

| File | Change |
|------|--------|
| `pentest-dashboard/static/index.html` | Add nav item, Quick Attack section HTML, JS state + methods |

