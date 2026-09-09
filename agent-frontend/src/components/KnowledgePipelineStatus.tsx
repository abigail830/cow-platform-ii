import type { ChannelKnowledgeItem } from '../api/documents.ts';
import type { DocumentCaptureRecord } from '../api/documentCaptures.ts';
import {
  knowledgeItemSegmentDocumentStatus,
  knowledgeItemUsesSegmentPipeline,
  shouldShowKnowledgePostProcessPipeline,
  shouldShowKnowledgeSegmentPipeline,
} from '../api/knowledge-item-pipeline.ts';
import { AudioPipelineStatus } from './AudioPipelineStatus.tsx';
import { CapturePipelineStatus } from './CapturePipelineStatus.tsx';
import { DocumentPipelineStatus } from './DocumentPipelineStatus.tsx';

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
    input_mode: item.input_mode,
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
  if (knowledgeItemUsesSegmentPipeline(item) && item.input_mode === 'document') {
    return (
      <DocumentPipelineStatus
        compact
        showPipelineTrack
        document={{
          id: item.primary_segment_id ?? item.id,
          channel_id: item.channel_id,
          name: item.title || item.name,
          file_type: '',
          size_bytes: item.size_bytes,
          file_hash: '',
          s3_key: '',
          status: knowledgeItemSegmentDocumentStatus(item),
          metadata: {},
          uploaded_by: null,
          created_at: item.created_at,
          updated_at: item.updated_at,
          pipeline_job: item.segment_pipeline_job,
        }}
      />
    );
  }

  if (shouldShowKnowledgeSegmentPipeline(item)) {
    if (item.input_mode === 'audio') {
      return (
        <AudioPipelineStatus
          compact
          showPipelineTrack
          audio={{
            id: item.primary_segment_id ?? item.id,
            status: knowledgeItemSegmentDocumentStatus(item),
            pipeline_job: item.segment_pipeline_job,
          }}
        />
      );
    }
  }

  if (shouldShowKnowledgePostProcessPipeline(item)) {
    return <CapturePipelineStatus capture={captureItemToPipelineCapture(item)} errorLayout="stack" />;
  }

  return (
    <span className={`document-status-badge status-${item.status}`}>
      {item.status.replace(/_/g, ' ')}
    </span>
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
