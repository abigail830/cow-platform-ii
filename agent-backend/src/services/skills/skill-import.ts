import { eq } from 'drizzle-orm';
import { readStorageBuffer } from '../../storage/document-content.ts';
import { MAX_SKILL_EXTRACTED_BYTES } from '../../storage/skill-files.ts';
import { appSkillFiles, appSkills, db } from '../../db/index.ts';
import { parseSkillZipBuffer } from './parse-skill-zip.ts';
import { getReservedSkillNames } from './reserved-names.ts';
import { isServerlessRuntime } from '../pipeline/pipeline-worker-mode.ts';

export async function runSkillImport(skillId: string): Promise<void> {
  const [row] = await db.select().from(appSkills).where(eq(appSkills.id, skillId)).limit(1);
  if (!row) return;
  if (row.importStatus === 'ready') return;
  if (!row.sourceS3Key) {
    await db
      .update(appSkills)
      .set({
        importStatus: 'failed',
        importError: 'Missing source archive',
        updatedAt: new Date(),
      })
      .where(eq(appSkills.id, skillId));
    return;
  }

  try {
    const buffer = await readStorageBuffer(row.sourceS3Key);
    if (!buffer) {
      throw new Error('Uploaded ZIP not found in storage');
    }

    const parsed = parseSkillZipBuffer(buffer, {
      reservedNames: getReservedSkillNames(),
      maxExtractedBytes: MAX_SKILL_EXTRACTED_BYTES,
    });

    await db.transaction(async (tx) => {
      await tx
        .update(appSkills)
        .set({
          slug: parsed.name,
          title: parsed.title,
          description: parsed.description,
          instructions: parsed.instructions,
          license: parsed.license ?? null,
          compatibility: parsed.compatibility ?? null,
          metadata: parsed.metadata,
          importStatus: 'ready',
          importError: null,
          updatedAt: new Date(),
        })
        .where(eq(appSkills.id, skillId));

      await tx.delete(appSkillFiles).where(eq(appSkillFiles.skillId, skillId));

      if (parsed.files.length > 0) {
        await tx.insert(appSkillFiles).values(
          parsed.files.map((file) => ({
            skillId,
            filePath: file.path,
            content: file.content,
            contentType: file.contentType,
          })),
        );
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Skill import failed';
    await db
      .update(appSkills)
      .set({
        importStatus: 'failed',
        importError: message.slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(appSkills.id, skillId));
  }
}

export function dispatchSkillImport(skillId: string): void {
  const run = () => {
    void runSkillImport(skillId).catch((error) => {
      console.error(`[skill-import] failed for ${skillId}:`, error);
    });
  };

  if (isServerlessRuntime()) {
    // Best-effort background import; local long-running servers import inline below.
    run();
    return;
  }

  run();
}
