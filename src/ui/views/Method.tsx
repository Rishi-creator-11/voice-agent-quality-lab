import { useState } from 'react';
import type { AgentId } from '../../llm/types';
import { useRun } from '../app/RunContext';
import { Notice, Panel } from '../components/ui';

export default function Method() {
  const { run, status } = useRun();
  const [open, setOpen] = useState<AgentId | null>(null);
  if (status === 'loading') return <p className="muted" role="status">Loading…</p>;
  if (!run) return <Notice tone="warn" title="No recorded evaluation in this deployment" />;
  return (
    <div className="stack-lg">
      <Panel>
        <Panel.Head title="What changed from A to B" aside={<>Same model <span className="mono">{run.model}</span>, tools, backend rules and data</>} />
        <Panel.Table label="Changes between Agent A and Agent B">
          <table>
            <caption className="sr-only">Documented differences between the two agent configurations and why</caption>
            <thead><tr><th scope="col">Area</th><th scope="col">Change</th><th scope="col" className="hide-sm">Why</th></tr></thead>
            <tbody>{run.changes.map((c) => <tr key={c.area}><th scope="row">{c.area}</th><td>{c.change}</td><td className="hide-sm muted">{c.why}</td></tr>)}</tbody>
          </table>
        </Panel.Table>
      </Panel>

      <Panel>
        <Panel.Head title="Exact system prompts used in this run" />
        <Panel.Body>
          <div className="chips" role="group" aria-label="Prompt to show">
            {(['A', 'B'] as AgentId[]).map((a) => <button key={a} className="chip" aria-pressed={open === a} onClick={() => setOpen(open === a ? null : a)}>Agent {a}</button>)}
          </div>
          {open ? <pre className="prompt">{run.prompts[open]}</pre> : <p className="muted small" style={{ marginTop: 8 }}>Pick an agent to read its full prompt.</p>}
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Head title="How the evaluation works" />
        <Panel.Body>
          <ol className="stack small" style={{ margin: 0, paddingLeft: 20 }}>
            <li>Each scenario is a fixed list of caller messages (plus a final “yes” where the goal is a data change).</li>
            <li>Every trial starts from a fresh isolated database with identical synthetic data.</li>
            <li>The real model runs the conversation and calls tools; backend code validates, authorizes and executes them. Every call, token count, latency and cost is recorded.</li>
            <li>Deterministic checks decide pass or fail: final database state, tool calls and order, authorization outcomes, specific reply facts, unsupported-claim detectors.</li>
            <li>A different model judges clarity, helpfulness and completeness separately. It never sees check results and never affects pass or fail.</li>
          </ol>
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Head title="Limitations" />
        <Panel.Body>
          <ul className="stack small" style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>Sample size:</strong> {run.scenarioIds.length} scenarios × {run.trialsPerScenario} trials per agent. A few scenarios flip between trials; small differences are noise.</li>
            <li><strong>Scripted callers:</strong> fixed messages, not an adaptive simulated customer. An agent that asks an extra question can run out of script (this happened to B’s confirmation step).</li>
            <li><strong>Authorship:</strong> scenarios came from the earlier simulator suite, written by one person. After a pilot run the checks were corrected for false positives and the suite rerun; only the rerun is published.</li>
            <li><strong>Detectors:</strong> reply checks and unsupported-claim detectors use regular expressions and can miss novel phrasing.</li>
            <li><strong>Sampling:</strong> the model rejects a temperature setting, so default sampling applies.</li>
            <li><strong>Latency:</strong> wall-clock from the machine that ran the evaluation, including network. Not telephony latency.</li>
            <li><strong>Text only:</strong> there is no voice or telephone testing here, so nothing on this site speaks to speech recognition, voice quality or phone latency.</li>
          </ul>
        </Panel.Body>
      </Panel>

      <Notice title="Independent project">Not affiliated with, built on, or approved by Regal. Synthetic data only. No real calendars, patients, payments or messaging.</Notice>
    </div>
  );
}
