import type { ChannelKnowledgeItem } from '../api/documents.ts';
import type { DocumentCaptureRecord } from '../api/documentCaptures.ts';
import { CapturePipelineStatus } from './CapturePipelineStatus.tsx';

type KnowledgePipelineStatusProps = {
  item: ChannelKnowledgeItem;
};

function captureItemToPipelineCapture(item: ChannelKnowledgeItem): DocumentCaptureRecord {
  return {
    id: item.id,
    channel_id: item.channel_id,
    title: item.title ?? item.name,
    brief: item.brief,
    participants_hint: null,
    recording_mode: null,
    audience: 'unknown',
    input_mode: item.input_mode === 'audio' ? 'audio' : 'transcript',
    status: item.status,
    metadata: {},
    segment_count: item.file_count,
    created_by: null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    pipeline_job: item.pipeline_job,
  };
}

export function KnowledgePipelineStatus({ item }: KnowledgePipelineStatusProps) {
  if (item.input_mode === 'document') {
    return (
      <span className={`document-status-badge status-${item.status}`}>
        {item.status.replace(/_/g, ' ')}
      </span>
    );
  }

  return (
    <CapturePipelineStatus capture={captureItemToPipelineCapture(item)} />
  );
}

export function knowledgeKindLabel(item: ChannelKnowledgeItem): string {
  switch (item.input_mode) {
    case 'document':
      return 'Document capture';
    case 'audio':
      return 'Audio capture';
    case 'transcript':
      return 'Transcript capture';
    default:
      return 'Capture';
  }
}
