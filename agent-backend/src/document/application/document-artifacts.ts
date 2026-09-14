import { eq } from 'drizzle-orm';
import { appDocuments, db } from '../../infrastructure/db/index.ts';
import { getStorageUploadUrl } from '../infrastructure/document-files.ts';
import { getDocumentById } from './documents.ts';
import {
  assertDocumentArtifactS3Key,
  buildDocumentArtifactKey,
  documentArtifactFile,
  parseDocumentArtifactKind,
  type DocumentArtifactKind,
} from '../domain/document-artifacts.ts';

export type DocumentArtifactUploadInit = {
  artifact: DocumentArtifactKind;
  s3_key: string;
  upload_url: string;
  method: 'PUT';
  headers: { 'Content-Type': string };
};

/** Mint a presigned PUT. Signing is local — do not HEAD/GET/PUT OSS here. */
export async function initDocumentArtifactUpload(
  documentId: string,
  artifact: unknown,
): Promise<DocumentArtifactUploadInit> {
  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error('Document not found');

  const kind = parseDocumentArtifactKind(artifact);
  const file = documentArtifactFile(kind);
  const s3Key = buildDocumentArtifactKey(doc.s3Key, kind);
  const uploadUrl = await getStorageUploadUrl(s3Key, file.contentType);

  return {
    artifact: kind,
    s3_key: s3Key,
    upload_url: uploadUrl,
    method: 'PUT',
    headers: { 'Content-Type': file.contentType },
  };
}

export async function finalizeDocumentArtifactUpdate(
  documentId: string,
  artifact: unknown,
  s3Key: string,
): Promise<{ ok: true; key: string }> {
  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error('Document not found');

  const kind = parseDocumentArtifactKind(artifact);
  const key = assertDocumentArtifactS3Key(doc.s3Key, kind, s3Key);

  await db.update(appDocuments).set({ updatedAt: new Date() }).where(eq(appDocuments.id, doc.id));
  return { ok: true, key };
}
