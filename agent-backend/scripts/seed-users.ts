import './load-env.ts';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { appAgentPermissions, appRoles, appUserRoles, appUsers, db } from '../src/db/index.ts';
import { syncRbac } from '../src/db/sync-rbac.ts';
import { closePool } from '../src/db/pool.ts';

const SEED_USERS = [
  {
    email: 'admin@example.com',
    password: 'admin123',
    displayName: 'Admin',
    role: 'admin' as const,
    agents: ['smart-proposal', 'generic-okf'],
    rbacRoles: [] as string[],
  },
  {
    email: 'user@example.com',
    password: 'user123',
    displayName: 'Demo User',
    role: 'user' as const,
    agents: ['smart-proposal'],
    rbacRoles: [] as string[],
  },
  {
    email: 'player@example.com',
    password: 'player123',
    displayName: 'Agent Player',
    role: 'user' as const,
    agents: [] as string[],
    rbacRoles: ['agent-player'],
  },
  {
    email: 'km@example.com',
    password: 'km123',
    displayName: 'Knowledge Manager',
    role: 'user' as const,
    agents: [] as string[],
    rbacRoles: ['knowledge-manager'],
  },
];

async function assignRbacRoles(userId: string, roleKeys: string[]) {
  for (const roleKey of roleKeys) {
    const [role] = await db.select().from(appRoles).where(eq(appRoles.key, roleKey)).limit(1);
    if (!role) {
      console.warn(`  RBAC role not found: ${roleKey}`);
      continue;
    }
    await db
      .insert(appUserRoles)
      .values({ userId, roleId: role.id })
      .onConflictDoNothing();
  }
}

async function main() {
  await syncRbac();

  for (const seed of SEED_USERS) {
    const existing = await db.select().from(appUsers).where(eq(appUsers.email, seed.email)).limit(1);
    let userId: string;
    if (existing[0]) {
      userId = existing[0].id;
      console.log(`User exists: ${seed.email}`);
    } else {
      const hash = await bcrypt.hash(seed.password, 10);
      const [created] = await db
        .insert(appUsers)
        .values({
          email: seed.email,
          displayName: seed.displayName,
          passwordHash: hash,
          role: seed.role,
        })
        .returning();
      userId = created.id;
      console.log(`Created user: ${seed.email} / ${seed.password}`);
    }

    if (seed.role === 'user') {
      for (const agentName of seed.agents) {
        await db
          .insert(appAgentPermissions)
          .values({ userId, agentName })
          .onConflictDoNothing();
      }
    }

    if (seed.rbacRoles.length > 0) {
      await assignRbacRoles(userId, seed.rbacRoles);
    }
  }
}

main()
  .then(async () => {
    await closePool();
    console.log('Seed complete.');
  })
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
