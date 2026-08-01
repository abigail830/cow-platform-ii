/** Built-in pipelines not stored in app_pipeline_configs (read-only catalog). */

export type SystemPipelineTemplate = {
  id: string;
  name: string;
  description: string;
  pipelineName: string;
  commandTemplate: string;
  category: 'knowledge' | 'document';
  boundTo: string;
  workflowFile: string | null;
  isEnabled: true;
  isSystem: true;
};

export const SYSTEM_PIPELINE_TEMPLATES: readonly SystemPipelineTemplate[] = [
  {
    id: 'system:kb-pageindex-import',
    name: 'PageIndex KB Import',
    description:
      'Imports parsed artifacts from object storage into PageIndex knowledge bases.',
    pipelineName: 'kb-pageindex-import',
    commandTemplate: 'openkms-cli kb pageindex-import --job-id {job_id}',
    category: 'knowledge',
    boundTo: 'KnowledgeBase (type: page_index)',
    workflowFile: 'openkms-kb-pageindex-import.yml',
    isEnabled: true,
    isSystem: true,
  },
];

export function listSystemPipelineTemplates(search?: string): SystemPipelineTemplate[] {
  const q = search?.trim().toLowerCase();
  if (!q) return [...SYSTEM_PIPELINE_TEMPLATES];

  return SYSTEM_PIPELINE_TEMPLATES.filter((row) => {
    const haystack = [
      row.name,
      row.description,
      row.pipelineName,
      row.commandTemplate,
      row.boundTo,
      row.workflowFile ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** PageIndex knowledge bases always use the KB import system pipeline. */
export const PAGE_INDEX_KB_PIPELINE_NAME = 'kb-pageindex-import';
