# Voice Agent Quality Lab

An evaluation platform for LLM appointment-booking agents. Two real LLM agents (A: basic instructions, B: improved instructions, same model/tools/data) talk to callers, call real backend tools against an isolated SQLite clinic database, and are scored by deterministic checks on the database and tool trace. Fictional dental clinic, synthetic data only.

**Independent project. Not affiliated with, built on, or approved by Regal.** Built as a work sample for an AI Product Specialist role: [docs/REGAL_MAPPING.md](docs/REGAL_MAPPING.md).

## Status at a glance

| Piece | Status |
|---|---|
| Two LLM agents (`claude-haiku-5-5`), real tool use | Working, run against the live API |
| 7 backend tools on SQLite (validation, authorization, transactions, idempotency) | Working, 10 unit tests |
| Real evaluation: 36 scenarios × 2 agents × 3 trials = 216 conversations, plus a separate LLM judge | Run; traces in [`public/llm-results.json`](public/llm-results.json) |
| Dashboard (overview, A vs B, scenario explorer with transcripts, live agent, runner) | Working; results tabs deployed on GitHub Pages |
| Live chat + eval runner through the API | Verified locally end to end (book, then reschedule, with DB changes). **Backend not deployed yet**: needs a Render account action, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Browser voice (mic → speech recognition → LLM → speech synthesis) | Implemented, **not verified with a real microphone**. See [docs/VOICE.md](docs/VOICE.md) |
| Regal integration | **None** (no Regal workspace access; independent project) |
| Historical rule-based simulator (v1) | Preserved under "Historical simulator"; not LLM results |

## Results (real, from `public/llm-results.json`)

Model `claude-haiku-5-5`, 3 trials per scenario per agent, fresh database per conversation.

| Metric | Agent A (initial) | Agent B (improved) |
|---|---|---|
| Pass rate (all checks) | 105/108 · 97.2% | 107/108 · 99.1% |
| Task completion (DB/tool state) | 97.2% | 99.1% |
| Tool-call success | 102/107 · 95.3% | 112/115 · 97.4% |
| Unsupported claims | 0 | 0 |
| Safety violations | 0 | 0 |
| API errors | 0 | 0 |
| Latency per turn, mean / p95 | 1.6 s / 3.3 s | 1.5 s / 2.8 s |
| Tokens in / out | 603k / 32k | 868k / 30k |
| Agent cost (list price) | $0.077 | $0.102 |
| Judge (separate; 36 transcripts each): clarity / helpfulness / completeness | 4.39 / 4.25 / 3.64 | 4.83 / 4.50 / 4.08 |

**What the comparison actually shows**
- Both agents do well on this suite. The one clear difference is **emergencies**: A told the caller to call 911 but never transferred to the front desk (0/3); B did both every time (3/3). That is the only scenario with a consistent gap.
- B failed `cancel-happy` once in three: after the caller's "yes", it asked for confirmation again and the fixed script ended before the cancel ran. This is a genuine cost of B's confirm-before-change rule (and of fixed scripts), not noise to hide.
- B uses ~44% more input tokens (longer prompt plus a per-turn state note), so it costs ~33% more.
- The overall gap (2 conversations out of 108) is **within run-to-run noise**. A pilot run of the same suite with earlier, stricter checks gave A 99/108 and B 105/108; most of that difference disappeared once detector false positives were fixed. Do not read this as proof that B is broadly more reliable.
- Judge scores favor B on all three dimensions, but it is one judge model (`claude-sonnet-5-5`), 1–5 scale, 36 transcripts per agent. Opinions, never used for pass/fail.

## Architecture

```
GitHub Pages (static React dashboard)  ──HTTPS──▶  Node API on Render (Express)
   results: llm-results.json (bundled)               ├─ /api/chat            LLM agent loop (A or B)
   live agent, runner → API                          ├─ /api/admin/*         eval runner, kill switch (token)
                                                     ├─ tools → isolated SQLite DB per conversation
                                                     └─ Anthropic Messages API (key in server env only)
```

```
server/db.ts         schema + seed; partial UNIQUE index = one active booking per slot
server/tools.ts      7 tools, zod validation, auth (code + last name), transactions, idempotency
server/agent.ts      tool-use loop, usage/cost tracking, per-turn state note (B only)
server/prompts.ts    Agent A / B system prompts and the documented change list
server/llm.ts        Anthropic client: timeout, retry/backoff, no key logging
server/app.ts        API: rate limits, session/daily budgets, kill switch, admin auth, logging
server/eval/         scenarios (DB-based checks), runner (trials, budget guard), judge, store, CLI
src/llm/             run types + metrics shared by server and dashboard (same code computes both)
src/ui/              dashboard, live agent, voice hook, runner
src/core, src/eval   v1 rule-based simulator (historical)
```

**The AI chooses tools; backend code executes them.** `create_booking`, `lookup_booking`, `reschedule_booking`, `cancel_booking`, `check_availability`, `validate_customer`, `transfer_to_human`. Inputs are validated with strict schemas (unknown fields rejected); changing or reading a booking needs the confirmation code **and** last name, and a wrong code and a wrong name return the identical error; slot conflicts are prevented in the database, not just in prompts; `create_booking` is idempotent by `request_id` and by identical details. Both agents get the same tools, same descriptions, same enforcement.

**Agent A vs B** (details and rationale in the dashboard's "Agents & method" tab and `server/prompts.ts`): A has a short, reasonable prompt plus the clinic facts. B adds explicit rules for grounding, emergencies, medical advice, privacy, validation, availability checks, read-back-and-confirm, date handling, compound requests, recovery and escalation, and receives a system-maintained session note each turn. Nothing in A was degraded on purpose, and neither prompt was changed after seeing results.

## How evaluation works
1. Each scenario is a fixed list of caller messages (same inputs as the 36 v1 scenarios, plus a trailing "Yes, please go ahead." where the goal is a data change).
2. For every trial a **fresh in-memory database** is created from identical seed data.
3. The real agent runs the conversation; every tool call and result, token count, latency and cost is recorded.
4. **Deterministic checks** decide pass/fail: final database state (booking exists/unchanged/cancelled), tool calls and order, authorization outcomes, reply-text facts (price, 911, fee), unsupported-claim detectors. Check kinds: outcome, tool, accuracy, safety.
5. A **separate LLM judge** (different model) scores clarity, helpfulness, completeness on the first trial. It never sees check results and never affects pass/fail.
6. A trial's failure category is its most severe failed check kind: safety > outcome > tool use > accuracy; API failures are recorded separately.

## Limitations
- **Small sample** (36 scenarios, 3 trials). Treat differences of a few trials as noise.
- **Scripted callers.** Fixed messages, not an adaptive simulated customer (Regal's own simulations use an LLM-played customer). An agent that asks an extra question can run out of script, which is what happened to B's `cancel-happy` trial.
- **Scenarios came from the v1 simulator suite**, authored by one person. Checks were corrected after a pilot run: a format example (`BK-1234`) read as an invented id, a negated sentence ("nothing has been cancelled") read as a claim, a refusal that named a drug read as medical advice, and one over-strict price check. A tool-description example was also removed. The suite was then rerun in full; only the rerun is published.
- **Regex detectors and reply checks** can miss novel phrasing; claim counts are lower bounds.
- **Sampling:** this model rejects a `temperature` setting, so default sampling applies.
- **Latency** is wall-clock from the machine that ran the evaluation, including network and tool calls. Not telephony latency.
- **Voice** is untested end to end; see docs/VOICE.md. No phone numbers or telephony.
- **Server limits are per process** (in-memory). Free-tier hosting sleeps when idle and loses server-side run history on restart; the bundled results file is the durable copy.
- **Not production-ready:** demo scope, synthetic data, no user accounts, no real calendar or messaging.

## Run it
```bash
npm install
cp .env.example .env            # add ANTHROPIC_API_KEY and ADMIN_TOKEN; .env is git-ignored
npm test                        # 60 tests (tools, API/abuse controls, detectors, results integrity, v1 simulator)
npm run server                  # API on :8787
VITE_API_URL=http://localhost:8787 npm run dev   # dashboard on :5173 (live agent + runner enabled)
npm run eval:llm -- --trials 3 --judge --budget 2   # real evaluation; writes data/runs/ and public/llm-results.json
npm run eval                    # v1 rule-based simulator
npm run build                   # static site in dist/
```
Publishing the frontend: build, then push `dist/` to the `gh-pages` branch. Backend deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Security notes
- The model key exists only in server environment variables / a git-ignored `.env`; the browser never receives it, and tests assert upstream errors and logs do not leak it.
- Public chat is bounded by per-IP rate limits, per-session turn and cost caps, a daily budget with worst-case reservation, a concurrency cap, one in-flight turn per session, a kill switch, and a CORS allowlist. Evaluation runs and the kill switch need an admin token. Details: docs/DEPLOYMENT.md.
- Request logs hold method, path, status, duration and a hashed IP only.
