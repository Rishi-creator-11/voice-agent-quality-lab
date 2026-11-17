import { readFileSync } from 'node:fs';
import { createApp } from './app';
import { loadConfig } from './config';
import { anthropicClient } from './llm';

// Local dev convenience: load .env if present. On Render, variables come from the dashboard.
try { for (const l of readFileSync('.env', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch { /* no .env */ }
const config = loadConfig();
const key = process.env.ANTHROPIC_API_KEY;
const app = createApp({ config, client: anthropicClient(key), llmConfigured: !!key });
app.listen(config.port, () => console.log(`API listening on :${config.port} | llm=${key ? 'configured' : 'NOT configured'} | publicChat=${config.publicChatEnabled} | admin=${config.adminToken ? 'set' : 'unset'}`));
