import { Hono } from 'hono';
import { PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth, getUser } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';
import { routeParam } from '../../http/route-param.ts';
import {
  createAsrHotword,
  deleteAsrHotword,
  getAsrHotwordById,
  listAsrHotwords,
  updateAsrHotword,
} from '../../services/asr-hotwords.ts';

const asrHotwords = new Hono();

asrHotwords.use('*', requireAuth);

asrHotwords.get(
  '/',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.ASR_HOTWORDS, 'read'),
  async (c) => {
    const search = c.req.query('search')?.trim() || undefined;
    const page = Number(c.req.query('page') ?? 1);
    const limit = Number(c.req.query('limit') ?? 50);
    const { hotwords, total } = await listAsrHotwords({ search, page, limit });
    return c.json({ hotwords, total, page, limit });
  },
);

asrHotwords.get(
  '/:id',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.ASR_HOTWORDS, 'read'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Hotword id is required' }, 400);
    const hotword = await getAsrHotwordById(id);
    if (!hotword) return c.json({ error: 'Hotword not found' }, 404);
    return c.json({ hotword });
  },
);

asrHotwords.post(
  '/',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.ASR_HOTWORDS, 'write'),
  async (c) => {
    const user = getUser(c);
    const body = await c.req.json<{
      text?: string;
      weight?: number;
      lang?: string | null;
      note?: string | null;
      channel_ids?: string[];
    }>();
    if (!body.text?.trim()) return c.json({ error: 'text is required' }, 400);
    if (body.weight === undefined || body.weight === null) {
      return c.json({ error: 'weight is required' }, 400);
    }
    try {
      const hotword = await createAsrHotword({
        text: body.text,
        weight: body.weight,
        lang: body.lang,
        note: body.note,
        channelIds: body.channel_ids ?? [],
        createdBy: user.id,
      });
      return c.json({ hotword }, 201);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : 'Failed to create hotword' },
        400,
      );
    }
  },
);

asrHotwords.patch(
  '/:id',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.ASR_HOTWORDS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Hotword id is required' }, 400);
    const body = await c.req.json<{
      text?: string;
      weight?: number;
      lang?: string | null;
      note?: string | null;
      channel_ids?: string[];
    }>();
    try {
      const hotword = await updateAsrHotword(id, {
        text: body.text,
        weight: body.weight,
        lang: body.lang,
        note: body.note,
        channelIds: body.channel_ids,
      });
      return c.json({ hotword });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update hotword';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

asrHotwords.delete(
  '/:id',
  requireResourcePermission(PLATFORM_BASIC_CATEGORY, PLATFORM_BASIC_RESOURCES.ASR_HOTWORDS, 'write'),
  async (c) => {
    const id = routeParam(c, 'id');
    if (!id) return c.json({ error: 'Hotword id is required' }, 400);
    try {
      await deleteAsrHotword(id);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete hotword';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  },
);

export default asrHotwords;
