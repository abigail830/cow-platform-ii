import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveSessionFilesRoot } from './config.ts';
import { sanitizeFilename } from './constants.ts';

function instanceRoot(instanceId: string): string {
  const safe = instanceId.replace(/[^a-zA-Z0-9._@-]/g, '_');
  return path.join(resolveSessionFilesRoot(), safe);
}

function uploadsDir(instanceId: string): string {
  return path.join(instanceRoot(instanceId), 'uploads');
}

export function localOriginalPath(instanceId: string, fileId: string, filename: string): string {
  return path.join(uploadsDir(instanceId), `${fileId}__${sanitizeFilename(filename)}`);
}

export function localContentCachePath(instanceId: string, fileId: string): string {
  return path.join(uploadsDir(instanceId), `${fileId}.content.txt`);
}

export async function writeLocalOriginal(
  instanceId: string,
  fileId: string,
  filename: string,
  bytes: Buffer,
): Promise<string> {
  const dir = uploadsDir(instanceId);
  await mkdir(dir, { recursive: true });
  const filePath = localOriginalPath(instanceId, fileId, filename);
  await writeFile(filePath, bytes);
  return filePath;
}

export async function readLocalFile(absolutePath: string): Promise<Buffer> {
  return readFile(absolutePath);
}

export async function writeLocalContentCache(
  instanceId: string,
  fileId: string,
  text: string,
): Promise<string> {
  const filePath = localContentCachePath(instanceId, fileId);
  await mkdir(uploadsDir(instanceId), { recursive: true });
  await writeFile(filePath, text, 'utf8');
  return filePath;
}

export async function deleteLocalPaths(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async (filePath) => {
      try {
        await unlink(filePath);
      } catch {
        // ignore missing files
      }
    }),
  );
}
