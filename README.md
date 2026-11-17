# Voice Agent Quality Lab

A QA harness for appointment-booking voice agents: 33 scripted scenarios, deterministic checks, tool-call tracing, and a before/after comparison of two agent configurations. Dental-clinic domain, fictional, synthetic data only.

**Independent project. Not affiliated with, built on, or approved by Regal.** Built as a work sample for an AI Product Specialist role; see [docs/REGAL_MAPPING.md](docs/REGAL_MAPPING.md).

## What is real and what is simulated

| | Status |
|---|---|
| Scenario suite, checks, metrics, A/B diff, dashboard | Real. Every number is computed from executed runs (`results/results.json`). |
| The "agent" | **Simulated.** Deterministic rule-based program, no LLM, no speech, no phone call. Configs A/B toggle behaviors (e.g. validates phone, checks availability). |
| Backend tools (availability, book, reschedule, cancel, validate phone, transfer) | Real code against an in-memory synthetic calendar. |
| LLM judge (`src/eval/judge.ts`) | Implemented and unit-tested with mocked HTTP. **Never run against the live API**; no judge scores exist. |
| Regal integration | **None.** Regal's MCP/Functions require a Regal workspace login; none was available. `regal-functions/` holds one function drafted to the documented Functions contract, run only in a local shim. |

## Results (from `npm run eval`, full output in [results/RESULTS.md](results/RESULTS.md))

| Metric | A initial | B improved |
|---|---|---|
| Scenarios passed | 10/33 | 31/33 |
| Goal reached (completion) | 12/33 | 31/33 |
| Tool-use checks passed | 7/12 | 12/12 |
| Unsupported-claim incidents | 8 (6 scenarios) | 0 |
| Regressions A→B | | 0 |

Still failing in B (known limits): `compound-request` (price question + booking in one sentence; only the first is handled) and `spoken-date` ("the twentieth").
Latency is measured in-process agent logic only (~0.02–0.05 ms mean); it excludes speech, LLM and network and says nothing about real voice latency.

**Process note:** the first full run gave B 28/33. The suite exposed two bugs in the shared agent code (booking intent missed for "I'd like an exam Sunday…", and a prompt example `BK-1234` that tripped the invented-ID detector). Both were fixed, then the suite re-run; reported numbers are post-fix. Scenarios were written by one author, so results describe these 33 cases, not general quality.

## How it works

```
src/core      agent.ts (router + flows), configs.ts (A/B + change notes), tools.ts (sandbox backend), datetime.ts, clinic.ts (knowledge base + seed data)
src/eval      scenarios.ts, checks.ts (deterministic check helpers), detectors.ts (unsupported-claim detectors), runner.ts (run, metrics, compare), judge.ts (optional, separate)
src/cli       run.ts -> results/, judge.ts -> public/judge.json
src/ui        React dashboard; runs the same suite in the browser
tests         vitest: parsing, tools, metrics integrity, detectors, committed-results freshness, judge (mocked), Regal function shim
```

- Each scenario records **expected** behavior (written before running), **actual** behavior (tool trace + final reply + state changes), per-check results, and the full transcript.
- Check kinds: `outcome` (goal reached → completion rate), `tool` (right tool/order), `accuracy` (no unsupported claims, policy, no state damage).
- `book_appointment` is deliberately a thin write like a calendar insert; validation is the agent's job, so double-booking is detectable in the final state.
- Sandbox clock is fixed (Mon 2026-11-16 09:00) so results are reproducible.

## Run it

```bash
npm install
npm test          # 23 tests
npm run eval      # writes results/results.json and results/RESULTS.md
npm run dev       # dashboard
npm run build     # static site in dist/
ANTHROPIC_API_KEY=... npm run judge   # optional LLM judge; key stays on your machine
```

Deploy: static site, no server, no secrets. `dist/` is published to GitHub Pages (`gh-pages` branch).

## Swapping in a real agent

The harness needs only `respond(text) -> { reply, toolCalls }` plus a sandbox backend. An LLM- or platform-backed agent can replace `Agent` in `runner.ts`; scenarios, checks and metrics are unchanged. Not done here.

## Limitations

- Simulated agents; failures in A are encoded by config, so the A→B delta demonstrates the harness detecting known weaknesses, not an LLM improving.
- Regex-based detectors can miss novel phrasing; unsupported-claim counts are lower bounds.
- Not production-ready: demo scope, synthetic data, no auth, no real telephony.
