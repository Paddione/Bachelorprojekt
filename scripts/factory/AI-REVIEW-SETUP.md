# AI Code Review — one-time setup

The `ai-review.yml` workflow needs two repository secrets (Settings → Secrets and
variables → Actions → New repository secret):

| Secret | Value |
|--------|-------|
| `OPENCODE_API_KEY`  | OpenCode Zen API key / token (defaults to `laguna-s-2.1-free`, free tier Poolside coding model, 256k ctx) |
| `GEMINI_API_KEY`    | Google Gemini API key (fallback / optional) |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/anthropic` (fallback) |
| `DEEPSEEK_API_KEY`  | the `ANTHROPIC_AUTH_TOKEN` value from `environments/.secrets/deepseek.sh` (fallback) |

Notes:
- The job is **advisory** — it is intentionally NOT a required status check. A model/network
  failure makes the job red but does not block merge.
- If the secrets are absent, `ci-review.mjs` skips cleanly (exit 0) with a warning.
- Model id defaults to `laguna-s-2.1-free` via OpenCode Zen (`https://opencode.ai/zen/v1`) when `OPENCODE_API_KEY` is set; override with the `CI_REVIEW_MODEL` env/repository variable.
