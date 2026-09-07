import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { fixAgentAttachmentResponseHeaders } from './attachment-response-headers.ts';

test('fixAgentAttachmentResponseHeaders relaxes CSP for HTML attachments only', async () => {
  const app = new Hono();
  app.use('*', fixAgentAttachmentResponseHeaders);
  app.get('/api/agents/content-studio/instance/attachments/abc', () =>
    new Response('<html><script>1</script></html>', {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': 'sandbox',
      },
    }),
  );
  app.get('/api/agents/content-studio/instance/attachments/pdf', () =>
    new Response('%PDF', {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-security-policy': 'sandbox',
      },
    }),
  );

  const htmlRes = await app.request(
    'http://localhost/api/agents/content-studio/instance/attachments/abc',
  );
  assert.equal(htmlRes.status, 200);
  const htmlCsp = htmlRes.headers.get('content-security-policy') ?? '';
  assert.ok(htmlCsp.includes('cdn.jsdelivr.net'));
  assert.notEqual(htmlCsp, 'sandbox');

  const pdfRes = await app.request(
    'http://localhost/api/agents/content-studio/instance/attachments/pdf',
  );
  assert.equal(pdfRes.headers.get('content-security-policy'), 'sandbox');
});
