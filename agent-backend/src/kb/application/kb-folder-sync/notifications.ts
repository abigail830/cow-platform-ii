import { appUserNotifications, db, type UserNotificationAction } from '../../../infrastructure/db/index.ts';

export async function notifyFolderSyncPartialFailure(input: {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  importJobId: string;
  failedDocuments: Array<{
    document_id: string;
    document_name: string;
    error_message: string | null;
  }>;
  notifyUserId: string | null;
}): Promise<void> {
  if (!input.notifyUserId || input.failedDocuments.length === 0) return;

  const count = input.failedDocuments.length;
  const names = input.failedDocuments
    .slice(0, 5)
    .map((d) => d.document_name)
    .join(', ');
  const suffix = count > 5 ? ` and ${count - 5} more` : '';

  const actions: UserNotificationAction[] = [
    {
      type: 'retry_folder_sync',
      label: `Retry failed (${count})`,
      payload: {
        knowledge_base_id: input.knowledgeBaseId,
        document_ids: input.failedDocuments.map((d) => d.document_id),
      },
    },
    {
      type: 'navigate',
      label: 'Open knowledge base',
      payload: {
        path: `/knowledge/knowledge-bases/${input.knowledgeBaseId}`,
      },
    },
  ];

  await db.insert(appUserNotifications).values({
    userId: input.notifyUserId,
    category: 'kb_folder_sync',
    severity: count === input.failedDocuments.length ? 'warning' : 'error',
    title: `Folder sync: ${count} document(s) failed`,
    body: `${count} document(s) failed to sync into "${input.knowledgeBaseName}" (${names}${suffix}). Successful imports were kept.`,
    actions,
    metadata: {
      import_job_id: input.importJobId,
      failed_documents: input.failedDocuments,
    },
    sourceType: 'kb_folder_sync',
    sourceId: input.knowledgeBaseId,
  });
}
