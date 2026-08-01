import { Download } from 'lucide-react';
import type { PublishedArtifact } from '../chat/published-artifacts.ts';
import { normalizeAttachmentDownloadUrl } from '../chat/published-artifacts.ts';
import { iconProps } from './icons/icon-props.ts';

type ArtifactDownloadLinkProps = {
  artifact: PublishedArtifact;
};

export function ArtifactDownloadLink({ artifact }: ArtifactDownloadLinkProps) {
  const href = normalizeAttachmentDownloadUrl(artifact.downloadUrl);

  return (
    <a className="artifact-download-link" href={href} target="_blank" rel="noopener noreferrer" download>
      <Download {...iconProps({ size: 14 })} />
      <span>{artifact.filename}</span>
    </a>
  );
}
