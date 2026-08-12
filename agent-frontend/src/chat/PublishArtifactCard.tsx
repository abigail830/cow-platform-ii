import type { FlueConversationPart } from '@flue/react';
import { Download, File, Loader2 } from 'lucide-react';
import { iconProps } from '../components/icons/icon-props.ts';
import { normalizeAttachmentDownloadUrl, parsePublishArtifactOutput } from './published-artifacts.ts';

type DynamicToolPart = Extract<FlueConversationPart, { type: 'dynamic-tool' }>;

function formatArtifactSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function openArtifactDownload(downloadUrl: string): void {
  const resolved = normalizeAttachmentDownloadUrl(downloadUrl);
  window.open(resolved, '_blank', 'noopener,noreferrer');
}

type PublishArtifactCardProps = {
  tool: DynamicToolPart;
};

export function PublishArtifactCard({ tool }: PublishArtifactCardProps) {
  const loading = tool.state === 'input-available';
  const errored = tool.state === 'output-error';
  const artifact = !loading && !errored ? parsePublishArtifactOutput(tool.output) : null;
  const sizeLabel =
    artifact?.sizeBytes !== undefined ? formatArtifactSize(artifact.sizeBytes) : '';

  if (loading) {
    return (
      <div className="publish-artifact-card publish-artifact-card-loading" aria-live="polite">
        <div className="publish-artifact-card-icon" aria-hidden>
          <Loader2 {...iconProps({ size: 18, className: 'icon-btn-spin' })} />
        </div>
        <div className="publish-artifact-card-body">
          <p className="publish-artifact-card-title">Publishing deliverable…</p>
          <p className="publish-artifact-card-meta">Preparing download</p>
        </div>
      </div>
    );
  }

  if (errored) {
    return (
      <div className="publish-artifact-card publish-artifact-card-error" role="alert">
        <div className="publish-artifact-card-icon" aria-hidden>
          <File {...iconProps({ size: 18 })} />
        </div>
        <div className="publish-artifact-card-body">
          <p className="publish-artifact-card-title">Publish failed</p>
          <p className="publish-artifact-card-meta">{tool.errorText?.trim() || 'Could not publish file.'}</p>
        </div>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="publish-artifact-card publish-artifact-card-error" role="alert">
        <div className="publish-artifact-card-icon" aria-hidden>
          <File {...iconProps({ size: 18 })} />
        </div>
        <div className="publish-artifact-card-body">
          <p className="publish-artifact-card-title">Publish incomplete</p>
          <p className="publish-artifact-card-meta">No download URL was returned.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="publish-artifact-card publish-artifact-card-ready">
      <div className="publish-artifact-card-icon" aria-hidden>
        <File {...iconProps({ size: 18 })} />
      </div>
      <div className="publish-artifact-card-body">
        <p className="publish-artifact-card-title">{artifact.filename}</p>
        {sizeLabel ? <p className="publish-artifact-card-meta">{sizeLabel}</p> : null}
        <button
          type="button"
          className="btn-primary publish-artifact-card-download"
          onClick={() => openArtifactDownload(artifact.downloadUrl)}
        >
          <Download {...iconProps({ size: 16 })} aria-hidden />
          Download
        </button>
      </div>
    </div>
  );
}
