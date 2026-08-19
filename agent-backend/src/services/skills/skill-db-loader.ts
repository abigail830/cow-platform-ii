import { and, eq } from 'drizzle-orm';
import { appSkillFiles, appSkills, db } from '../../db/index.ts';
import { isUuidSkillId } from './reserved-names.ts';

async function getSkillRowByRef(ref: string) {
  if (isUuidSkillId(ref)) {
    const [row] = await db.select().from(appSkills).where(eq(appSkills.id, ref)).limit(1);
    return row ?? null;
  }
  const slug = ref.trim();
  const [platform] = await db
    .select()
    .from(appSkills)
    .where(and(eq(appSkills.slug, slug), eq(appSkills.origin, 'platform')))
    .limit(1);
  if (platform) return platform;

  const [userSkill] = await db
    .select()
    .from(appSkills)
    .where(and(eq(appSkills.slug, slug), eq(appSkills.origin, 'user')))
    .limit(1);
  return userSkill ?? null;
}

export async function loadSkillRecordForRuntime(skillRef: string) {
  const row = await getSkillRowByRef(skillRef);
  if (!row || row.importStatus !== 'ready') return null;
  const files = await db
    .select()
    .from(appSkillFiles)
    .where(eq(appSkillFiles.skillId, row.id));
  return { row, files };
}
