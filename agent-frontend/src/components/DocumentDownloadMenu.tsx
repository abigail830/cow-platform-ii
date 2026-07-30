import { useState } from 'react';
import { downloadDocument, downloadDocumentBundle } from '../api/documents.ts';
import { IconArchive, IconDownload } from './AdminActionIcons.tsx';

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
        className="icon-btn"
        title="Download original file"
        aria-label="Download original file"
        disabled={busy !== null}
        onClick={() => void handleDownloadOriginal()}
      >
        <IconDownload />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Download all artifacts (ZIP)"
        aria-label="Download all artifacts (ZIP)"
        disabled={busy !== null}
        onClick={() => void handleDownloadBundle()}
      >
        <IconArchive />
      </button>
    </>
  );
}
