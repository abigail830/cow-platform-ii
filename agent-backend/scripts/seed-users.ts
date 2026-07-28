import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { appAgentPermissions, appUsers, db } from '../src/db/index.ts';
import { closePool } from '../src/db/pool.ts';

const SEED_USERS = [
  {
    email: 'admin@example.com',
    password: 'admin123',
    displayName: 'Admin',
    role: 'admin' as const,
    agents: ['smart-proposal', 'generic-okf'],
  },
  {
    email: 'user@example.com',
    password: 'user123',
    displayName: 'Demo User',
    role: 'user' as const,
    agents: ['smart-proposal'],
  },
];

async function main() {
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
