import { Fragment } from 'react';
import type { TraceTool, TraceTurn } from '../../llm/types';
import { ms, usd } from './format';

export function ToolLine({ call }: { call: Pick<TraceTool, 'name' | 'input' | 'result'> }) {
  return (
    <div className={call.result.ok ? 'tool' : 'tool bad'}>
      <span className="tn">{call.name}</span>({JSON.stringify(call.input)}) → {call.result.ok ? 'ok' : 'error'} {JSON.stringify(call.result)}
    </div>
  );
}

/** Recorded conversation with tool calls and per-turn usage. */
export function Transcript({ turns }: { turns: TraceTurn[] }) {
  return (
    <div className="chat" role="log" aria-label="Recorded conversation" tabIndex={0}>
      {turns.map((t, i) => (
        <Fragment key={i}>
          <div className="msg user"><span className="sr-only">Caller: </span>{t.user}</div>
          <div className={t.error ? 'msg error' : 'msg agent'}>
            <span className="sr-only">Agent: </span>
            {t.error ? `Model error: ${t.error}` : t.reply || '(no reply)'}
            {t.toolCalls.map((c, j) => <ToolLine key={j} call={c} />)}
            <div className="meta">{t.llmCalls} model call{t.llmCalls === 1 ? '' : 's'} · {t.inputTokens}+{t.outputTokens} tokens · {ms(t.totalMs)} · {usd(t.costUsd)}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
