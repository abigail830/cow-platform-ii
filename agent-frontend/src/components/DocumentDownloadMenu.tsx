import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { downloadDocument, downloadDocumentBundle } from '../api/documents.ts';
import { IconArchive, IconDownload } from './AdminActionIcons.tsx';
import { iconProps } from './icons/icon-props.ts';

type DocumentDownloadActionsProps = {
  documentId: string;
  documentName: string;
  onError: (message: string) => void;
};

export function DocumentDownloadActions({
  documentId,
  documentName,
  onError,
}: DocumentDownloadActionsProps) {
  const [busy, setBusy] = useState<'original' | 'bundle' | null>(null);

  async function handleDownloadOriginal() {
    setBusy('original');
    onError('');
    try {
      await downloadDocument(documentId);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to download document');
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadBundle() {
    setBusy('bundle');
    onError('');
    try {
      await downloadDocumentBundle(documentId, documentName);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to download bundle');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`icon-btn${busy === 'original' ? ' is-busy' : ''}`}
        title={busy === 'original' ? 'Downloading…' : 'Download original file'}
        aria-label="Download original file"
        disabled={busy !== null}
        aria-busy={busy === 'original'}
        onClick={() => void handleDownloadOriginal()}
      >
        {busy === 'original' ? (
          <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
        ) : (
          <IconDownload />
        )}
      </button>
      <button
        type="button"
        className={`icon-btn${busy === 'bundle' ? ' is-busy' : ''}`}
        title={busy === 'bundle' ? 'Preparing ZIP…' : 'Download all artifacts (ZIP)'}
        aria-label="Download all artifacts (ZIP)"
        disabled={busy !== null}
        aria-busy={busy === 'bundle'}
        onClick={() => void handleDownloadBundle()}
      >
        {busy === 'bundle' ? (
          <Loader2 {...iconProps({ className: 'icon-btn-spin' })} />
        ) : (
          <IconArchive />
        )}
      </button>
    </>
  );
}
