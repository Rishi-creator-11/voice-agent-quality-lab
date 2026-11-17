# Mapping to the AI Product Specialist responsibilities

This project is independent. It does not use Regal's platform, and nothing here has been tested against Regal. Regal facts below come from Regal's public documentation (developer.regal.ai, support.regal.ai).

## What Regal documents (relevant parts)
- **AI Agents / Agent Builder:** agents are built from a template with a prompt (call flow, FAQs, objection handling), optional knowledge base, function calling (for example transfers), and versioned saves with restore.
- **Test calls:** voice test calls in the UI and chat for SMS agents; transfers can only be verified on real phone calls. The guide suggests aiming for roughly 95% accuracy before launch.
- **Simulation testing:** test cases (name, contact prompt, success criteria) run against the agent with an LLM playing the customer and an auto-evaluation of outcomes. Documented as unable to test voice quality, interruption handling, transfers or telephony latency.
- **Functions:** JavaScript `exports.handler(event, context)` hosted by Regal, inputs in `event.params`, curated packages, secrets via the Brand Secrets page, errors returned as output fields.
- **Regal MCP:** OAuth with a Regal login, tools for agents, knowledge base, test cases and simulations, transcripts, contacts and more; scoped to the authenticated brand.

## How this project lines up

| Responsibility | Where it shows up | Honest status |
|---|---|---|
| Configure an AI agent | Agent A and B prompts, tool set, state handling (`server/prompts.ts`, `server/agent.ts`) | Built with the Anthropic API, not in Regal's Agent Builder |
| Design tools / custom actions | 7 tools with strict input schemas, authorization, idempotency, DB constraints (`server/tools.ts`); a Functions-format `check_availability` draft in `regal-functions/` | Tools tested against the real model. The Regal function was only run in a local shim, **never on Regal** |
| Handle business workflows | Booking, rescheduling, cancelling with fee policy, escalation, emergency protocol | Working |
| Test edge cases | 36 scenarios: unknowns, taken/closed/past slots, corrections, interruptions, wrong-owner changes, privacy, emergencies, compound requests | Run on real agents, 3 trials each |
| Debug failed conversations | Scenario explorer: expected vs actual, failed checks with details, full transcript with tool calls and results, final database changes | Working |
| Improve reliability | A→B changes with rationale; before/after comparison; per-trial consistency | Working. The measured gap is small and mostly one scenario (emergency transfer); see README |
| Evaluate changes | Deterministic checks on DB/tool state kept separate from a judge model's quality scores; cost and latency recorded | Working |
| Explain results to stakeholders | Overview and A vs B views with metric definitions, limitations tab | Working |

## Differences from Regal's approach (and next steps)
- Regal simulations use an LLM-played customer; this project uses fixed scripted messages. An adaptive simulated caller is the most valuable next step (it would also remove the "ran out of script" artifact).
- Regal evaluates against per-case success criteria; this project checks the database and tool trace, which is stricter for transactional outcomes but needs per-scenario code.
- Voice: this project's browser voice path is unverified, and like Regal's simulations, text evaluation cannot speak for voice quality, interruption or telephony latency.

## Not done
No Regal workspace, MCP, Functions or simulation was used. No credentials or trial were available and none were created. If access is granted later, the natural integration is running these scenarios as Regal simulation test cases and comparing the results.
