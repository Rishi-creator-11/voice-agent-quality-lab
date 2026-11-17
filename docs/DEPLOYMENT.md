# Deployment

Frontend: static site on GitHub Pages (built from `dist/`, `gh-pages` branch). It holds no secrets.
Backend: Node API (`server/`) that holds the model key and the databases. Intended host: Render (`render.yaml`).

## Status
- Frontend: deployed. Recorded evaluation results are bundled as `llm-results.json`.
- **Backend: not deployed.** Deploying needs a Render account action this environment does not have. Until it exists, the Live agent and Run evaluation tabs say "needs a backend" instead of showing anything fake.

## Steps to deploy the backend (about 5 minutes)
The scripts below were tested locally against a production-mode server; they have not yet been run against Render.
1. Create a **new** Anthropic API key for this app (do not reuse any key that has been pasted into chat or a terminal) and set a spend limit on it.
2. In Render: New → Blueprint → select this repo (`render.yaml`). Set secrets:
   - `ANTHROPIC_API_KEY`: the new key
   - `ADMIN_TOKEN`: a long random string, e.g. `openssl rand -hex 32`
3. Note the service URL, e.g. `https://voice-agent-quality-lab-api.onrender.com`. Check `/api/health` shows `llmConfigured: true`.
4. Rebuild the frontend with the URL and publish: `VITE_API_URL=<service url> npm run build`, then push `dist/` to `gh-pages` (see README).
5. Verify the API: `node scripts/verify-deploy.mjs <service url> --chat` (the `--chat` flag sends one message, about $0.001). Publish the frontend with `scripts/publish-pages.sh <service url>` instead of building by hand.
6. Verify from a clean browser: Live agent tab converses and shows tool calls; `/api/admin/*` returns 401 without the token.

Free Render instances sleep when idle (first request can take about a minute) and have no persistent disk: recorded runs on the server are lost on restart. The bundled `llm-results.json` is the durable copy.

## Abuse and cost controls (all server-side, all tested in `tests/api.test.ts`)
| Control | Default | Env |
|---|---|---|
| Key lives only in server env; never sent to the browser | n/a | `ANTHROPIC_API_KEY` |
| Per-IP rate limit | 40 chat requests / 10 min | `IP_CHAT_PER_WINDOW` |
| Message length | 500 chars | `MAX_MESSAGE_CHARS` |
| Per-session turn cap / cost cap | 15 turns / $0.05 | `MAX_TURNS_PER_SESSION`, `SESSION_COST_CAP_USD` |
| One in-flight turn per session; concurrent chat cap | 8 | `MAX_CONCURRENT_CHATS` |
| Daily budget with worst-case reservation | $2 | `DAILY_BUDGET_USD`, `TURN_RESERVE_USD` |
| Kill switch | on | `PUBLIC_CHAT_ENABLED=false` or `POST /api/admin/chat` |
| Evaluation runs need the admin token; per-run budget | $3 | `ADMIN_TOKEN`, `EVAL_BUDGET_USD` |
| CORS allowlist | GitHub Pages origin | `CORS_ORIGINS` |
| Request log: method, path, status, duration, hashed IP only | n/a | n/a |
| Upstream error details never reach the browser | n/a | n/a |
| Each conversation gets an isolated in-memory database with synthetic data | n/a | n/a |

Limits are in-memory, per process: with several instances they apply per instance.
