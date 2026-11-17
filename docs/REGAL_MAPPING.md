# Mapping to the AI Product Specialist responsibilities

Based on the public posting at jobs.lever.co/regal.ai. This project is independent and does not use Regal's platform.

| Responsibility area | Where it shows up | Status |
|---|---|---|
| Design and configure an AI voice agent | `src/core/agent.ts`, `configs.ts`: a clinic agent with a knowledge base, booking, rescheduling, cancel, handoff, guardrails | Built as a simulation, not in Regal's Agent Builder |
| Custom actions / functions and integrations | `src/core/tools.ts` (6 tools with typed results and error codes); `regal-functions/check_availability.cjs` drafted to Regal's documented Functions contract | Tools tested. Regal function **never run on Regal** |
| Test conversations realistically | 33 scenarios across answers, unknowns, booking, unavailable times, interruptions, repetition, recovery, handoff, safety | Executed, results committed |
| Find and debug failures | Per-check evidence, tool traces, transcripts, unsupported-claim detectors (dashboard → Scenarios) | Working |
| Measure improvements, catch regressions | A/B run on identical scenarios; fixed / remaining / regression classification | Working; 0 regressions |
| Use Regal's platform, MCP, simulations | — | **Not done.** Needs a Regal workspace login (MCP uses OAuth via Regal's identity provider). No credentials, trial or sandbox found; none were created or bypassed |

Access findings (from developer.regal.ai): MCP endpoint is gated by Regal login; Functions run inside a workspace and are created in its editor or via Copilot; the docs describe no public sandbox or trial.
