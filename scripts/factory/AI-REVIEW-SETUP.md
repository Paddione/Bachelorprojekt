# AI Code Review — one-time setup

The `ai-review.yml` workflow needs two repository secrets (Settings → Secrets and
variables → Actions → New repository secret):

| Secret | Value |
|--------|-------|
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/anthropic` (or the `ANTHROPIC_BASE_URL` from `environments/.secrets/deepseek.sh`) |
| `DEEPSEEK_API_KEY`  | the `ANTHROPIC_AUTH_TOKEN` value from `environments/.secrets/deepseek.sh` |

Notes:
- The job is **advisory** — it is intentionally NOT a required status check. A model/network
  failure makes the job red but does not block merge.
- If the secrets are absent, `ci-review.mjs` skips cleanly (exit 0) with a warning.
- Model id is `deepseek-chat` by default; override with the `CI_REVIEW_MODEL` env in the workflow.
