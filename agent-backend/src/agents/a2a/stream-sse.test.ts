import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StreamResponse } from '@a2a-js/sdk';
import { sseResponseFromStream } from './stream-sse.ts';

describe('sseResponseFromStream', () => {
  it('returns text/event-stream with encoded stream events', async () => {
    const event = StreamResponse.fromJSON({
      statusUpdate: {
        taskId: 't1',
        contextId: 'c1',
        status: { state: 'TASK_STATE_WORKING', timestamp: '2026-01-01T00:00:00Z' },
      },
    });

    async function* stream() {
      yield event;
    }

    const response = await sseResponseFromStream(stream());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/event-stream');
    const body = await response.text();
    assert.match(body, /TASK_STATE_WORKING/);
  });
});
