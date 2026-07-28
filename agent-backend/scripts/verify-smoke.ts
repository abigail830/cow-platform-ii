import 'dotenv/config';
import { createFlueClient } from '@flue/sdk';
import { getPool, closePool } from '../src/db/pool.ts';
import { toAgentInstanceId } from '../src/shared/agent-instance-id.ts';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8787';
const EMAIL = process.env.SMOKE_EMAIL ?? 'user@example.com';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'user123';
const STREAM_TIMEOUT_MS = Number(process.env.SMOKE_STREAM_TIMEOUT_MS ?? 90_000);

type StepResult = { name: string; ok: boolean; detail?: string };

const results: StepResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ''}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}: ${detail}`);
}

function textFromMessages(
  messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>,
): string {
  return messages
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => m.parts)
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!)
    .join('\n')
    .trim();
}

async function waitForAssistantText(
  client: ReturnType<typeof createFlueClient>,
  agentName: string,
  instanceId: string,
  offset: string,
): Promise<string> {
  const deadline = Date.now() + STREAM_TIMEOUT_MS;
  let last = '';

  const observation = client.agents.observe(agentName, instanceId, { live: 'sse' });

  return await new Promise<string>((resolve, reject) => {
    const done = () => {
      unsub();
      observation.close();
    };

    const sync = () => {
      const snap = observation.getSnapshot();
      const messages = snap.conversation?.messages ?? [];
      const text = textFromMessages(messages);
      if (text) last = text;

      const phase = snap.phase;
      if (phase === 'error' && snap.error) {
        done();
        reject(snap.error);
        return;
      }

      if (phase === 'live' && last && !messages.some((m) =>
        m.parts.some(
          (p) =>
            (p.type === 'text' || p.type === 'reasoning') &&
            'state' in p &&
            p.state === 'streaming',
        ),
      )) {
        done();
        resolve(last);
        return;
      }

      if (Date.now() > deadline) {
        done();
        if (last) resolve(last);
        else reject(new Error('observe timeout'));
      }
    };

    observation.refresh();
    const unsub = observation.subscribe(sync);
    sync();
  });
}

async function main() {
  console.log(`Smoke test → ${BASE}\n`);

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    fail('health', `HTTP ${health.status}`);
    return summarize();
  }
  pass('health');

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginBody = await loginRes.json();
  if (!loginRes.ok) {
    fail('login', JSON.stringify(loginBody));
    return summarize();
  }
  const token = loginBody.token as string;
  const userId = loginBody.user.id as string;
  pass('login', EMAIL);

  const auth = { Authorization: `Bearer ${token}` };

  const convRes = await fetch(`${BASE}/api/conversations`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentName: 'smart-proposal', title: 'Smoke test' }),
  });
  const convBody = await convRes.json();
  if (!convRes.ok) {
    fail('create_conversation', JSON.stringify(convBody));
    return summarize();
  }
  const convId = convBody.conversation.id as string;
  const instanceId = toAgentInstanceId(userId, convId);
  pass('create_conversation', `${convId} → ${instanceId}`);

  const pool = getPool();
  const appRow = await pool.query('SELECT id, agent_name FROM app_conversations WHERE id = $1', [
    convId,
  ]);
  if (appRow.rowCount !== 1) fail('app_conversations_persist', 'row not found');
  else pass('app_conversations_persist', appRow.rows[0].agent_name);

  const client = createFlueClient({ baseUrl: `${BASE}/api`, token });

  await client.agents.send('smart-proposal', instanceId, {
    message: 'Reply with exactly: smoke-ok',
  });

  let streamText = '';
  try {
    streamText = await waitForAssistantText(client, 'smart-proposal', instanceId, '');
  } catch (e) {
    fail('streaming_turn_1', e instanceof Error ? e.message : String(e));
    return summarize();
  }
  if (!streamText) fail('streaming_turn_1', 'empty stream');
  else pass('streaming_turn_1', streamText.slice(0, 80));

  const history = await client.agents.history('smart-proposal', instanceId);
  if (!history.messages.length) fail('history_api', 'empty');
  else pass('history_api', `${history.messages.length} messages`);

  await client.agents.send('smart-proposal', instanceId, {
    message: 'What was your previous one-word reply? Answer with that word only.',
  });

  let turn2 = '';
  try {
    turn2 = await waitForAssistantText(client, 'smart-proposal', instanceId, '');
  } catch (e) {
    fail('multi_turn_stream', e instanceof Error ? e.message : String(e));
    return summarize();
  }
  if (!turn2) fail('multi_turn_stream', 'empty second reply');
  else pass('multi_turn_stream', turn2.slice(0, 80));

  const submissions = await pool.query(
    'SELECT COUNT(*)::int AS n FROM flue_agent_submissions',
  );
  pass('flue_submissions', `${submissions.rows[0]?.n ?? 0} rows`);

  await summarize();
}

async function summarize() {
  await closePool();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
