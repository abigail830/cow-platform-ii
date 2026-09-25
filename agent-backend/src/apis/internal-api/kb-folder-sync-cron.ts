import { Hono } from 'hono';
import { runKbFolderSyncCron } from '../../kb/application/kb-folder-sync/cron.ts';

const kbFolderSyncCron = new Hono();

function cronAuthorized(authHeader: string | undefined): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = authHeader?.trim() ?? '';
  return header === `Bearer ${secret}` || header === secret;
}

kbFolderSyncCron.get('/', async (c) => {
  if (!cronAuthorized(c.req.header('Authorization'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const result = await runKbFolderSyncCron();
    return c.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cron failed';
    return c.json({ error: message }, 500);
  }
});

export default kbFolderSyncCron;
