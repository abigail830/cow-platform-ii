import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { appPermissions, db, PERMISSION_CATEGORIES } from '../../db/index.ts';
import { ADMIN_RESOURCES } from '../../auth/rbac-catalog.ts';
import { requireAuth } from '../../auth/jwt.ts';
import { requireResourcePermission } from '../../auth/require-permission.ts';

const permissions = new Hono();

permissions.use('*', requireAuth);

permissions.get('/', requireResourcePermission('admin', ADMIN_RESOURCES.PERMISSIONS, 'read'), async (c) => {
  const category = c.req.query('category');
  const search = c.req.query('search')?.trim();

  const conditions = [];
  if (category && category !== 'all') {
    if (!PERMISSION_CATEGORIES.includes(category as (typeof PERMISSION_CATEGORIES)[number])) {
      return c.json({ error: 'Invalid category' }, 400);
    }
    conditions.push(eq(appPermissions.category, category));
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(appPermissions.key, pattern),
        ilike(appPermissions.label, pattern),
        ilike(appPermissions.description, pattern),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(appPermissions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(appPermissions.category), asc(appPermissions.label));

  return c.json({
    permissions: rows.map((row) => ({
      id: row.id,
      key: row.key,
      label: row.label,
      description: row.description,
      category: row.category,
      routePatterns: row.routePatterns ?? [],
      apiPatterns: row.apiPatterns ?? [],
      isSystem: row.isSystem,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  });
});

permissions.post('/', requireResourcePermission('admin', ADMIN_RESOURCES.PERMISSIONS, 'write'), async (c) => {
  const body = await c.req.json<{
    key?: string;
    label?: string;
    description?: string | null;
    category?: string;
    routePatterns?: string[];
    apiPatterns?: string[];
  }>();

  const key = body.key?.trim();
  const label = body.label?.trim();
  const category = body.category?.trim();
  if (!key || !label || !category) {
    return c.json({ error: 'key, label, and category are required' }, 400);
  }
  if (!PERMISSION_CATEGORIES.includes(category as (typeof PERMISSION_CATEGORIES)[number])) {
    return c.json({ error: 'Invalid category' }, 400);
  }

  const routePatterns = (body.routePatterns ?? []).map((item) => item.trim()).filter(Boolean);
  const apiPatterns = (body.apiPatterns ?? []).map((item) => item.trim()).filter(Boolean);

  const [row] = await db
    .insert(appPermissions)
    .values({
      key,
      label,
      description: body.description?.trim() || null,
      category,
      routePatterns,
      apiPatterns,
      isSystem: false,
    })
    .returning();

  return c.json({ permission: row }, 201);
});

permissions.patch('/:id', requireResourcePermission('admin', ADMIN_RESOURCES.PERMISSIONS, 'write'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    label?: string;
    description?: string | null;
    category?: string;
    routePatterns?: string[];
    apiPatterns?: string[];
  }>();

  const [existing] = await db.select().from(appPermissions).where(eq(appPermissions.id, id)).limit(1);
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const updates: Partial<typeof appPermissions.$inferInsert> = { updatedAt: new Date() };
  if (body.label !== undefined) {
    const label = body.label.trim();
    if (!label) return c.json({ error: 'label cannot be empty' }, 400);
    updates.label = label;
  }
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.category !== undefined) {
    if (!PERMISSION_CATEGORIES.includes(body.category as (typeof PERMISSION_CATEGORIES)[number])) {
      return c.json({ error: 'Invalid category' }, 400);
    }
    updates.category = body.category;
  }
  if (body.routePatterns !== undefined) {
    updates.routePatterns = body.routePatterns.map((item) => item.trim()).filter(Boolean);
  }
  if (body.apiPatterns !== undefined) {
    updates.apiPatterns = body.apiPatterns.map((item) => item.trim()).filter(Boolean);
  }

  const [row] = await db.update(appPermissions).set(updates).where(eq(appPermissions.id, id)).returning();
  return c.json({ permission: row });
});

permissions.delete('/:id', requireResourcePermission('admin', ADMIN_RESOURCES.PERMISSIONS, 'write'), async (c) => {
  const id = c.req.param('id');
  const [existing] = await db.select().from(appPermissions).where(eq(appPermissions.id, id)).limit(1);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.isSystem) return c.json({ error: 'System permissions cannot be deleted' }, 400);

  await db.delete(appPermissions).where(eq(appPermissions.id, id));
  return c.json({ ok: true });
});

export default permissions;
